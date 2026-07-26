/**
 * Add Missing Fund — request evaluation logic.
 *
 * `evaluateFundRequest` is dependency-injected (universe lookup + provider support
 * check are passed in), so it is pure/deterministic and testable without any
 * network or database. The API route wires the real universe (`findFund`) and
 * the real Tiingo support check, then persists via db.ts.
 *
 * This module NEVER mutates the verified fund universe. A provider-supported ticker
 * that isn't in the universe lands in `ready_for_review` for the offline
 * pipeline + a human — nothing is auto-added to production.
 */
import { normalizeTicker } from "./tickerNormalize";
import type { UniverseFund } from "./universe";
import type { FundSupport } from "./market-data/fundSupport";
import type { RuntimeClassification } from "./classify";

export type FundRequestStatus =
  | "pending"              // checks could not complete (e.g. provider unavailable) — retryable
  | "already_available"    // already in the merged universe (no request stored)
  | "provider_supported"        // provider has it (reserved intermediate state)
  | "needs_classification" // provider-supported but the classifier could not confidently classify
  | "ready_for_review"     // provider-supported, no runtime classifier available — pipeline review
  | "approved"             // admin approved (added via pipeline later)
  | "rejected"             // admin rejected
  | "unsupported"          // provider cannot return usable data
  | "classification_failed"// classifier errored
  | "added_to_universe"    // classified + validated → stored as a verified dynamic fund
  | "failed_validation";   // classified but produced a non-controlled taxonomy value

/** The verified-universe metadata surfaced when a ticker already exists. */
export interface ExistingFund {
  ticker: string;
  name: string;
  vehicle: string;
  category: string;
  primary_category: string;
}

export interface FundRequestEval {
  normalized: string;
  status: FundRequestStatus;
  fundName: string | null;
  providerSupported: boolean;
  alreadyInUniverse: boolean;
  classificationStatus: string | null;
  failureReason: string | null;
  existingFund: ExistingFund | null;
  vehicle: string | null;                          // provider asset type, when known
  classification: RuntimeClassification | null;    // present when classified → add
}

export interface EvaluateDeps {
  /** Merged-universe lookup (static base + verified dynamic). May be async. */
  lookupUniverse: (normalized: string) => UniverseFund | undefined | Promise<UniverseFund | undefined>;
  checkSupport: (normalized: string) => Promise<FundSupport>;
  /** Runtime classifier. When omitted, supported funds stop at ready_for_review
      (offline-pipeline review) instead of being auto-added. */
  classify?: (input: { normalizedTicker: string; name: string; fundType: string | null }) => RuntimeClassification;
}

export type EvaluateOutcome =
  | { ok: true; result: FundRequestEval }
  | { ok: false; reason: string };

export async function evaluateFundRequest(raw: unknown, deps: EvaluateDeps): Promise<EvaluateOutcome> {
  const norm = normalizeTicker(raw);
  if (!norm.ok) return { ok: false, reason: norm.reason ?? "Invalid ticker." };
  const t = norm.normalized;

  const blank = { normalized: t, vehicle: null as string | null, existingFund: null, classification: null };

  // 1) Already in the merged universe → no request stored.
  const existing = await deps.lookupUniverse(t);
  if (existing) {
    return {
      ok: true,
      result: {
        ...blank, status: "already_available", fundName: existing.name,
        providerSupported: true, alreadyInUniverse: true, classificationStatus: "classified",
        failureReason: null, vehicle: existing.vehicle,
        existingFund: {
          ticker: existing.ticker, name: existing.name, vehicle: existing.vehicle,
          category: existing.category, primary_category: existing.primary_category,
        },
      },
    };
  }

  // 2) Not in universe — ask the provider whether it can return usable data.
  const support = await deps.checkSupport(t);
  const vehicle = support.assetType && support.assetType !== "Unknown" ? support.assetType : null;

  if (support.inconclusive) {
    return { ok: true, result: {
      ...blank, status: "pending", fundName: support.name, providerSupported: false, alreadyInUniverse: false,
      classificationStatus: null, failureReason: support.reason ?? "Provider check could not complete.", vehicle,
    } };
  }

  if (!support.supported) {
    return { ok: true, result: {
      ...blank, status: "unsupported", fundName: support.name, providerSupported: false, alreadyInUniverse: false,
      classificationStatus: null, failureReason: support.reason ?? "Not supported by the data provider.", vehicle,
    } };
  }

  // 3) Provider-supported but not in the universe.
  //    No runtime classifier available → queue for offline-pipeline review.
  if (!deps.classify) {
    return { ok: true, result: {
      ...blank, status: "ready_for_review", fundName: support.name, providerSupported: true, alreadyInUniverse: false,
      classificationStatus: "pending", failureReason: null, vehicle,
    } };
  }

  // 4) Classify with the SAME rules + taxonomy as the offline pipeline.
  let cls: RuntimeClassification;
  try {
    cls = deps.classify({ normalizedTicker: t, name: support.name ?? t, fundType: support.assetType });
  } catch {
    return { ok: true, result: {
      ...blank, status: "classification_failed", fundName: support.name, providerSupported: true, alreadyInUniverse: false,
      classificationStatus: "error", failureReason: "The classifier failed to run.", vehicle,
    } };
  }

  if (cls.status === "verified") {
    // The classifier is confident on the NAME, but the provider could not
    // establish the vehicle (ETF vs mutual fund) and the ticker is not yet in
    // the canonical universe. Do NOT auto-approve on a guessed/unknown vehicle —
    // route to human review with the verified evidence preserved.
    if (!vehicle) {
      return { ok: true, result: {
        ...blank, status: "needs_classification", fundName: support.name, providerSupported: true, alreadyInUniverse: false,
        classificationStatus: "needs_classification",
        failureReason: "Provider cannot confirm the fund vehicle (ETF vs mutual fund); needs review.",
        vehicle, classification: cls,
      } };
    }
    // Confident + taxonomy-valid + known vehicle → add as a verified dynamic fund.
    return { ok: true, result: {
      ...blank, status: "added_to_universe", fundName: support.name, providerSupported: true, alreadyInUniverse: false,
      classificationStatus: "verified", failureReason: null, vehicle, classification: cls,
    } };
  }
  if (cls.status === "invalid_taxonomy") {
    return { ok: true, result: {
      ...blank, status: "failed_validation", fundName: support.name, providerSupported: true, alreadyInUniverse: false,
      classificationStatus: "invalid_taxonomy", failureReason: cls.reason, vehicle, classification: cls,
    } };
  }
  // needs_classification — rules couldn't confidently classify; do NOT add.
  return { ok: true, result: {
    ...blank, status: "needs_classification", fundName: support.name, providerSupported: true, alreadyInUniverse: false,
    classificationStatus: "needs_classification", failureReason: cls.reason, vehicle, classification: cls,
  } };
}

/** Statuses that count as an open/active request (block duplicates). */
export const ACTIVE_STATUSES: FundRequestStatus[] = [
  "pending", "provider_supported", "needs_classification", "ready_for_review",
];

export function isActiveStatus(s: string): boolean {
  return (ACTIVE_STATUSES as string[]).includes(s);
}
