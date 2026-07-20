/**
 * Add Missing Fund — request evaluation logic.
 *
 * `evaluateFundRequest` is dependency-injected (universe lookup + FMP support
 * check are passed in), so it is pure/deterministic and testable without any
 * network or database. The API route wires the real universe (`findFund`) and
 * the real provider (`fetchFundSupport`), then persists via db.ts.
 *
 * This module NEVER mutates the verified fund universe. An FMP-supported ticker
 * that isn't in the universe lands in `ready_for_review` for the offline
 * pipeline + a human — nothing is auto-added to production.
 */
import { normalizeTicker } from "./tickerNormalize";
import type { UniverseFund } from "./universe";
import type { FundSupport } from "./fmp";
import type { RuntimeClassification } from "./classify";

export type FundRequestStatus =
  | "pending"              // checks could not complete (e.g. provider unavailable) — retryable
  | "already_available"    // already in the merged universe (no request stored)
  | "fmp_supported"        // provider has it (reserved intermediate state)
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
  fmpSupported: boolean;
  alreadyInUniverse: boolean;
  classificationStatus: string | null;
  failureReason: string | null;
  existingFund: ExistingFund | null;
  vehicle: string | null;                          // FMP asset type, when known
  classification: RuntimeClassification | null;    // present when classified → add
}

export interface EvaluateDeps {
  /** Merged-universe lookup (static base + verified dynamic). May be async. */
  lookupUniverse: (normalized: string) => UniverseFund | undefined | Promise<UniverseFund | undefined>;
  checkFmp: (normalized: string) => Promise<FundSupport>;
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
        fmpSupported: true, alreadyInUniverse: true, classificationStatus: "classified",
        failureReason: null, vehicle: existing.vehicle,
        existingFund: {
          ticker: existing.ticker, name: existing.name, vehicle: existing.vehicle,
          category: existing.category, primary_category: existing.primary_category,
        },
      },
    };
  }

  // 2) Not in universe — ask the provider whether it can return usable data.
  const fmp = await deps.checkFmp(t);
  const vehicle = fmp.assetType && fmp.assetType !== "Unknown" ? fmp.assetType : null;

  if (fmp.inconclusive) {
    return { ok: true, result: {
      ...blank, status: "pending", fundName: fmp.name, fmpSupported: false, alreadyInUniverse: false,
      classificationStatus: null, failureReason: fmp.reason ?? "Provider check could not complete.", vehicle,
    } };
  }

  if (!fmp.supported) {
    return { ok: true, result: {
      ...blank, status: "unsupported", fundName: fmp.name, fmpSupported: false, alreadyInUniverse: false,
      classificationStatus: null, failureReason: fmp.reason ?? "Not supported by the data provider.", vehicle,
    } };
  }

  // 3) Provider-supported but not in the universe.
  //    No runtime classifier available → queue for offline-pipeline review.
  if (!deps.classify) {
    return { ok: true, result: {
      ...blank, status: "ready_for_review", fundName: fmp.name, fmpSupported: true, alreadyInUniverse: false,
      classificationStatus: "pending", failureReason: null, vehicle,
    } };
  }

  // 4) Classify with the SAME rules + taxonomy as the offline pipeline.
  let cls: RuntimeClassification;
  try {
    cls = deps.classify({ normalizedTicker: t, name: fmp.name ?? t, fundType: fmp.assetType });
  } catch {
    return { ok: true, result: {
      ...blank, status: "classification_failed", fundName: fmp.name, fmpSupported: true, alreadyInUniverse: false,
      classificationStatus: "error", failureReason: "The classifier failed to run.", vehicle,
    } };
  }

  if (cls.status === "verified") {
    // Confident + taxonomy-valid → add as a verified dynamic fund.
    return { ok: true, result: {
      ...blank, status: "added_to_universe", fundName: fmp.name, fmpSupported: true, alreadyInUniverse: false,
      classificationStatus: "verified", failureReason: null, vehicle, classification: cls,
    } };
  }
  if (cls.status === "invalid_taxonomy") {
    return { ok: true, result: {
      ...blank, status: "failed_validation", fundName: fmp.name, fmpSupported: true, alreadyInUniverse: false,
      classificationStatus: "invalid_taxonomy", failureReason: cls.reason, vehicle, classification: cls,
    } };
  }
  // needs_classification — rules couldn't confidently classify; do NOT add.
  return { ok: true, result: {
    ...blank, status: "needs_classification", fundName: fmp.name, fmpSupported: true, alreadyInUniverse: false,
    classificationStatus: "needs_classification", failureReason: cls.reason, vehicle, classification: cls,
  } };
}

/** Statuses that count as an open/active request (block duplicates). */
export const ACTIVE_STATUSES: FundRequestStatus[] = [
  "pending", "fmp_supported", "needs_classification", "ready_for_review",
];

export function isActiveStatus(s: string): boolean {
  return (ACTIVE_STATUSES as string[]).includes(s);
}
