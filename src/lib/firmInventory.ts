/**
 * Firm Funds inventory — server-side composition (Phase 2C).
 *
 * Joins the firm's own firm_funds rows to CANONICAL identity from the merged
 * universe (name/vehicle/category/benchmark are resolved here, never duplicated
 * into the database) and to the DERIVED last-completed-review date. Performance
 * (recent return + sparkline) is enriched separately and independently so a
 * provider gap shows Unavailable rather than failing the inventory.
 *
 * Models and alerts have NO reliable relationship to firm_funds today, so the
 * inventory reports an explicit not-connected marker — never a fabricated zero.
 * Server-only: imports server modules and takes an authenticated client.
 */
import { createServerClient } from "./supabase";
import { getMergedUniverse, findMergedFund } from "./universeServer";
import {
  firmFundsList, firmFundCreate, firmFundGet, lastCompletedReviews,
  reviewsList, reviewCreate, reviewGet, candidateAdd,
  normalizeCanonicalTicker, FirmReviewError,
  type FirmFundStatus, type ReviewStatus, type FundReviewRow,
  type ReviewCandidateRow, type ReviewEvidenceRow,
} from "./firmReviews";

type Supa = Awaited<ReturnType<typeof createServerClient>>;

/** Explicit "no reliable relationship yet" marker (models + alerts). */
export const NOT_CONNECTED = { connected: false as const };

export interface FirmInventoryRow {
  id: string;
  ticker: string;
  name: string | null;        // canonical (null when not resolvable)
  vehicle: string | null;
  category: string | null;
  benchmark: string | null;
  status: FirmFundStatus;
  fundRole: string | null;
  approvalRationale: string | null;
  nextReviewDate: string | null;
  lastCompletedReview: string | null;   // derived from completed reviews
  models: { connected: false };         // not connected — no schema relationship
  alerts: { connected: false };         // not connected — no schema relationship
}

/** Full inventory for a firm (identity + firm fields + derived last review).
 *  No provider calls here — performance is a separate, bounded enrichment. */
export async function buildFirmInventory(sb: Supa, firmId: string): Promise<FirmInventoryRow[]> {
  const [funds, universe, lastReviews] = await Promise.all([
    firmFundsList(sb, firmId),
    getMergedUniverse(sb),
    lastCompletedReviews(sb, firmId),
  ]);
  const byTicker = new Map(universe.map((u) => [u.ticker, u]));
  return funds.map((f) => {
    const u = byTicker.get(f.normalized_ticker);
    return {
      id: f.id,
      ticker: f.normalized_ticker,
      name: u?.name ?? null,
      vehicle: u?.vehicle ?? null,
      category: u?.category ?? null,
      benchmark: u?.benchmark ?? null,
      status: f.status,
      fundRole: f.fund_role,
      approvalRationale: f.approval_rationale,
      nextReviewDate: f.next_review_date,
      lastCompletedReview: lastReviews[f.id] ?? null,
      models: NOT_CONNECTED,
      alerts: NOT_CONNECTED,
    };
  });
}

/** Add a canonical ticker to the firm. Rejects tickers not in the merged
 *  universe (explicit, never guesses / never triggers Expansion) and duplicates
 *  (via the DB unique constraint surfaced as a typed error). */
export async function addFirmFundToInventory(sb: Supa, firmId: string, userId: string, input: {
  ticker: string; status?: FirmFundStatus; fundRole?: string | null;
  approvalRationale?: string | null; nextReviewDate?: string | null;
}) {
  const ticker = normalizeCanonicalTicker(input.ticker); // throws invalid_ticker
  const fund = await findMergedFund(ticker, sb);
  if (!fund) throw new FirmReviewError("not_in_universe", `${ticker} is not in the fund universe.`);
  return firmFundCreate(sb, firmId, userId, { ...input, ticker }); // throws duplicate on 23505
}

// ── Reviews list (workflow rows + canonical identity) ─────────────────────────

export interface ReviewListRow {
  id: string; firmFundId: string; ticker: string; name: string | null;
  status: ReviewStatus; reason: string | null; assignedReviewer: string | null;
  openedDate: string; reviewDate: string | null; completedDate: string | null;
  decision: string | null; nextReviewDate: string | null;
}

/** Firm reviews joined to the firm fund's ticker + canonical name (name resolved
 *  from the universe, never duplicated in the DB). Optionally status-filtered. */
export async function buildReviewsList(sb: Supa, firmId: string, opts?: { statuses?: ReviewStatus[] }): Promise<ReviewListRow[]> {
  const [reviews, funds, universe] = await Promise.all([
    reviewsList(sb, firmId, opts),
    firmFundsList(sb, firmId),
    getMergedUniverse(sb),
  ]);
  const fundById = new Map(funds.map((f) => [f.id, f]));
  const nameByTicker = new Map(universe.map((u) => [u.ticker, u.name]));
  return reviews.map((r) => {
    const ticker = fundById.get(r.firm_fund_id)?.normalized_ticker ?? "";
    return {
      id: r.id, firmFundId: r.firm_fund_id, ticker,
      name: ticker ? (nameByTicker.get(ticker) ?? null) : null,
      status: r.status, reason: r.reason, assignedReviewer: r.assigned_reviewer,
      openedDate: r.opened_date, reviewDate: r.review_date, completedDate: r.completed_date,
      decision: r.decision, nextReviewDate: r.next_review_date,
    };
  });
}

/** Create a review — reason required; the fund must belong to the current firm.
 *  (assigned_reviewer's firm membership is enforced by the DB composite FK.) */
export async function createReviewValidated(sb: Supa, firmId: string, input: {
  firmFundId: string; reason?: string | null; assignedReviewer?: string | null;
  openedDate?: string; reviewDate?: string | null;
}): Promise<FundReviewRow> {
  const reason = (input.reason ?? "").trim();
  if (!reason) throw new FirmReviewError("reason_required", "A reason is required to start a review.");
  const fund = await firmFundGet(sb, firmId, input.firmFundId);
  if (!fund) throw new FirmReviewError("not_in_firm", "That fund is not in your Firm Funds.");
  return reviewCreate(sb, firmId, { ...input, reason });
}

/** Add a candidate — normalized uppercase + must exist in the merged universe
 *  (never guesses; duplicates rejected by the DB unique constraint). */
export async function addReviewCandidateValidated(sb: Supa, reviewId: string, input: {
  ticker: string; displayOrder?: number; notes?: string | null;
}): Promise<ReviewCandidateRow> {
  const ticker = normalizeCanonicalTicker(input.ticker);
  const fund = await findMergedFund(ticker, sb);
  if (!fund) throw new FirmReviewError("not_in_universe", `${ticker} is not in the fund universe.`);
  return candidateAdd(sb, reviewId, { ...input, ticker });
}

export interface ReviewDetailView {
  review: FundReviewRow;
  candidates: ReviewCandidateRow[];
  evidence: ReviewEvidenceRow[];
  fund: {
    firmFundId: string; ticker: string; name: string | null; vehicle: string | null;
    category: string | null; benchmark: string | null; status: FirmFundStatus;
    fundRole: string | null; approvalRationale: string | null; nextReviewDate: string | null;
  } | null;
}

/** One review with candidates + evidence + resolved fund context (canonical
 *  identity from the universe; firm fields from firm_funds). */
export async function buildReviewDetail(sb: Supa, firmId: string, id: string): Promise<ReviewDetailView | null> {
  const detail = await reviewGet(sb, firmId, id);
  if (!detail) return null;
  const fund = await firmFundGet(sb, firmId, detail.review.firm_fund_id);
  let fundView: ReviewDetailView["fund"] = null;
  if (fund) {
    const u = await findMergedFund(fund.normalized_ticker, sb);
    fundView = {
      firmFundId: fund.id, ticker: fund.normalized_ticker, name: u?.name ?? null,
      vehicle: u?.vehicle ?? null, category: u?.category ?? null, benchmark: u?.benchmark ?? null,
      status: fund.status, fundRole: fund.fund_role, approvalRationale: fund.approval_rationale,
      nextReviewDate: fund.next_review_date,
    };
  }
  return { review: detail.review, candidates: detail.candidates, evidence: detail.evidence, fund: fundView };
}

// ── Performance enrichment (pure mappers + bounded batch) ─────────────────────

export interface PerfPoint { recentReturn: number | null; spark: number[] | null }

/** Map a normalized quote → display perf. Missing → Unavailable (null), never 0.
 *  Recent return and sparkline can each be unavailable independently. */
export function perfFromQuote(q: { change1m?: number | null; spark6m?: number[] } | null): PerfPoint {
  if (!q) return { recentReturn: null, spark: null };
  const spark = Array.isArray(q.spark6m) && q.spark6m.length > 8 ? q.spark6m : null;
  const recentReturn = typeof q.change1m === "number" && Number.isFinite(q.change1m) ? q.change1m : null;
  return { recentReturn, spark };
}

/**
 * Bounded enrichment for ONLY the firm's own inventory. Requested tickers are
 * intersected with the firm's actual holdings (so a client can't drive arbitrary
 * provider calls), capped, and fetched concurrently. Each ticker is isolated:
 * a partial provider failure yields Unavailable for that row and never fails the
 * batch. `quote` is injected so this is testable without a live provider.
 */
export async function boundedPerformance(
  requested: string[],
  firmTickers: Set<string>,
  quote: (t: string) => Promise<{ change1m?: number | null; spark6m?: number[] } | null>,
  cap = 200,
): Promise<Record<string, PerfPoint>> {
  const uniq = Array.from(new Set(requested.map((t) => String(t).toUpperCase())))
    .filter((t) => firmTickers.has(t))
    .slice(0, cap);
  const entries = await Promise.all(uniq.map(async (t): Promise<[string, PerfPoint]> => {
    try { return [t, perfFromQuote(await quote(t))]; }
    catch { return [t, perfFromQuote(null)]; } // isolate failure → Unavailable
  }));
  return Object.fromEntries(entries);
}
