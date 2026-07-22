/**
 * Expansion Operations Center — server orchestration (SERVER ONLY).
 *
 * Reuses the exact intake pipeline (evaluateFundRequest + classifyFund +
 * fetchFundSupport) plus the verified dynamic-fund store, so imports, approvals,
 * edits, and retries all resolve to one real lifecycle state. Approving inserts
 * a VERIFIED dynamic fund → the merged universe updates live (no redeploy).
 * Never fabricates classification data.
 */
import type { createServerClient } from "./supabase";
import {
  fundRequestActive, fundRequestCreate, fundRequestSetStatus, dynamicFundInsert, dynamicFundByTicker,
  type FundRequestRow,
} from "./db";
import { evaluateFundRequest, ACTIVE_STATUSES } from "./fundRequests";
import { findMergedFund } from "./universeServer";
import { classifyFund } from "./classify";
import { validateFields } from "./classify/core.js";
import { fetchFundSupport } from "./fmp";
import { legacyCategory, benchmarkFor } from "./universe";
import { opsBucket, type OpsBucket } from "./expansionOps";
import taxonomyRaw from "@/../data/config/fund-taxonomy.json";

type Supa = Awaited<ReturnType<typeof createServerClient>>;
const taxonomy = taxonomyRaw as Record<string, string[] | string>;

export interface TickerOutcome { ticker: string; status: string; bucket: OpsBucket; fundName: string | null }

const evalDeps = () => ({
  lookupUniverse: (t: string) => findMergedFund(t),
  checkFmp: (t: string) => fetchFundSupport(t),
  classify: classifyFund,
});

/** Full intake for one ticker: evaluate → persist → insert on verified. */
export async function processTicker(sb: Supa, firmId: string, userId: string, rawTicker: string): Promise<TickerOutcome> {
  const outcome = await evaluateFundRequest(rawTicker, evalDeps());
  if (!outcome.ok) return { ticker: String(rawTicker).toUpperCase().trim(), status: "failed", bucket: "failed", fundName: null };
  const r = outcome.result;

  if (r.status === "already_available") return { ticker: r.normalized, status: "already_available", bucket: "duplicate", fundName: r.fundName };

  // An open request already exists → duplicate (don't create a second row).
  const existing = await fundRequestActive(sb, firmId, r.normalized, ACTIVE_STATUSES);
  if (existing) return { ticker: r.normalized, status: existing.status, bucket: "duplicate", fundName: existing.fund_name };

  const request = await fundRequestCreate(sb, firmId, userId, {
    ticker: r.normalized, normalizedTicker: r.normalized, status: r.status,
    fundName: r.fundName, fmpSupported: r.fmpSupported, alreadyInUniverse: r.alreadyInUniverse,
    classificationStatus: r.classificationStatus, failureReason: r.failureReason,
  });

  if (r.status === "added_to_universe" && r.classification?.status === "verified") {
    const f = r.classification.fields!;
    await insertVerified(sb, firmId, userId, r.normalized, r.fundName ?? r.normalized, r.vehicle, {
      asset_class: f.asset_class, primary_category: f.primary_category, region: f.region,
      management_style: f.management_style, portfolio_role: f.portfolio_role, investment_focus: f.investment_focus,
      benchmark_category: f.benchmark_category, market_cap: f.market_cap, style: f.style, style_box: f.style_box,
    }, r.classification.category, r.classification.benchmark, r.classification.source ?? "rule-based", request.id);
  }
  return { ticker: r.normalized, status: r.status, bucket: opsBucket(r.status), fundName: r.fundName };
}

type EditFields = {
  asset_class: string; primary_category: string; region: string; management_style: string;
  portfolio_role: string; investment_focus: string; benchmark_category: string;
  market_cap?: string | null; style?: string | null; style_box?: string | null;
};

/** Insert (or no-op if already present) a VERIFIED dynamic fund. */
async function insertVerified(sb: Supa, firmId: string, userId: string, ticker: string, name: string,
  vehicle: string | null, f: EditFields, category: string | null, benchmark: string | null,
  source: string, requestId: string): Promise<void> {
  const already = await dynamicFundByTicker(sb, ticker).catch(() => null);
  if (already) return; // already in the verified universe — nothing to insert
  await dynamicFundInsert(sb, firmId, userId, {
    ticker, fundName: name, vehicle,
    assetClass: f.asset_class, primaryCategory: f.primary_category, category: category ?? legacyCategory(f.primary_category),
    benchmark: benchmark ?? benchmarkFor(f.asset_class, f.region), benchmarkCategory: f.benchmark_category,
    managementStyle: f.management_style, portfolioRole: f.portfolio_role, investmentFocus: f.investment_focus,
    region: f.region, marketCap: f.market_cap ?? null, style: f.style ?? null, styleBox: f.style_box ?? null,
    classificationSource: source, sourceRequestId: requestId, fmpPayloadSummary: { name, vehicle },
  });
}

/** Approve a review item using the system's inferred (or suggested) values. */
export async function approveRequest(sb: Supa, firmId: string, userId: string, req: FundRequestRow):
  Promise<{ ok: boolean; reason?: string }> {
  // Re-derive the classification live (same rules) for accurate fields + vehicle.
  const outcome = await evaluateFundRequest(req.normalized_ticker, evalDeps());
  if (!outcome.ok) return { ok: false, reason: "Could not re-evaluate ticker." };
  const r = outcome.result;
  const cls = r.classification;
  const fields = cls?.fields;
  if (!fields || !fields.asset_class || !fields.primary_category) {
    return { ok: false, reason: "No suggested classification to approve — use Edit & Approve." };
  }
  await insertVerified(sb, firmId, userId, req.normalized_ticker, r.fundName ?? req.fund_name ?? req.normalized_ticker, r.vehicle, {
    asset_class: fields.asset_class, primary_category: fields.primary_category, region: fields.region,
    management_style: fields.management_style, portfolio_role: fields.portfolio_role, investment_focus: fields.investment_focus,
    benchmark_category: fields.benchmark_category, market_cap: fields.market_cap, style: fields.style, style_box: fields.style_box,
  }, cls?.category ?? null, cls?.benchmark ?? null, cls?.source ?? "rule-based-approved", req.id);
  await fundRequestSetStatus(sb, firmId, req.id, "added_to_universe", { classificationStatus: "approved", failureReason: null });
  return { ok: true };
}

/** Approve a review item with operator-edited (taxonomy-validated) values. */
export async function editApproveRequest(sb: Supa, firmId: string, userId: string, req: FundRequestRow, edit: EditFields):
  Promise<{ ok: boolean; reason?: string }> {
  const invalid = validateFields(edit as unknown as Record<string, unknown>, taxonomy);
  if (invalid.length) return { ok: false, reason: `Invalid taxonomy value(s): ${invalid.join(", ")}` };
  // Vehicle/name from the provider (best-effort; classification is operator-set).
  const support = await fetchFundSupport(req.normalized_ticker).catch(() => null);
  const name = support?.name ?? req.fund_name ?? req.normalized_ticker;
  const vehicle = support?.assetType && support.assetType !== "Unknown" ? support.assetType : null;
  await insertVerified(sb, firmId, userId, req.normalized_ticker, name, vehicle, edit, null, null, "manual-review", req.id);
  await fundRequestSetStatus(sb, firmId, req.id, "added_to_universe", { classificationStatus: "manual", failureReason: null });
  return { ok: true };
}

/** Retry a failed import: re-run intake and update the request in place. */
export async function retryRequest(sb: Supa, firmId: string, userId: string, req: FundRequestRow):
  Promise<{ ok: boolean; status: string }> {
  const outcome = await evaluateFundRequest(req.normalized_ticker, evalDeps());
  if (!outcome.ok) return { ok: false, status: req.status };
  const r = outcome.result;

  if (r.status === "added_to_universe" && r.classification?.status === "verified") {
    const f = r.classification.fields!;
    await insertVerified(sb, firmId, userId, r.normalized, r.fundName ?? r.normalized, r.vehicle, {
      asset_class: f.asset_class, primary_category: f.primary_category, region: f.region,
      management_style: f.management_style, portfolio_role: f.portfolio_role, investment_focus: f.investment_focus,
      benchmark_category: f.benchmark_category, market_cap: f.market_cap, style: f.style, style_box: f.style_box,
    }, r.classification.category, r.classification.benchmark, r.classification.source ?? "rule-based", req.id);
  }
  await fundRequestSetStatus(sb, firmId, req.id, r.status, {
    classificationStatus: r.classificationStatus, failureReason: r.failureReason,
  });
  return { ok: true, status: r.status };
}
