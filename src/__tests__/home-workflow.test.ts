/**
 * Home operating-dashboard aggregation — OFFLINE, pure.
 *
 * Proves counts/queue/upcoming/status derive ONLY from the passed firm-scoped
 * records (nothing synthesized), that active vs completed/cancelled are handled
 * correctly, and that the review queue ordering + date (approaching/overdue)
 * logic match the Home spec.
 */
import {
  buildHomeWorkflow, REVIEW_APPROACHING_DAYS, FIRM_FUND_UPCOMING_DAYS,
  type ReviewRecord, type FirmFundRecord, type Identity,
} from "@/lib/homeWorkflow";

const TODAY = "2026-07-26";
const plus = (n: number) => { const d = new Date(TODAY + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const fund = (id: string, ticker: string, status: FirmFundRecord["status"], next: string | null, role: string | null = null): FirmFundRecord =>
  ({ id, normalized_ticker: ticker, status, fund_role: role, next_review_date: next });
const review = (id: string, fundId: string, status: ReviewRecord["status"], opened: string, target: string | null, reviewer: string | null = null, reason: string | null = "cause"): ReviewRecord =>
  ({ id, firm_fund_id: fundId, status, reason, assigned_reviewer: reviewer, opened_date: opened, review_date: target });

const IDS = new Map<string, Identity>([
  ["VTI", { name: "Vanguard Total Stock Market ETF", vehicle: "ETF" }],
  ["VFIAX", { name: "Vanguard 500 Index Admiral", vehicle: "Mutual Fund" }],
  ["BND", { name: "Vanguard Total Bond Market ETF", vehicle: "ETF" }],
]);

describe("buildHomeWorkflow — counts derive only from real records", () => {
  const funds = [
    fund("f1", "VTI", "approved", plus(-3)),   // overdue firm-fund review
    fund("f2", "VFIAX", "watch", plus(5)),     // upcoming (within 30d)
    fund("f3", "BND", "candidate", plus(90)),  // future, beyond window
    fund("f4", "QQQ", "restricted", null),     // no next review date
  ];
  const reviews = [
    review("r1", "f1", "open", plus(-20), plus(-2)),        // overdue active
    review("r2", "f2", "in_review", plus(-10), plus(3)),    // approaching (within 14d)
    review("r3", "f3", "open", plus(-5), plus(40)),         // active, far target
    review("r4", "f1", "completed", plus(-60), plus(-30)),  // completed — excluded from active
    review("r5", "f2", "cancelled", plus(-70), null),       // cancelled — excluded
  ];
  const wf = buildHomeWorkflow(reviews, funds, IDS, { f1: plus(-30) }, TODAY);

  test("open/in-review counts exclude completed and cancelled", () => {
    expect(wf.counts.openReviews).toBe(2);   // r1, r3
    expect(wf.counts.inReview).toBe(1);      // r2
  });
  test("overdue vs approaching active reviews", () => {
    expect(wf.counts.overdueActive).toBe(1);      // r1
    expect(wf.counts.approachingTarget).toBe(1);  // r2 (r3 target beyond 14d)
    expect(REVIEW_APPROACHING_DAYS).toBe(14);
  });
  test("firm-fund upcoming vs overdue next-review counts", () => {
    expect(wf.counts.firmFundsOverdue).toBe(1);   // f1
    expect(wf.counts.firmFundsUpcoming).toBe(1);  // f2 (f3 beyond 30d, f4 null)
    expect(FIRM_FUND_UPCOMING_DAYS).toBe(30);
  });
  test("status counts + total are literal tallies", () => {
    expect(wf.statusCounts).toEqual({ approved: 1, watch: 1, candidate: 1, restricted: 1, retired: 0 });
    expect(wf.firmFundsTotal).toBe(4);
  });
});

describe("review work queue", () => {
  const funds = [fund("f1", "VTI", "approved", null), fund("f2", "VFIAX", "watch", null), fund("f3", "BND", "candidate", null)];

  test("only open + in_review; completed/cancelled never appear", () => {
    const reviews = [
      review("r1", "f1", "open", plus(-2), plus(5)),
      review("rc", "f2", "completed", plus(-2), plus(5)),
      review("rx", "f3", "cancelled", plus(-2), plus(5)),
    ];
    const wf = buildHomeWorkflow(reviews, funds, IDS, {}, TODAY);
    expect(wf.reviewQueue.map((q) => q.reviewId)).toEqual(["r1"]);
    expect(wf.reviewQueue[0].ticker).toBe("VTI");
    expect(wf.reviewQueue[0].name).toBe("Vanguard Total Stock Market ETF");
  });

  test("ordering: overdue first, then nearest target, then newest opened when targets tie/absent", () => {
    const reviews = [
      review("future_far", "f1", "open", plus(-1), plus(20)),
      review("overdue_a", "f2", "open", plus(-9), plus(-1)),
      review("overdue_b", "f3", "in_review", plus(-9), plus(-5)),  // more overdue → first
      review("no_target_old", "f1", "open", plus(-30), null),
      review("no_target_new", "f2", "open", plus(-2), null),
      review("future_near", "f3", "open", plus(-1), plus(3)),
    ];
    const wf = buildHomeWorkflow(reviews, funds, IDS, {}, TODAY);
    expect(wf.reviewQueue.map((q) => q.reviewId)).toEqual([
      "overdue_b",     // overdue, earliest target
      "overdue_a",     // overdue, later target
      "future_near",   // not overdue, nearest target
      "future_far",    // not overdue, farther target
      "no_target_new", // no target → newest opened
      "no_target_old", // no target → older opened
    ]);
  });

  test("assigned reviewer + overdue flag surfaced honestly", () => {
    const reviews = [review("r1", "f1", "in_review", plus(-3), plus(-1), "user-abc")];
    const wf = buildHomeWorkflow(reviews, funds, IDS, {}, TODAY);
    expect(wf.reviewQueue[0].assignedReviewer).toBe("user-abc");
    expect(wf.reviewQueue[0].overdue).toBe(true);
    expect(wf.reviewQueue[0].status).toBe("in_review");
  });
});

describe("upcoming firm-fund reviews", () => {
  test("only funds with a next_review_date, ordered soonest/most-overdue first, overdue flagged", () => {
    const funds = [
      fund("f1", "VTI", "approved", plus(10)),
      fund("f2", "VFIAX", "watch", plus(-4)),   // overdue
      fund("f3", "BND", "candidate", null),      // excluded (no date)
      fund("f4", "QQQ", "restricted", plus(2)),
    ];
    const wf = buildHomeWorkflow([], funds, IDS, { f2: "2026-01-01" }, TODAY);
    expect(wf.upcomingFirmReviews.map((u) => u.ticker)).toEqual(["VFIAX", "QQQ", "VTI"]);
    expect(wf.upcomingFirmReviews[0].overdue).toBe(true);
    expect(wf.upcomingFirmReviews[0].lastCompletedReview).toBe("2026-01-01");
    expect(wf.upcomingFirmReviews[2].overdue).toBe(false);
    expect(wf.upcomingFirmReviews.find((u) => u.ticker === "BND")).toBeUndefined();
  });
});

describe("empty firm → all zero, nothing fabricated", () => {
  test("no records ⇒ zero counts, empty lists", () => {
    const wf = buildHomeWorkflow([], [], new Map(), {}, TODAY);
    expect(wf.counts).toEqual({ openReviews: 0, inReview: 0, approachingTarget: 0, overdueActive: 0, firmFundsUpcoming: 0, firmFundsOverdue: 0 });
    expect(wf.reviewQueue).toEqual([]);
    expect(wf.upcomingFirmReviews).toEqual([]);
    expect(wf.statusCounts).toEqual({ approved: 0, watch: 0, candidate: 0, restricted: 0, retired: 0 });
    expect(wf.firmFundsTotal).toBe(0);
  });
});
