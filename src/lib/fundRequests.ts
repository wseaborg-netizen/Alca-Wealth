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

export type FundRequestStatus =
  | "pending"              // checks could not complete (e.g. provider unavailable) — retryable
  | "already_available"    // already in the verified universe (no request stored)
  | "fmp_supported"        // provider has it (reserved intermediate state)
  | "needs_classification" // reference data exists but taxonomy/classification pending
  | "ready_for_review"     // provider-supported, not in universe — awaiting pipeline + review
  | "approved"             // admin approved (added via pipeline later)
  | "rejected"             // admin rejected
  | "unsupported";         // provider cannot return usable data

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
}

export interface EvaluateDeps {
  lookupUniverse: (normalized: string) => UniverseFund | undefined;
  checkFmp: (normalized: string) => Promise<FundSupport>;
}

export type EvaluateOutcome =
  | { ok: true; result: FundRequestEval }
  | { ok: false; reason: string };

export async function evaluateFundRequest(raw: unknown, deps: EvaluateDeps): Promise<EvaluateOutcome> {
  const norm = normalizeTicker(raw);
  if (!norm.ok) return { ok: false, reason: norm.reason ?? "Invalid ticker." };
  const t = norm.normalized;

  // 1) Already in the verified universe → no request stored.
  const existing = deps.lookupUniverse(t);
  if (existing) {
    return {
      ok: true,
      result: {
        normalized: t, status: "already_available", fundName: existing.name,
        fmpSupported: true, alreadyInUniverse: true, classificationStatus: "classified",
        failureReason: null,
        existingFund: {
          ticker: existing.ticker, name: existing.name, vehicle: existing.vehicle,
          category: existing.category, primary_category: existing.primary_category,
        },
      },
    };
  }

  // 2) Not in universe — ask the provider whether it can return usable data.
  const fmp = await deps.checkFmp(t);

  if (fmp.inconclusive) {
    return {
      ok: true,
      result: {
        normalized: t, status: "pending", fundName: fmp.name, fmpSupported: false,
        alreadyInUniverse: false, classificationStatus: null,
        failureReason: fmp.reason ?? "Provider check could not complete.", existingFund: null,
      },
    };
  }

  if (!fmp.supported) {
    return {
      ok: true,
      result: {
        normalized: t, status: "unsupported", fundName: fmp.name, fmpSupported: false,
        alreadyInUniverse: false, classificationStatus: null,
        failureReason: fmp.reason ?? "Not supported by the data provider.", existingFund: null,
      },
    };
  }

  // 3) Provider-supported but not in the universe → queue for review. NEVER
  //    auto-added to the verified universe (that runs through the offline
  //    pipeline + validation).
  return {
    ok: true,
    result: {
      normalized: t, status: "ready_for_review", fundName: fmp.name, fmpSupported: true,
      alreadyInUniverse: false, classificationStatus: "pending", failureReason: null,
      existingFund: null,
    },
  };
}

/** Statuses that count as an open/active request (block duplicates). */
export const ACTIVE_STATUSES: FundRequestStatus[] = [
  "pending", "fmp_supported", "needs_classification", "ready_for_review",
];

export function isActiveStatus(s: string): boolean {
  return (ACTIVE_STATUSES as string[]).includes(s);
}
