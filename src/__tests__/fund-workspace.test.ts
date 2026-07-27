/**
 * Phase 2D — contextual fund workspace.
 *
 * Unit tests for the firm-scoped context reads (with a Supabase chain mock) plus
 * source scans confirming firm isolation, contextual navigation, reuse of the
 * existing Analysis workspace, honest not-connected states, and Start Review /
 * Add to Firm Funds behavior without any DB writes. No live DB or provider.
 */
import * as fs from "fs";
import * as path from "path";
import { firmFundByTicker, reviewsForFirmFund } from "@/lib/firmReviews";
import { PRIMARY_NAV } from "@/components/navModel";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

function makeSb(byTable: Record<string, { data: unknown; error: unknown }>) {
  const chain = (result: { data: unknown; error: unknown }) => {
    const p: Record<string, unknown> = {};
    for (const m of ["select", "eq", "not", "in", "order", "limit", "single"]) p[m] = () => p;
    (p as { then: unknown }).then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
    return p;
  };
  return { from: (t: string) => chain(byTable[t] ?? { data: [], error: null }) } as never;
}

const contextRoute = read("src/app/api/firm-funds/context/route.ts");
const panel = read("src/components/FirmContextPanel.tsx");
const analysis = read("src/components/AnalysisTab.tsx");
const shell = read("src/components/AppShell.tsx");
const reviews = read("src/components/ReviewsTab.tsx");
const repo = read("src/lib/firmReviews.ts");

// ── Firm-scoped context reads ─────────────────────────────────────────────────

describe("firm-scoped context reads", () => {
  test("firmFundByTicker returns the firm's row, or null when absent", async () => {
    const hit = makeSb({ firm_funds: { data: [{ id: "f1", normalized_ticker: "VTI", status: "approved" }], error: null } });
    expect(await firmFundByTicker(hit, "firm1", "vti")).toMatchObject({ id: "f1", normalized_ticker: "VTI" });
    const miss = makeSb({ firm_funds: { data: [], error: null } });
    expect(await firmFundByTicker(miss, "firm1", "VTI")).toBeNull();
  });
  test("reviewsForFirmFund returns the review history (empty when none)", async () => {
    const sb = makeSb({ fund_reviews: { data: [{ id: "r1", status: "completed", completed_date: "2026-06-01" }], error: null } });
    expect(await reviewsForFirmFund(sb, "firm1", "f1")).toHaveLength(1);
    expect(await reviewsForFirmFund(makeSb({}), "firm1", "f1")).toEqual([]);
  });
  test("both reads are firm-scoped in the repository (never cross-firm)", () => {
    expect(repo).toMatch(/firmFundByTicker[\s\S]*?\.eq\("firm_id", firmId\)/);
    expect(repo).toMatch(/reviewsForFirmFund[\s\S]*?\.eq\("firm_id", firmId\)[\s\S]*?\.eq\("firm_fund_id", firmFundId\)/);
  });
});

// ── Context API route ──────────────────────────────────────────────────────────

describe("firm-fund context route", () => {
  test("firm resolved server-side; browser cannot supply firm_id; no cross-firm access", () => {
    expect(contextRoute).toContain("requireFirmContext");
    expect(contextRoute).toContain("ctx.firm.id");
    expect(contextRoute).not.toContain("firm_id");
  });
  test("reads only — never writes a review record", () => {
    expect(contextRoute).toContain("firmFundByTicker");
    expect(contextRoute).toContain("reviewsForFirmFund");
    expect(contextRoute).not.toMatch(/\.insert\(|\.update\(|reviewCreate/);
  });
  test("returns no canonical metadata (identity stays universe-resolved)", () => {
    for (const banned of ["name:", "category:", "benchmark:", "vehicle:"]) expect(contextRoute).not.toContain(banned);
  });
});

// ── Contextual workspace UI ────────────────────────────────────────────────────

describe("FirmContextPanel", () => {
  test("loads firm context from the firm-scoped endpoint", () => {
    expect(panel).toContain("/api/firm-funds/context?ticker=");
  });
  test("firm status + approval rationale display; models/alerts are Not connected", () => {
    expect(panel).toContain("StatusBadge");
    expect(panel).toContain("approval_rationale");
    expect(panel).toContain("Not connected");
  });
  test("non-firm fund offers Add to Firm Funds; no firm metadata shown", () => {
    expect(panel).toMatch(/not in your Firm Funds/i);
    expect(panel).toContain("onAddToFirmFunds");
  });
  test("review history is read-only with an honest empty state (no create/insert)", () => {
    expect(panel).toMatch(/No reviews yet for this fund/i);
    expect(panel).not.toMatch(/reviewCreate|action:\s*["']add["']|"create"/);
  });
  test("Start Review calls the callback and creates no record", () => {
    expect(panel).toContain("onStartReview(firmFund.id, ticker)");
    // the only POST in the panel is the firm-field update (edit), never a review create
    const posts = panel.match(/action:\s*"[a-z]+"/g) ?? [];
    expect(posts.every((p) => p.includes('"update"'))).toBe(true);
  });
  test("fund-specific evidence reuses the existing SEC filings source only (no generic news)", () => {
    expect(panel).toContain("/api/sec/fund/");
    expect(panel).not.toMatch(/news|headlines/i);
  });
  test("reuses the shared dialog/badge (no second fund-detail implementation)", () => {
    expect(panel).toMatch(/from "\.\/FirmFundsTab"/);
  });
  test("no synthetic data, no client provider/token/service-role access", () => {
    expect(panel).not.toMatch(/Math\.random|mockReviews|sampleReviews/i);
    for (const banned of ["market-data/tiingo", "TIINGO", "SERVICE_ROLE", "getMarketQuote"]) expect(panel).not.toContain(banned);
  });
});

// ── Analysis workspace reuse (calculations unchanged) ─────────────────────────

describe("Analysis workspace is reused, not duplicated", () => {
  test("firm context is injected into the existing AnalysisTab", () => {
    expect(analysis).toContain("<FirmContextPanel");
    expect(analysis).toContain("firmOrigin");
  });
  test("existing analysis calculations remain (analyzeFund + score + metrics intact)", () => {
    for (const kept of ["analyzeFund", "computeTaxEfficiency", "scoreFundForContext", "statFor("]) {
      expect(analysis).toContain(kept);
    }
    // the panel must not touch the analytics engines
    expect(panel).not.toMatch(/from ["']\.\.?\/(lib\/)?(kpi|analysis|metrics)/);
  });
  test("similar candidates reuse the existing capability (no new similarity engine)", () => {
    expect(analysis).toContain("onFindSimilar");
    expect(analysis).toContain("onCompare");           // → Discover comparison
    expect(analysis).toContain("getPeerAlternativesForContext");
  });
});

// ── Navigation wiring ──────────────────────────────────────────────────────────

describe("contextual navigation", () => {
  test("Firm Funds ticker opens the workspace with firm origin", () => {
    expect(shell).toContain("onAnalyze={(t) => goAnalyze(t, true)}");
  });
  test("Back to Firm Funds, Start Review, and Add to Firm Funds are wired", () => {
    expect(shell).toMatch(/goBackToFirmFunds\s*=\s*\(\)\s*=>\s*switchTab\("firmfunds"\)/);
    expect(shell).toMatch(/goStartReview[\s\S]*?setReviewCtx[\s\S]*?switchTab\("reviews"\)/);
    expect(shell).toMatch(/goAddToFirmFunds[\s\S]*?setFirmFundsAddTicker[\s\S]*?switchTab\("firmfunds"\)/);
  });
  test("Start Review creates no DB record (navigation only) and Reviews just receives context", () => {
    expect(shell).toMatch(/goStartReview[\s\S]*?setReviewCtx[\s\S]*?switchTab\("reviews"\)/);
    expect(shell).not.toMatch(/goStartReview[\s\S]{0,160}fetch\(/);   // no write in the Start Review path
    expect(reviews).not.toMatch(/fetch\(|\.insert\(|reviewCreate/);   // no write on the receiving side
  });
  test("the contextual workspace is NOT a primary navigation item", () => {
    const labels = PRIMARY_NAV.map((n) => n.label);
    for (const gone of ["Analysis", "Analyze", "Fund", "Workspace"]) expect(labels).not.toContain(gone);
    expect(labels).toEqual(["Home", "Firm Funds", "Discover", "Reviews"]);
  });
});
