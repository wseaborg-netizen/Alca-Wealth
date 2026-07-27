/**
 * 2D/2E — portfolio routes on the unified score engine + saved fund lists.
 * Deterministic unit tests for the adapters, plus source/migration scans.
 */
import * as fs from "fs";
import * as path from "path";
import {
  sleeveContext, contextFromPriorities, REPLACE_REASON_CONTEXT, rankRecords, recordToScoreInputs,
} from "@/lib/metrics/recordScore";
import { EMPTY_PERIOD, type KpiResult } from "@/lib/kpi";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

// ── Sleeve / priority / reason → scoring context ─────────────────────────────

describe("portfolio sleeve → scoring context mapping", () => {
  test("core/broad sleeves score by Low Cost / Core Index", () => {
    expect(sleeveContext("US Equity Large Blend")).toBe("lowCost");
    expect(sleeveContext("International Equity")).toBe("lowCost");
    expect(sleeveContext("Total Market")).toBe("lowCost");
  });
  test("growth sleeves score by Growth", () => {
    expect(sleeveContext("US Equity Large Growth")).toBe("growth");
  });
  test("bond sleeves: risk reducer by default, income engine under income goal", () => {
    expect(sleeveContext("Intermediate Core Bond")).toBe("downside");
    expect(sleeveContext("Intermediate Core Bond", "income")).toBe("income");
    expect(sleeveContext("Municipal Bond", "growth")).toBe("downside");
  });
  test("dividend/income equity scores by Income; unclear falls to Overall Review", () => {
    expect(sleeveContext("Dividend Equity")).toBe("income");
    expect(sleeveContext("Something Unusual")).toBe("overall");
  });
  test("profile priorities and replace reasons map onto contexts", () => {
    expect(contextFromPriorities(["Low cost"])).toBe("lowCost");
    expect(contextFromPriorities(["Income / yield"])).toBe("income");
    expect(contextFromPriorities([])).toBe("overall");
    expect(REPLACE_REASON_CONTEXT.cost).toBe("lowCost");
    expect(REPLACE_REASON_CONTEXT.risk).toBe("downside");
    expect(REPLACE_REASON_CONTEXT.yield).toBe("income");
  });
});

// ── rankRecords adapter (deterministic synthetic records) ────────────────────

const mkKpi = (ret: number, sharpe: number, dd: number, vol: number): KpiResult => ({
  return1y: null, return3y: null, return5y: null, stdDev3y: null, maxDrawdown5y: null,
  maxDrawdown3y: null, sharpe3y: null, sortino3y: null, calmar3y: null, infoRatio3y: null,
  beta3y: null, alpha3y: null, upsideCapture3y: null, downsideCapture3y: null,
  battingAvg3y: 50, ttmYield: 2, divGrowth3y: null, rolling3y: [], stressTests: [],
  cumReturn: { "1Y": null, "3Y": ret, "5Y": null, "10Y": null },
  priceChange: { "1Y": null, "3Y": ret, "5Y": null, "10Y": null },
  periods: {
    "1Y": { ...EMPTY_PERIOD }, "5Y": { ...EMPTY_PERIOD }, "10Y": { ...EMPTY_PERIOD },
    "3Y": { return: ret, cumulativeReturn: ret, annualizedReturn: ret, sharpe, maxDrawdown: dd, volatility: vol, sortino: null, beta: null, alpha: null },
  },
});
const rec = (ticker: string, ret: number, sharpe: number, dd: number, vol: number, er: number) => ({
  ticker, name: ticker, vehicle: "ETF", category: "US Equity Large Blend",
  expenseRatio: er, fundAge: 10, kpi: mkKpi(ret, sharpe, dd, vol),
});

describe("rankRecords (routes' unified scoring adapter)", () => {
  const pool = [
    rec("AAA", 10, 1.2, -12, 12, 0.05),
    rec("BBB", 8, 0.9, -16, 14, 0.20),
    rec("CCC", 6, 0.6, -20, 16, 0.40),
    rec("DDD", 4, 0.3, -25, 18, 0.80),
    rec("EEE", 2, 0.1, -30, 20, 1.20),
  ];

  test("orders by context score with a stated reason; missing data never becomes zero", () => {
    const ranked = rankRecords(pool, "overall", "3Y");
    expect(ranked[0].item.ticker).toBe("AAA");
    expect(ranked[ranked.length - 1].item.ticker).toBe("EEE");
    expect(ranked[0].reason).toBeTruthy();
    // A record with NO 3Y stats gets null score, not zero — and sorts last.
    const thin = rec("THIN", 0, 0, 0, 0, 0.1);
    thin.kpi.periods["3Y"] = { ...EMPTY_PERIOD };
    thin.kpi.ttmYield = null; thin.kpi.battingAvg3y = null; (thin as { fundAge: number | null }).fundAge = null;
    const withThin = rankRecords([...pool, thin], "overall", "3Y");
    const t = withThin.find((r) => r.item.ticker === "THIN")!;
    expect(t.score).toBeNull();
    expect(withThin[withThin.length - 1].item.ticker).toBe("THIN");
  });

  test("recordToScoreInputs carries ER/yield/age/batting + period stats", () => {
    const i = recordToScoreInputs(pool[0], "3Y");
    expect(i.expenseRatio).toBe(0.05);
    expect(i.stats?.return).toBe(10);
    expect(i.fundAge).toBe(10);
  });
});

// ── Source scans: old engine gone, new engine wired ──────────────────────────

describe("legacy fit composite fully replaced", () => {
  const routes = [
    "src/app/api/recommend/route.ts",
    "src/app/api/replace/route.ts",
    "src/app/api/portfolio/select/route.ts",
    "src/app/api/screen/route.ts",
  ];
  test("no route uses compositeScore; all use the unified engine", () => {
    for (const r of routes) {
      const src = read(r);
      expect(src).not.toMatch(/compositeScore\s*\(/);
      expect(/rankRecords|rankFundsForContext/.test(src)).toBe(true);
    }
  });
  test("the old compositeScore engine no longer exists in kpi.ts", () => {
    expect(read("src/lib/kpi.ts")).not.toContain("compositeScore");
  });
  test("no recommendation/buy/sell language in portfolio-selection reasons", () => {
    for (const r of routes) {
      expect(read(r)).not.toMatch(/best fit|recommended|buy this|sell this|should invest/i);
    }
  });
});

// ── Saved fund lists ──────────────────────────────────────────────────────────

describe("saved fund lists: migration + API + UI presence", () => {
  const mig = read("supabase/migrations/20260717150000_fund_lists.sql").toLowerCase();

  test("migration adds list types, notes, and provisions both defaults", () => {
    expect(mig).toMatch(/type in \('common', 'watchlist', 'custom'\)/);
    expect(mig).toContain("add column if not exists note");
    expect(mig).toContain("'commonly used funds', 'common'");
    expect(mig).toContain("'watchlist', 'watchlist'");
    // signup trigger creates both defaults
    expect((mig.match(/insert into watchlists \(firm_id, created_by, name, type\) values \(new_firm/g) ?? []).length).toBe(2);
    // no anon access introduced
    expect(mig).not.toMatch(/to anon\b/);
  });

  test("duplicate prevention comes from the primary key + upsert (same ticker ok across lists)", () => {
    const db = read("src/lib/db.ts");
    expect(db).toMatch(/upsert\(\{\s*\n?\s*watchlist_id: listId/);
    expect(db).toContain('{ onConflict: "watchlist_id,ticker" }');
    // deletes cascade via the existing FK; custom-only guards on rename/delete
    expect(db).toMatch(/\.eq\("type", "custom"\); \/\/ defaults keep their names/);
  });

  test("/api/lists requires auth (401 when signed out) and is firm-scoped via requireFirmContext", () => {
    const src = read("src/app/api/lists/route.ts");
    expect(src).toContain("requireFirmContext");
    expect(src).toContain("status: 401");
  });

  test("Save to List appears on Analysis, Screener, Similar Funds, and portfolio results", () => {
    expect(read("src/components/AnalysisTab.tsx").match(/<SaveToList/g)!.length).toBeGreaterThanOrEqual(2); // header + similar rows
    expect(read("src/components/ScreenTab.tsx")).toContain("<SaveToList");
    expect(read("src/components/RecommendTab.tsx")).toContain("<SaveToList");
  });

  test("Saved Lists is reachable from the top nav and handles signed-out state", () => {
    const shell = read("src/components/AppShell.tsx");
    // The "Saved Lists" label lives in the shared nav model (secondary Tools menu);
    // the shell wires it to its tab and mounts the component.
    expect(read("src/components/navModel.ts")).toContain('"Saved Lists"');
    expect(shell).toContain('switchTab("lists")');
    expect(shell).toContain("ListsTab");
    const lists = read("src/components/ListsTab.tsx");
    expect(lists).toContain("Sign in to use Saved Lists");
    expect(lists).toContain("Commonly used funds");
  });

  test("signed-out SaveToList prompts login instead of pretending to save", () => {
    const src = read("src/components/SaveToList.tsx");
    expect(src).toContain("Sign in to save funds");
    expect(src).toContain("Save failed"); // failure surfaces honestly
    expect(src).not.toMatch(/playlist/i);
  });

  test("future alert hook is reserved, not built", () => {
    expect(mig).toContain("alert_enabled");
    expect(read("src/components/ListsTab.tsx")).toContain("Future alert monitoring");
  });
});
