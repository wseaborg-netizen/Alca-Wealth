/**
 * Firm Funds + Fund Reviews — server-side data foundation (Phase 2B).
 *
 * Provider-neutral, firm-scoped repositories over the Phase 2B tables
 * (firm_funds, fund_reviews, review_candidates, review_evidence). Server-only:
 * every function takes an authenticated Supabase server client and a firmId, and
 * relies on RLS + the database's same-firm composite FK for isolation. No
 * service-role access, no synthetic records, and NO duplicated fund metadata —
 * name/category/benchmark/vehicle are resolved from the canonical universe by
 * callers, never stored here. "Last review" is derived from completed reviews,
 * not duplicated onto firm_funds.
 */
import { createServerClient } from "./supabase";
import { normalizeTicker } from "./tickerNormalize";

type Supa = Awaited<ReturnType<typeof createServerClient>>;

// ── Allowed values (mirrors the DB CHECK constraints exactly) ────────────────

export const FIRM_FUND_STATUSES = ["approved", "watch", "candidate", "restricted", "retired"] as const;
export type FirmFundStatus = (typeof FIRM_FUND_STATUSES)[number];

export const REVIEW_STATUSES = ["open", "in_review", "completed", "cancelled"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_DECISIONS = ["keep", "watch", "replace", "restrict", "retire"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

// ── Explicit typed error ─────────────────────────────────────────────────────

export type FirmReviewErrorCode =
  | "invalid_ticker" | "invalid_status" | "invalid_decision"
  | "decision_required" | "date_order" | "not_found" | "duplicate"
  | "not_in_universe" | "db_error";

export class FirmReviewError extends Error {
  code: FirmReviewErrorCode;
  constructor(code: FirmReviewErrorCode, message: string) {
    super(message);
    this.name = "FirmReviewError";
    this.code = code;
  }
}

// ── Local row types (project convention: interfaces beside the repo) ──────────

export interface FirmFundRow {
  id: string; firm_id: string; normalized_ticker: string; status: FirmFundStatus;
  fund_role: string | null; approval_rationale: string | null; next_review_date: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}

export interface FundReviewRow {
  id: string; firm_id: string; firm_fund_id: string; status: ReviewStatus;
  reason: string | null; assigned_reviewer: string | null;
  opened_date: string; review_date: string | null; completed_date: string | null;
  decision: ReviewDecision | null; rationale: string | null;
  effective_date: string | null; next_review_date: string | null;
  created_at: string; updated_at: string;
}

export interface ReviewCandidateRow {
  id: string; review_id: string; normalized_ticker: string; display_order: number;
  notes: string | null; selected: boolean; comparison_snapshot: unknown | null;
  created_at: string; updated_at: string;
}

export interface ReviewEvidenceRow {
  id: string; firm_id: string; review_id: string; evidence_type: string; title: string | null;
  source_reference: string | null; as_of_date: string | null; snapshot: unknown | null;
  author: string | null; created_at: string;
}

export interface ReviewDetail {
  review: FundReviewRow;
  candidates: ReviewCandidateRow[];
  evidence: ReviewEvidenceRow[];
}

const FIRM_FUND_COLS =
  "id, firm_id, normalized_ticker, status, fund_role, approval_rationale, next_review_date, created_by, created_at, updated_at";
const REVIEW_COLS =
  "id, firm_id, firm_fund_id, status, reason, assigned_reviewer, opened_date, review_date, " +
  "completed_date, decision, rationale, effective_date, next_review_date, created_at, updated_at";
const CANDIDATE_COLS =
  "id, review_id, normalized_ticker, display_order, notes, selected, comparison_snapshot, created_at, updated_at";
const EVIDENCE_COLS =
  "id, firm_id, review_id, evidence_type, title, source_reference, as_of_date, snapshot, author, created_at";

// ── Pure validators (complement the DB constraints; unit-tested offline) ──────

/** Trim + uppercase + shape-check a canonical ticker, or throw invalid_ticker. */
export function normalizeCanonicalTicker(raw: unknown): string {
  const n = normalizeTicker(raw);
  if (!n.ok) throw new FirmReviewError("invalid_ticker", n.reason ?? "Invalid ticker.");
  return n.normalized;
}

export function assertFirmFundStatus(s: unknown): FirmFundStatus {
  if (typeof s !== "string" || !FIRM_FUND_STATUSES.includes(s as FirmFundStatus)) {
    throw new FirmReviewError("invalid_status", `Invalid firm fund status: ${String(s)}`);
  }
  return s as FirmFundStatus;
}

export function assertReviewStatus(s: unknown): ReviewStatus {
  if (typeof s !== "string" || !REVIEW_STATUSES.includes(s as ReviewStatus)) {
    throw new FirmReviewError("invalid_status", `Invalid review status: ${String(s)}`);
  }
  return s as ReviewStatus;
}

export function assertReviewDecision(d: unknown): ReviewDecision {
  if (typeof d !== "string" || !REVIEW_DECISIONS.includes(d as ReviewDecision)) {
    throw new FirmReviewError("invalid_decision", `Invalid review decision: ${String(d)}`);
  }
  return d as ReviewDecision;
}

/** A completed review must carry a final decision. */
export function assertCompletedHasDecision(status: ReviewStatus, decision: ReviewDecision | null | undefined): void {
  if (status === "completed" && !decision) {
    throw new FirmReviewError("decision_required", "A completed review requires a final decision.");
  }
}

/** When both dates exist, next_review_date must not precede completed_date. */
export function assertReviewDateOrder(completedDate: string | null | undefined, nextReviewDate: string | null | undefined): void {
  if (completedDate && nextReviewDate && nextReviewDate < completedDate) {
    throw new FirmReviewError("date_order", "Next review date cannot be earlier than the completed date.");
  }
}

function fail(code: FirmReviewErrorCode, error: { message: string } | null): never {
  throw new FirmReviewError(code, error?.message ?? "Database error.");
}

// ── Firm Funds ────────────────────────────────────────────────────────────────

export async function firmFundsList(sb: Supa, firmId: string): Promise<FirmFundRow[]> {
  const { data, error } = await sb.from("firm_funds")
    .select(FIRM_FUND_COLS).eq("firm_id", firmId)
    .order("normalized_ticker", { ascending: true }).limit(1000);
  if (error) fail("db_error", error);
  return (data ?? []) as unknown as FirmFundRow[];
}

export async function firmFundGet(sb: Supa, firmId: string, id: string): Promise<FirmFundRow | null> {
  const { data, error } = await sb.from("firm_funds")
    .select(FIRM_FUND_COLS).eq("firm_id", firmId).eq("id", id).limit(1);
  if (error) fail("db_error", error);
  return ((data ?? [])[0] as unknown as FirmFundRow) ?? null;
}

export async function firmFundCreate(sb: Supa, firmId: string, userId: string, input: {
  ticker: string; status?: FirmFundStatus; fundRole?: string | null;
  approvalRationale?: string | null; nextReviewDate?: string | null;
}): Promise<FirmFundRow> {
  const normalized_ticker = normalizeCanonicalTicker(input.ticker);
  const status = input.status ? assertFirmFundStatus(input.status) : "candidate";
  const { data, error } = await sb.from("firm_funds").insert({
    firm_id: firmId, created_by: userId, normalized_ticker, status,
    fund_role: input.fundRole ?? null, approval_rationale: input.approvalRationale ?? null,
    next_review_date: input.nextReviewDate ?? null,
  }).select(FIRM_FUND_COLS).single();
  if (error) {
    // unique (firm_id, normalized_ticker) violation → explicit duplicate error
    if ((error as { code?: string }).code === "23505") {
      throw new FirmReviewError("duplicate", `${normalized_ticker} is already in this firm's inventory.`);
    }
    fail("db_error", error);
  }
  return data as unknown as FirmFundRow;
}

export async function firmFundUpdate(sb: Supa, firmId: string, id: string, patch: {
  status?: FirmFundStatus; fundRole?: string | null;
  approvalRationale?: string | null; nextReviewDate?: string | null;
}): Promise<FirmFundRow> {
  const upd: Record<string, unknown> = {};
  if (patch.status !== undefined) upd.status = assertFirmFundStatus(patch.status);
  if (patch.fundRole !== undefined) upd.fund_role = patch.fundRole;
  if (patch.approvalRationale !== undefined) upd.approval_rationale = patch.approvalRationale;
  if (patch.nextReviewDate !== undefined) upd.next_review_date = patch.nextReviewDate;
  const { data, error } = await sb.from("firm_funds").update(upd)
    .eq("firm_id", firmId).eq("id", id).select(FIRM_FUND_COLS).single();
  if (error) fail("db_error", error);
  if (!data) throw new FirmReviewError("not_found", "Firm fund not found.");
  return data as unknown as FirmFundRow;
}

// ── Fund Reviews ──────────────────────────────────────────────────────────────

/** Reviews for a firm, optionally filtered by workflow status(es). */
export async function reviewsList(sb: Supa, firmId: string, opts?: { statuses?: ReviewStatus[] }): Promise<FundReviewRow[]> {
  let q = sb.from("fund_reviews").select(REVIEW_COLS).eq("firm_id", firmId);
  if (opts?.statuses?.length) q = q.in("status", opts.statuses.map(assertReviewStatus));
  const { data, error } = await q.order("opened_date", { ascending: false }).limit(1000);
  if (error) fail("db_error", error);
  return (data ?? []) as unknown as FundReviewRow[];
}

/** One review with its candidates + evidence (all firm-scoped via RLS). */
export async function reviewGet(sb: Supa, firmId: string, id: string): Promise<ReviewDetail | null> {
  const { data: rev, error } = await sb.from("fund_reviews")
    .select(REVIEW_COLS).eq("firm_id", firmId).eq("id", id).limit(1);
  if (error) fail("db_error", error);
  const review = ((rev ?? [])[0] as unknown as FundReviewRow) ?? null;
  if (!review) return null;
  const [{ data: cands, error: cErr }, { data: evid, error: eErr }] = await Promise.all([
    sb.from("review_candidates").select(CANDIDATE_COLS).eq("review_id", id).order("display_order", { ascending: true }),
    sb.from("review_evidence").select(EVIDENCE_COLS).eq("review_id", id).order("created_at", { ascending: false }),
  ]);
  if (cErr) fail("db_error", cErr);
  if (eErr) fail("db_error", eErr);
  return {
    review,
    candidates: (cands ?? []) as unknown as ReviewCandidateRow[],
    evidence: (evid ?? []) as unknown as ReviewEvidenceRow[],
  };
}

export async function reviewCreate(sb: Supa, firmId: string, input: {
  firmFundId: string; reason?: string | null; assignedReviewer?: string | null;
  openedDate?: string; reviewDate?: string | null;
}): Promise<FundReviewRow> {
  const { data, error } = await sb.from("fund_reviews").insert({
    firm_id: firmId, firm_fund_id: input.firmFundId, status: "open",
    reason: input.reason ?? null, assigned_reviewer: input.assignedReviewer ?? null,
    opened_date: input.openedDate ?? undefined, review_date: input.reviewDate ?? null,
  }).select(REVIEW_COLS).single();
  if (error) fail("db_error", error);
  return data as unknown as FundReviewRow;
}

/** Update workflow fields. Enforces completed-needs-decision + date ordering
 *  in the application layer as well as at the database level. */
export async function reviewUpdate(sb: Supa, firmId: string, id: string, patch: {
  status?: ReviewStatus; reason?: string | null; assignedReviewer?: string | null;
  reviewDate?: string | null; completedDate?: string | null;
  decision?: ReviewDecision | null; rationale?: string | null;
  effectiveDate?: string | null; nextReviewDate?: string | null;
}): Promise<FundReviewRow> {
  const current = await reviewGet(sb, firmId, id);
  if (!current) throw new FirmReviewError("not_found", "Review not found.");

  const nextStatus = patch.status !== undefined ? assertReviewStatus(patch.status) : current.review.status;
  const nextDecision = patch.decision !== undefined ? (patch.decision === null ? null : assertReviewDecision(patch.decision)) : current.review.decision;
  const nextCompleted = patch.completedDate !== undefined ? patch.completedDate : current.review.completed_date;
  const nextReview = patch.nextReviewDate !== undefined ? patch.nextReviewDate : current.review.next_review_date;
  assertCompletedHasDecision(nextStatus, nextDecision);
  assertReviewDateOrder(nextCompleted, nextReview);

  const upd: Record<string, unknown> = {};
  if (patch.status !== undefined) upd.status = nextStatus;
  if (patch.reason !== undefined) upd.reason = patch.reason;
  if (patch.assignedReviewer !== undefined) upd.assigned_reviewer = patch.assignedReviewer;
  if (patch.reviewDate !== undefined) upd.review_date = patch.reviewDate;
  if (patch.completedDate !== undefined) upd.completed_date = patch.completedDate;
  if (patch.decision !== undefined) upd.decision = nextDecision;
  if (patch.rationale !== undefined) upd.rationale = patch.rationale;
  if (patch.effectiveDate !== undefined) upd.effective_date = patch.effectiveDate;
  if (patch.nextReviewDate !== undefined) upd.next_review_date = patch.nextReviewDate;

  const { data, error } = await sb.from("fund_reviews").update(upd)
    .eq("firm_id", firmId).eq("id", id).select(REVIEW_COLS).single();
  if (error) fail("db_error", error);
  return data as unknown as FundReviewRow;
}

/** Latest completed-review date per firm_fund (derived — never stored on
 *  firm_funds). Keyed by firm_fund_id; only reviews with status='completed' and
 *  a completed_date count. */
export async function lastCompletedReviews(sb: Supa, firmId: string): Promise<Record<string, string>> {
  const { data, error } = await sb.from("fund_reviews")
    .select("firm_fund_id, completed_date")
    .eq("firm_id", firmId).eq("status", "completed").not("completed_date", "is", null)
    .order("completed_date", { ascending: false });
  if (error) fail("db_error", error);
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as { firm_fund_id: string; completed_date: string }[]) {
    if (!(r.firm_fund_id in out)) out[r.firm_fund_id] = r.completed_date; // first = newest
  }
  return out;
}

// ── Review candidates ─────────────────────────────────────────────────────────

export async function candidateAdd(sb: Supa, reviewId: string, input: {
  ticker: string; displayOrder?: number; notes?: string | null;
  selected?: boolean; comparisonSnapshot?: unknown;
}): Promise<ReviewCandidateRow> {
  const normalized_ticker = normalizeCanonicalTicker(input.ticker);
  const { data, error } = await sb.from("review_candidates").insert({
    review_id: reviewId, normalized_ticker, display_order: input.displayOrder ?? 0,
    notes: input.notes ?? null, selected: input.selected ?? false,
    comparison_snapshot: input.comparisonSnapshot ?? null,
  }).select(CANDIDATE_COLS).single();
  if (error) fail("db_error", error);
  return data as unknown as ReviewCandidateRow;
}

export async function candidateRemove(sb: Supa, reviewId: string, id: string): Promise<void> {
  const { error } = await sb.from("review_candidates").delete().eq("review_id", reviewId).eq("id", id);
  if (error) fail("db_error", error);
}

// ── Review evidence ─────────────────────────────────────────────────────────

export async function evidenceAdd(sb: Supa, firmId: string, reviewId: string, userId: string | null, input: {
  evidenceType: string; title?: string | null; sourceReference?: string | null;
  asOfDate?: string | null; snapshot?: unknown;
}): Promise<ReviewEvidenceRow> {
  // firm_id is required and FK-tied to the review's firm; the composite FK
  // (firm_id, review_id) → fund_reviews(firm_id, id) rejects a cross-firm review.
  const { data, error } = await sb.from("review_evidence").insert({
    firm_id: firmId, review_id: reviewId, evidence_type: input.evidenceType, title: input.title ?? null,
    source_reference: input.sourceReference ?? null, as_of_date: input.asOfDate ?? null,
    snapshot: input.snapshot ?? null, author: userId,
  }).select(EVIDENCE_COLS).single();
  if (error) fail("db_error", error);
  return data as unknown as ReviewEvidenceRow;
}

export async function evidenceRemove(sb: Supa, reviewId: string, id: string): Promise<void> {
  const { error } = await sb.from("review_evidence").delete().eq("review_id", reviewId).eq("id", id);
  if (error) fail("db_error", error);
}
