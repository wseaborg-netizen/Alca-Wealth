/**
 * Home operating-dashboard aggregation — PURE and firm-scoped-by-input.
 *
 * Turns the firm's REAL stored records (fund reviews + firm_funds + canonical
 * identity + derived last-completed-review dates) into the review-workflow view
 * Home renders: attention counts, the active review work queue (ordered), the
 * upcoming firm-fund review calendar, and firm-fund status counts.
 *
 * This module invents nothing: every count and row derives from a passed-in
 * record. No provider calls, no DB access, no firm_id handling here — the caller
 * resolves the firm server-side and passes only that firm's rows. Deterministic
 * given (records, today) so it is fully offline-testable.
 */

// Structural inputs (subset of the firmReviews row shapes — kept loose on purpose).
export interface ReviewRecord {
  id: string;
  firm_fund_id: string;
  status: "open" | "in_review" | "completed" | "cancelled";
  reason: string | null;
  assigned_reviewer: string | null;
  opened_date: string;
  review_date: string | null;      // target review date
}
export interface FirmFundRecord {
  id: string;
  normalized_ticker: string;
  status: "approved" | "watch" | "candidate" | "restricted" | "retired";
  fund_role: string | null;
  next_review_date: string | null;
}
export interface Identity { name: string | null; vehicle: string | null }

// Display windows (calendar days). Counts derive only from real dates; these
// windows only decide whether a real date is labeled "approaching"/"upcoming".
export const REVIEW_APPROACHING_DAYS = 14;
export const FIRM_FUND_UPCOMING_DAYS = 30;
const QUEUE_LIMIT = 8;
const UPCOMING_LIMIT = 8;

const ACTIVE = new Set(["open", "in_review"]);

export interface HomeCounts {
  openReviews: number;         // status = open
  inReview: number;            // status = in_review
  approachingTarget: number;   // active review, target date within the window (not overdue)
  overdueActive: number;       // active review, target date before today
  firmFundsUpcoming: number;   // firm fund next_review_date within the window (not overdue)
  firmFundsOverdue: number;    // firm fund next_review_date before today
}
export interface QueueItem {
  reviewId: string;
  firmFundId: string;
  ticker: string;
  name: string | null;
  reason: string | null;
  assignedReviewer: string | null;
  openedDate: string;
  targetDate: string | null;
  status: "open" | "in_review";
  overdue: boolean;
}
export interface UpcomingReview {
  firmFundId: string;
  ticker: string;
  name: string | null;
  status: FirmFundRecord["status"];
  fundRole: string | null;
  lastCompletedReview: string | null;
  nextReviewDate: string;
  overdue: boolean;
}
export type StatusCounts = Record<FirmFundRecord["status"], number>;

export interface HomeWorkflow {
  counts: HomeCounts;
  reviewQueue: QueueItem[];
  upcomingFirmReviews: UpcomingReview[];
  statusCounts: StatusCounts;
  firmFundsTotal: number;
}

/** Add whole calendar days to an ISO (YYYY-MM-DD) date, returning ISO. */
function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function buildHomeWorkflow(
  reviews: ReviewRecord[],
  funds: FirmFundRecord[],
  identityByTicker: Map<string, Identity>,
  lastCompletedByFundId: Record<string, string>,
  today: string,
): HomeWorkflow {
  const reviewHorizon = addDaysISO(today, REVIEW_APPROACHING_DAYS);
  const fundHorizon = addDaysISO(today, FIRM_FUND_UPCOMING_DAYS);
  const idOf = (t: string) => identityByTicker.get(t) ?? { name: null, vehicle: null };

  // ── Counts ──────────────────────────────────────────────────────────────────
  const counts: HomeCounts = {
    openReviews: 0, inReview: 0, approachingTarget: 0, overdueActive: 0,
    firmFundsUpcoming: 0, firmFundsOverdue: 0,
  };
  for (const r of reviews) {
    if (r.status === "open") counts.openReviews++;
    else if (r.status === "in_review") counts.inReview++;
    if (ACTIVE.has(r.status) && r.review_date) {
      if (r.review_date < today) counts.overdueActive++;
      else if (r.review_date <= reviewHorizon) counts.approachingTarget++;
    }
  }
  for (const f of funds) {
    if (!f.next_review_date) continue;
    if (f.next_review_date < today) counts.firmFundsOverdue++;
    else if (f.next_review_date <= fundHorizon) counts.firmFundsUpcoming++;
  }

  // ── Review work queue (open + in_review only) ────────────────────────────────
  const queue: QueueItem[] = reviews
    .filter((r): r is ReviewRecord & { status: "open" | "in_review" } => ACTIVE.has(r.status))
    .map((r) => {
      const fund = funds.find((f) => f.id === r.firm_fund_id);
      const ticker = fund?.normalized_ticker ?? "";
      return {
        reviewId: r.id,
        firmFundId: r.firm_fund_id,
        ticker,
        name: ticker ? idOf(ticker).name : null,
        reason: r.reason,
        assignedReviewer: r.assigned_reviewer,
        openedDate: r.opened_date,
        targetDate: r.review_date,
        status: r.status,
        overdue: r.review_date != null && r.review_date < today,
      };
    })
    .sort((a, b) => {
      // Overdue first, then nearest target date, then newest opened when targets absent/tied.
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      const at = a.targetDate, bt = b.targetDate;
      if (at && bt && at !== bt) return at < bt ? -1 : 1;
      if (at && !bt) return -1;
      if (!at && bt) return 1;
      return (b.openedDate || "").localeCompare(a.openedDate || "");
    })
    .slice(0, QUEUE_LIMIT);

  // ── Upcoming firm-fund reviews (any fund with a next_review_date) ─────────────
  const upcomingFirmReviews: UpcomingReview[] = funds
    .filter((f): f is FirmFundRecord & { next_review_date: string } => f.next_review_date != null)
    .map((f) => ({
      firmFundId: f.id,
      ticker: f.normalized_ticker,
      name: idOf(f.normalized_ticker).name,
      status: f.status,
      fundRole: f.fund_role,
      lastCompletedReview: lastCompletedByFundId[f.id] ?? null,
      nextReviewDate: f.next_review_date,
      overdue: f.next_review_date < today,
    }))
    .sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate)) // soonest/most overdue first
    .slice(0, UPCOMING_LIMIT);

  // ── Firm-fund status counts ──────────────────────────────────────────────────
  const statusCounts: StatusCounts = { approved: 0, watch: 0, candidate: 0, restricted: 0, retired: 0 };
  for (const f of funds) statusCounts[f.status]++;

  return { counts, reviewQueue: queue, upcomingFirmReviews, statusCounts, firmFundsTotal: funds.length };
}
