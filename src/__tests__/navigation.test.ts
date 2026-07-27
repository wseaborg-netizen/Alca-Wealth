/**
 * Phase 2A — primary navigation & product shell.
 *
 * Pure-data assertions on the shared nav model plus source scans that confirm
 * the shell wires it correctly, the two new destinations are honest empty
 * shells (no synthetic data), and the public marketing routing is untouched.
 */
import * as fs from "fs";
import * as path from "path";
import { PRIMARY_NAV, PRIMARY_NAV_LABELS, DISCOVER_SECTIONS, UTILITY_NAV } from "@/components/navModel";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

// ── Primary navigation is exactly the four Phase 2 destinations ───────────────

describe("primary navigation", () => {
  test("contains exactly Home, Firm Funds, Discover, Reviews — in order", () => {
    expect(PRIMARY_NAV_LABELS).toEqual(["Home", "Firm Funds", "Discover", "Reviews"]);
    expect(PRIMARY_NAV.map((n) => n.id)).toEqual(["home", "firmfunds", "discover", "reviews"]);
  });

  test("old separate discovery items are ABSENT from primary navigation", () => {
    for (const gone of ["Research", "Screener", "Screen Funds", "Similar Funds", "Find Similar",
      "Comparison", "Compare", "Analysis", "Analyze", "Advisor Overview", "Model", "Portfolio", "Tools"]) {
      expect(PRIMARY_NAV_LABELS).not.toContain(gone);
    }
  });

  test("the AppShell primary sections render exactly those four labels", () => {
    const shell = read("src/components/AppShell.tsx");
    // The primary `sections` array uses the four labels and routes Home → dashboard.
    expect(shell).toMatch(/id:\s*"home",\s*label:\s*"Home",\s*onClick:\s*\(\)\s*=>\s*switchTab\("dashboard"\)/);
    expect(shell).toMatch(/label:\s*"Firm Funds",\s*onClick:\s*\(\)\s*=>\s*switchTab\("firmfunds"\)/);
    expect(shell).toMatch(/label:\s*"Discover",\s*onClick:\s*\(\)\s*=>\s*switchTab\("research"\)/);
    expect(shell).toMatch(/label:\s*"Reviews",\s*onClick:\s*\(\)\s*=>\s*switchTab\("reviews"\)/);
    // Old primary labels are no longer primary sections.
    expect(shell).not.toMatch(/label:\s*"Advisor Overview"/);
    expect(shell).not.toMatch(/id:\s*"portfolio-ws"/);
  });
});

// ── Discover consolidates the existing discovery tools ────────────────────────

describe("Discover hub", () => {
  test("exposes the existing tools as internal sections", () => {
    const labels = DISCOVER_SECTIONS.map((s) => s.label);
    // Screener + equity style box + shortlist live under Find Funds; plus Compare,
    // Analyze (fund detail), Watchlist, and an Overview landing.
    for (const need of ["Overview", "Find Funds", "Compare", "Analyze", "Watchlist"]) {
      expect(labels).toContain(need);
    }
  });

  test("Discover is a single destination that reuses the research-family engines (no duplication)", () => {
    const shell = read("src/components/AppShell.tsx");
    // Discover routes to the existing research family + its internal subnav.
    expect(shell).toContain('aria-label="Discover sections"');
    expect(shell).not.toContain("<ScreenTab"); // AppShell mounts ScreenTab via IdeasTab, not directly
    // The discovery engines remain their existing components (reused, not rebuilt).
    for (const comp of ["IdeasTab", "CompareTab", "AnalysisTab", "WatchlistTab"]) {
      expect(shell).toContain(comp);
    }
  });
});

// ── Contextual fund workspace (fund detail / Analyze) ─────────────────────────

describe("contextual fund workspace", () => {
  test("fund detail (Analyze) is contextual — present in Discover, absent from primary nav", () => {
    expect(DISCOVER_SECTIONS.map((s) => s.label)).toContain("Analyze");
    expect(PRIMARY_NAV_LABELS).not.toContain("Analyze");
    expect(PRIMARY_NAV_LABELS).not.toContain("Fund Analysis");
    // AnalysisTab is still reached contextually (goAnalyze), not duplicated.
    const shell = read("src/components/AppShell.tsx");
    expect(shell).toContain("const goAnalyze");
    expect(shell).toContain("<AnalysisTab");
  });
});

// ── Models and Portfolios preserved but not primary ───────────────────────────

describe("Models and Portfolios", () => {
  test("are preserved in the secondary Tools menu, not primary navigation", () => {
    const utilLabels = UTILITY_NAV.map((n) => n.label);
    expect(utilLabels).toContain("Portfolio");
    expect(utilLabels).toContain("Model");
    expect(PRIMARY_NAV_LABELS).not.toContain("Portfolio");
    expect(PRIMARY_NAV_LABELS).not.toContain("Model");
  });

  test("their routes/components are still mounted by the shell (not deleted)", () => {
    const shell = read("src/components/AppShell.tsx");
    for (const comp of ["<PortfoliosTab", "<ModelTab", "<MurderBoardTab"]) {
      expect(shell).toContain(comp);
    }
    // Secondary Tools menu is passed to the nav as a utility (not a primary section).
    expect(shell).toContain("utilitySection");
    expect(read("src/components/TopNav.tsx")).toContain("utilitySection");
  });
});

// ── Public marketing routing is unchanged ─────────────────────────────────────

describe("public marketing routing unchanged", () => {
  test("anonymous still lands on the marketing homepage; signed-in on Home (dashboard)", () => {
    const av = read("src/lib/authView.ts");
    expect(av).toMatch(/none[\s\S]*?home|home[\s\S]*?none/);
    const shell = read("src/components/AppShell.tsx");
    expect(shell).toContain("<HomeTab");                 // marketing splash still rendered
    expect(read("src/components/TopNav.tsx")).toContain("About ALCA");
  });
});

// ── New shells introduce no synthetic data ────────────────────────────────────

describe("Reviews workflow + Firm Funds inventory", () => {
  // Phase 2E replaced the Reviews empty shell with the real firm-scoped workflow;
  // it fetches from the API and keeps an honest empty state, no synthetic cases.
  test("Reviews is the real workflow with an honest empty state and no synthetic data", () => {
    const src = read("src/components/ReviewsTab.tsx");
    expect(src).toMatch(/No reviews yet/i);
    expect(src).not.toMatch(/Math\.random/);
    expect(src).not.toMatch(/mockReviews|sampleReviews|demoReviews/i);
    expect(src).not.toMatch(/from\s+["']@\/lib\/(universe|market-data|kpi|fundService)/); // no client provider import
  });

  // Phase 2C replaced the Firm Funds empty shell with the real inventory; it now
  // fetches firm-scoped data from the API and keeps an honest empty state.
  test("Firm Funds is the real inventory with an honest empty state and no synthetic records", () => {
    const src = read("src/components/FirmFundsTab.tsx");
    expect(src).toMatch(/No funds in your inventory yet/i);
    expect(src).not.toMatch(/Math\.random/);
    expect(src).not.toMatch(/mockFunds|sampleFunds|demoFunds|fakeFunds/i);
  });
});
