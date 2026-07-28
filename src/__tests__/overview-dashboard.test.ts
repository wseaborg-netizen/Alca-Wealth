/**
 * Advisor Overview dashboard — OFFLINE.
 *
 * Unit-tests the pure performer ranking, and source-scans the DashboardTab for the
 * locked period vocabulary, canonical Price Change sourcing, firm-scoping, honest
 * empty states, "no reviews in the right column", row navigation, and the legal
 * footer. The Public Homepage is confirmed unchanged.
 */
import * as fs from "fs";
import * as path from "path";
import { rankPerformers } from "@/lib/overviewRank";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const dash = read("src/components/DashboardTab.tsx");

describe("performer ranking (pure)", () => {
  const rows = [
    { ticker: "A", pc: 0.05 }, { ticker: "B", pc: -0.03 }, { ticker: "C", pc: null },
    { ticker: "D", pc: 0.12 }, { ticker: "E", pc: -0.08 }, { ticker: "F", pc: 0 },
  ];
  test("Top Performers sort descending by price change", () => {
    expect(rankPerformers(rows, "top").map((r) => r.ticker)).toEqual(["D", "A", "F", "B", "E"]);
  });
  test("Worst Performers sort ascending by price change", () => {
    expect(rankPerformers(rows, "worst").map((r) => r.ticker)).toEqual(["E", "B", "F", "A", "D"]);
  });
  test("missing values are excluded from ranking (never treated as 0%)", () => {
    expect(rankPerformers(rows, "top").find((r) => r.ticker === "C")).toBeUndefined();
    expect(rankPerformers(rows, "worst").find((r) => r.ticker === "C")).toBeUndefined();
    // A genuine 0% stays; a null is dropped — the two are never conflated.
    expect(rankPerformers([{ ticker: "Z", pc: null }], "worst")).toEqual([]);
  });
  test("caps at 10", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ ticker: `T${i}`, pc: i / 100 }));
    expect(rankPerformers(many, "top")).toHaveLength(10);
    expect(rankPerformers(many, "top", 10)[0].ticker).toBe("T24");
  });
});

describe("locked period + metric", () => {
  test("exactly nine periods; no 3M/10Y; no total return / risk-adjusted / CAGR toggles", () => {
    expect(dash).toContain('["1D", "5D", "1M", "6M", "YTD", "1Y", "3Y", "5Y", "Max"]');
    expect(dash).not.toMatch(/"3M"|"10Y"/);
    expect(dash).not.toMatch(/Total Return|Risk-Adjusted|CAGR|Annualized|reinvest/i);
  });
  test("the single metric is canonical Price Change from the firm performance endpoint", () => {
    expect(dash).toContain("/api/firm-funds/performance");
    expect(dash).toMatch(/periods\?\.\[period\]/);
    expect(dash).toMatch(/pp\?\.priceChange/);
  });
});

describe("firm scoping + navigation", () => {
  test("performers come only from the authenticated firm's inventory", () => {
    expect(dash).toContain("/api/firm-funds");         // firm-scoped inventory (server resolves firm_id)
    expect(dash).not.toContain("/api/universe");       // never the global universe
    expect(dash).not.toContain("firm_id");             // browser never chooses firm_id
  });
  test("clicking a performer row opens the existing fund workspace", () => {
    expect(dash).toMatch(/onClick=\{\(\) => onAnalyze\(r\.ticker\)\}/);
  });
  test("period state drives the rankings (period change re-ranks + re-sparklines)", () => {
    expect(dash).toMatch(/periods\?\.\[period\]/);
    expect(dash).toMatch(/rankPerformers\(ranked, "top"/);
    expect(dash).toMatch(/rankPerformers\(ranked, "worst"/);
  });
});

describe("honest empty states + no fabrication", () => {
  test("missing performance shows Unavailable, never 0%", () => {
    expect(dash).toContain('"Unavailable"');
    // fmtPct returns null (not 0) for null/non-finite, so the cell reads Unavailable.
    expect(dash).toMatch(/v == null \? C\.mute/);
    expect(dash).not.toMatch(/priceChange[^\n]*\?\?\s*0\b/);
  });
  test("Held Fund Intelligence uses empty states, never fake production rows", () => {
    expect(dash).toContain("No recent fund news.");
    expect(dash).toContain("Matched news for your Firm Funds will appear here.");
    expect(dash).toContain("No recent filings.");
    expect(dash).toContain("Matched SEC filings for your Firm Funds will appear here.");
    // no fabricated headline/filing rows
    expect(dash).not.toMatch(/Schwab Announces|Prospectus Update|N-PORT|8-K/);
  });
  test("Sector Movers is honest when unsupported", () => {
    expect(dash).toContain("Sector analytics unavailable.");
  });
  test("summary cards mark unsupported metrics Unavailable (no copied screenshot numbers)", () => {
    expect(dash).toMatch(/label="New Filings" value=\{null\} unavailable/);
    expect(dash).toMatch(/label="News Updates" value=\{null\} unavailable/);
    expect(dash).toMatch(/label="Watchlist Changes" value=\{null\} unavailable/);
  });
});

describe("right column is market/monitoring only — no reviews", () => {
  test("right column contains Market Pulse / Watchlist Momentum / Sector Movers and no review cards", () => {
    const rc = dash.slice(dash.indexOf("const rightColumn = ("), dash.indexOf("const attnRow ="));
    expect(rc).toContain("Market Pulse");
    expect(rc).toContain("Watchlist Momentum");
    expect(rc).toContain("Sector Movers");
    expect(rc).not.toMatch(/review/i);
  });
});

describe("legal footer", () => {
  test("footer links to Privacy, Terms, Disclosures", () => {
    for (const l of ["Privacy", "Terms", "Disclosures"]) expect(dash).toContain(`"${l}"`);
    expect(dash).toMatch(/"\/privacy"/); expect(dash).toMatch(/"\/terms"/); expect(dash).toMatch(/"\/disclosures"/);
  });
  test("legal routes exist; verified company name (no unverified LLC entity)", () => {
    for (const p of ["src/app/privacy/page.tsx", "src/app/terms/page.tsx", "src/app/disclosures/page.tsx"]) {
      expect(fs.existsSync(path.join(ROOT, p))).toBe(true);
    }
    expect(dash).not.toContain("ALCA Wealth Advisors, LLC");
    expect(dash).toContain("© {new Date().getFullYear()} ALCA Wealth");
  });
});

describe("Public Homepage remains unchanged", () => {
  test("HomeTab still renders the approved public hero", () => {
    const home = read("src/components/HomeTab.tsx");
    expect(home).toContain(">Research.<");
    expect(home).toContain(">Monitor.<");
    expect(home).toContain("function PublicNav()");
  });
});
