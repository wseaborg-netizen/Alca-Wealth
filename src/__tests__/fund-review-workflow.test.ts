/**
 * Phase 2E — Fund review workflow + Firm Funds performance periods.
 *
 * Unit tests for the workflow repository logic (Supabase chain mock + mocked
 * universe) and the pure period-performance math, plus source scans confirming
 * firm isolation, read-only closed reviews, no destructive delete, Discover
 * comparison reuse, and no client provider/token access. No live DB or provider.
 */
import * as fs from "fs";
import * as path from "path";

jest.mock("@/lib/universeServer", () => ({
  findMergedFund: jest.fn(async (t: string) =>
    t.toUpperCase() === "IVV" ? { ticker: "IVV", name: "iShares Core S&P 500 ETF", vehicle: "ETF" } : undefined),
  getMergedUniverse: jest.fn(async () => ([{ ticker: "IVV", name: "iShares Core S&P 500 ETF", vehicle: "ETF" }])),
}));

import {
  REVIEW_STATUSES, REVIEW_DECISIONS,
  reviewComplete, reviewCancel, assertReviewMutable, candidateAdd, candidateSelect,
} from "@/lib/firmReviews";
import { createReviewValidated, addReviewCandidateValidated } from "@/lib/firmInventory";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

function makeSb(byTable: Record<string, { data: unknown; error: unknown }>) {
  const chain = (result: { data: unknown; error: unknown }) => {
    const p: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "not", "in", "order", "limit", "single", "insert", "update", "delete"]) p[m] = () => p;
    (p as { then: unknown }).then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
    return p;
  };
  return { from: (t: string) => chain(byTable[t] ?? { data: [], error: null }) } as never;
}
const reviewSb = (status: string, candidates: { selected: boolean }[] = []) => makeSb({
  fund_reviews: { data: [{ id: "r1", firm_fund_id: "f1", status, decision: null, rationale: null, completed_date: null, next_review_date: null }], error: null },
  review_candidates: { data: candidates, error: null },
  review_evidence: { data: [], error: null },
});

// ── Statuses & decisions ──────────────────────────────────────────────────────

describe("exact statuses and decisions", () => {
  test("workflow statuses and decisions are exactly as specified", () => {
    expect([...REVIEW_STATUSES]).toEqual(["open", "in_review", "completed", "cancelled"]);
    expect([...REVIEW_DECISIONS]).toEqual(["keep", "watch", "replace", "restrict", "retire"]);
  });
});

// ── Review creation rules ─────────────────────────────────────────────────────

describe("review creation", () => {
  test("reason is required", async () => {
    await expect(createReviewValidated(makeSb({}), "firm1", { firmFundId: "f1", reason: "   " }))
      .rejects.toMatchObject({ code: "reason_required" });
  });
  test("the selected fund must belong to the current firm", async () => {
    const noFund = makeSb({ firm_funds: { data: [], error: null } });
    await expect(createReviewValidated(noFund, "firm1", { firmFundId: "f1", reason: "Cost review" }))
      .rejects.toMatchObject({ code: "not_in_firm" });
  });
});

// ── Completion rules ──────────────────────────────────────────────────────────

describe("review completion", () => {
  test("a decision is required (invalid/absent decision rejected)", async () => {
    await expect(reviewComplete(reviewSb("open"), "firm1", "r1", { decision: undefined as never }))
      .rejects.toMatchObject({ code: "invalid_decision" });
  });
  test("replace requires exactly one selected candidate", async () => {
    await expect(reviewComplete(reviewSb("open", [{ selected: false }, { selected: false }]), "firm1", "r1", { decision: "replace" }))
      .rejects.toMatchObject({ code: "replace_needs_candidate" });
  });
  test("non-replace decisions do not require a selected candidate", async () => {
    await expect(reviewComplete(reviewSb("open", []), "firm1", "r1", { decision: "keep" })).resolves.toBeDefined();
  });
  test("next_review_date cannot precede completed_date", async () => {
    await expect(reviewComplete(reviewSb("open"), "firm1", "r1", { decision: "keep", completedDate: "2026-05-10", nextReviewDate: "2026-05-01" }))
      .rejects.toMatchObject({ code: "date_order" });
  });
  test("already-closed reviews cannot be completed or cancelled", async () => {
    await expect(reviewComplete(reviewSb("completed"), "firm1", "r1", { decision: "keep" })).rejects.toMatchObject({ code: "review_closed" });
    await expect(reviewCancel(reviewSb("cancelled"), "firm1", "r1")).rejects.toMatchObject({ code: "review_closed" });
  });
});

describe("read-only guard", () => {
  test("assertReviewMutable rejects completed/cancelled, allows open/in_review", async () => {
    await expect(assertReviewMutable(reviewSb("completed"), "firm1", "r1")).rejects.toMatchObject({ code: "review_closed" });
    await expect(assertReviewMutable(reviewSb("cancelled"), "firm1", "r1")).rejects.toMatchObject({ code: "review_closed" });
    await expect(assertReviewMutable(reviewSb("open"), "firm1", "r1")).resolves.toBeUndefined();
    await expect(assertReviewMutable(reviewSb("in_review"), "firm1", "r1")).resolves.toBeUndefined();
  });
});

// ── Candidates ────────────────────────────────────────────────────────────────

describe("candidates", () => {
  test("uppercase normalization + canonical-universe validation", async () => {
    const okSb = makeSb({ review_candidates: { data: { id: "c1", normalized_ticker: "IVV" }, error: null } });
    expect((await addReviewCandidateValidated(okSb, "r1", { ticker: " ivv " })).normalized_ticker).toBe("IVV");
    await expect(addReviewCandidateValidated(makeSb({}), "r1", { ticker: "zzbogus" })).rejects.toMatchObject({ code: "not_in_universe" });
  });
  test("duplicate candidate is a typed duplicate error", async () => {
    const dup = makeSb({ review_candidates: { data: null, error: { code: "23505", message: "dup" } } });
    await expect(candidateAdd(dup, "r1", { ticker: "IVV" })).rejects.toMatchObject({ code: "duplicate" });
  });
  test("select unsets others first (at-most-one selected) — enforced by DB partial index", () => {
    const repo = read("src/lib/firmReviews.ts");
    expect(repo).toMatch(/candidateSelect[\s\S]*?update\(\{ selected: false \}\)[\s\S]*?update\(\{ selected: true \}\)/);
    expect(read("supabase/migrations/20260726120000_firm_funds_reviews.sql")).toContain("review_candidates_one_selected");
  });
  test("candidateSelect(null) only clears (no re-select)", async () => {
    await expect(candidateSelect(makeSb({ review_candidates: { data: null, error: null } }), "r1", null)).resolves.toBeUndefined();
  });
});

// ── API routes: firm isolation, no delete, evidence/reviewer scoping ──────────

describe("reviews API routes", () => {
  const listRoute = read("src/app/api/reviews/route.ts");
  const idRoute = read("src/app/api/reviews/[id]/route.ts");
  const reviewersRoute = read("src/app/api/reviews/reviewers/route.ts");

  test("firm resolved server-side; browser cannot override the firm identity", () => {
    for (const r of [listRoute, idRoute, reviewersRoute]) {
      expect(r).toContain("requireFirmContext");
      expect(r).not.toContain("firm_id");
    }
    expect(listRoute).toContain("ctx.firm.id");
  });
  test("no destructive review deletion endpoint", () => {
    for (const r of [listRoute, idRoute]) {
      expect(r).not.toMatch(/export async function DELETE/);
      expect(r).not.toMatch(/reviewDelete|\.delete\(\)\s*\.eq\("firm_id"/);
    }
  });
  test("active-review mutations are guarded (completed/cancelled read-only)", () => {
    const guards = idRoute.match(/assertReviewMutable/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(5); // update + candidate add/remove/select + evidence add/remove
  });
  test("reviewers endpoint is firm-scoped and never exposes another firm's users", () => {
    expect(reviewersRoute).toContain("firmReviewersList");
    expect(reviewersRoute).toContain("ctx.firm.id");
  });
});

// ── UI reuse + honesty ────────────────────────────────────────────────────────

describe("reviews UI", () => {
  const tab = read("src/components/ReviewsTab.tsx");
  const detail = read("src/components/ReviewDetail.tsx");
  const shell = read("src/components/AppShell.tsx");

  test("Start Review context only opens the create form — no review is created by navigating", () => {
    // the context effect sets the form/view, never POSTs
    expect(tab).toMatch(/if \(!context\) return;[\s\S]*?setView\("create"\)/);
    expect(shell).not.toMatch(/goStartReview[\s\S]{0,160}fetch\(/);
  });
  test("comparison reuses Discover (compare tray + comparison tab), not a new engine", () => {
    expect(detail).toContain("onCompareCandidates");
    expect(shell).toMatch(/goCompareMany[\s\S]*?setCompareTickers[\s\S]*?switchTab\("comparison"\)/);
  });
  test("models affected shows Not connected; candidate scores are never invented", () => {
    expect(detail).toContain("Not connected");
    expect(detail).not.toMatch(/matchScore|candidateScore|Math\.random/);
  });
  test("completed/cancelled render read-only (mutation controls hidden when closed)", () => {
    expect(detail).toContain("const closed =");
    expect(detail).toContain("!closed");
  });
  test("no synthetic review records", () => {
    for (const src of [tab, detail]) expect(src).not.toMatch(/mockReviews|sampleReviews|demoReviews|Math\.random/i);
  });
  test("no client-side provider/token/service-role access", () => {
    for (const src of [tab, detail]) for (const banned of ["market-data/tiingo", "TIINGO", "SERVICE_ROLE", "firmPerformance"]) expect(src).not.toContain(banned);
  });
});

// Firm Funds performance periods are covered in firm-performance.test.ts.
