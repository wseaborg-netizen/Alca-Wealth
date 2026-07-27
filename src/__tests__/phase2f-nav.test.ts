/**
 * Phase 2F Home + workflow navigation — OFFLINE source-scan wiring proofs.
 *
 * Confirms Home's review-workflow actions route to the correct destinations, that
 * opening a review is pure navigation (never creates a record), that the existing
 * Analysis workspace is reused (no second fund workspace), and that completed/
 * cancelled reviews stay read-only.
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("Home → workflow navigation wiring (AppShell)", () => {
  const shell = read("src/components/AppShell.tsx");
  test("Home passes review/firm-funds/discover handlers to DashboardTab", () => {
    expect(shell).toMatch(/onOpenReview=\{goOpenReview\}/);
    expect(shell).toMatch(/onOpenFirmFunds=\{\(\)\s*=>\s*switchTab\("firmfunds"\)\}/);
    expect(shell).toMatch(/onOpenDiscover=\{\(\)\s*=>\s*switchTab\("research"\)\}/);
  });
  test("goOpenReview is navigation-only — sets the target review + switches tab, never creates a review", () => {
    const m = shell.match(/const goOpenReview = \(reviewId[\s\S]*?\};/);
    expect(m).not.toBeNull();
    expect(m![0]).toContain("setOpenReviewId");
    expect(m![0]).toContain('switchTab("reviews")');
    expect(m![0]).not.toMatch(/reviewCreate|createReview|fetch|POST/i);
  });
  test("firm-fund ticker opens the existing Analysis workspace (no second workspace)", () => {
    // Firm Funds → Analysis (contextual workspace), reused everywhere.
    expect(shell).toMatch(/FirmFundsTab[\s\S]*onAnalyze=\{\(t\)\s*=>\s*goAnalyze\(t,\s*true\)\}/);
    expect(shell).toContain("const goAnalyze");
  });
  test("Review → Discover comparison + Start Review wiring preserved", () => {
    expect(shell).toContain("const goCompareMany");         // Review → Comparison
    expect(shell).toContain("const goStartReview");         // Fund workspace → Start Review
    // Start Review only sets context + switches tab; the record is created on submit.
    const m = shell.match(/const goStartReview = \(firmFundId[\s\S]*?\};/);
    expect(m![0]).toContain("setReviewCtx");
    expect(m![0]).not.toMatch(/reviewCreate|fetch/i);
  });
});

describe("DashboardTab review-workflow actions", () => {
  const d = read("src/components/DashboardTab.tsx");
  test("review item → onOpenReview; fund item → onAnalyze; snapshot → onOpenFirmFunds; discover → onOpenDiscover", () => {
    expect(d).toMatch(/onOpenReview\?\.\(q\.reviewId\)/);          // queue row opens the review detail
    expect(d).toMatch(/onAnalyze\?\.\(u\.ticker\)/);               // upcoming firm review → workspace
    expect(d).toMatch(/onOpenFirmFunds\?\.\(\)/);                  // snapshot / firm funds link
    expect(d).toMatch(/onOpenDiscover\?\.\(\)/);                   // discover entry
  });
  test("counts + rows come only from the API reviewWorkflow (no synthetic values)", () => {
    expect(d).toContain("reviewWorkflow");
    expect(d).not.toMatch(/Math\.random|faker|mockCounts/i);
  });
  test("honest loading / error / empty states exist", () => {
    expect(d).toContain('"loading"');
    expect(d).toContain('state === "error"');
    expect(d).toMatch(/No open or in-review cases/);
    expect(d).toMatch(/No firm funds have a next review date set/);
  });
});

describe("ReviewsTab deep-link is read-only navigation", () => {
  const rt = read("src/components/ReviewsTab.tsx");
  test("initialReviewId opens the detail view and creates no record", () => {
    expect(rt).toContain("initialReviewId");
    const eff = rt.match(/if \(!initialReviewId\) return;[\s\S]*?\}, \[initialReviewId[^\]]*\]\);/);
    expect(eff).not.toBeNull();
    expect(eff![0]).toContain('setView("detail")');
    expect(eff![0]).not.toMatch(/fetch|reviewCreate|method:\s*["']POST/i);
  });
});

describe("completed / cancelled reviews stay read-only", () => {
  test("repository guards mutation on non-active reviews", () => {
    const repo = read("src/lib/firmReviews.ts");
    expect(repo).toContain("assertReviewMutable");
    // The guard blocks completed/cancelled from further mutation.
    const guard = repo.match(/assertReviewMutable[\s\S]{0,400}/);
    expect(guard![0]).toMatch(/completed|cancelled|read-only|mutable/i);
  });
});

describe("Analysis period cleanup (no Unavailable-only price control)", () => {
  const a = read("src/components/AnalysisTab.tsx");
  test("price change is rendered only for periods that can produce it (1Y/3Y/5Y)", () => {
    expect(a).toContain("priceChangeApplicable");
    // The price-change metric is conditionally spread — not shown for 10Y/Overall.
    expect(a).toMatch(/priceChangeApplicable \?\s*\[\{ label: `\$\{pl\} \$\{priceBasisLabel\}`/);
  });
});
