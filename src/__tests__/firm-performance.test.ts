/**
 * Firm Funds performance adapter — reshapes the canonical engine into the Firm
 * Funds display shape (recentReturn = PRIMARY cumulative; annualizedReturn =
 * secondary), with the 10Y-buffered fetch, versioned range-aware cache key, and
 * cumulative-primary + Total-Gain/Annualized labeling. No live provider.
 */
import * as fs from "fs";
import * as path from "path";
import {
  periodsFromBars, kindForVehicle, boundedPeriodPerformance,
  ANNUALIZED, FIRM_PERF_PERIODS, DEFAULT_FIRM_PERF_PERIOD, type PerfResult,
} from "@/lib/firmPerformance";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

function weekdays(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  const d = new Date(fromISO + "T00:00:00Z"), end = new Date(toISO + "T00:00:00Z");
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) { const dow = d.getUTCDay(); if (dow === 0 || dow === 6) continue; out.push(d.toISOString().slice(0, 10)); }
  return out;
}
function bars(fromISO: string, toISO: string, p0 = 100, p1 = 200) {
  const ds = weekdays(fromISO, toISO);
  return ds.map((date, i) => ({ date, adjClose: p0 + (p1 - p0) * (i / (ds.length - 1)) }));
}
const valAt = (b: { date: string; adjClose: number }[], iso: string) => { for (let i = b.length - 1; i >= 0; i--) if (b[i].date <= iso) return b[i].adjClose; return null; };
const END = "2026-07-24";

describe("adapter shape", () => {
  test("eight periods; default 1M; 3Y/5Y/10Y annualizable", () => {
    expect([...FIRM_PERF_PERIODS]).toEqual(["1D", "1M", "3M", "YTD", "1Y", "3Y", "5Y", "10Y"]);
    expect(DEFAULT_FIRM_PERF_PERIOD).toBe("1M");
    for (const p of ["3Y", "5Y", "10Y"] as const) expect(ANNUALIZED[p]).toBe(true);
    for (const p of ["1D", "1M", "3M", "YTD", "1Y"] as const) expect(ANNUALIZED[p]).toBe(false);
  });
  test("recentReturn = cumulative total gain; annualizedReturn only for multi-year", () => {
    const b = bars("2015-05-01", END, 100, 260);
    const { periods, asOf } = periodsFromBars(b);
    expect(asOf).toBe(END);
    // 5Y cumulative = end/start-1 over the whole 5-year window
    const s5 = valAt(b, "2021-07-24")!;
    expect(periods["5Y"].recentReturn!).toBeCloseTo((b[b.length - 1].adjClose - s5) / s5, 8);
    expect(periods["5Y"].annualizedReturn!).toBeLessThan(periods["5Y"].recentReturn!); // annualized < cumulative
    expect(periods["1Y"].annualizedReturn).toBeNull(); // no annualized for 1Y
    expect(periods["3M"].spark![0]).toBeCloseTo(valAt(b, "2026-04-24")!, 8);
  });
  test("insufficient history → Unavailable (never 0)", () => {
    const { periods } = periodsFromBars(bars("2024-09-01", END, 100, 150));
    expect(periods["3Y"].recentReturn).toBeNull();
    expect(periods["1Y"].recentReturn).not.toBeNull();
  });
});

describe("basis, cache range, bounded", () => {
  test("ETF adjusted vs mutual-fund NAV", () => {
    expect(kindForVehicle("ETF")).toBe("price");
    expect(kindForVehicle("Mutual Fund")).toBe("nav");
    expect(kindForVehicle("MF")).toBe("nav");
    expect(kindForVehicle(null)).toBe("price");
  });
  test("cache key carries version + 10Y range; buffered fetch covers the longest window", () => {
    const src = read("src/lib/firmPerformance.ts");
    expect(src).toContain('CACHE_VERSION = "v3"');
    expect(src).toContain("RANGE_TAG = `r${MAX_LOOKBACK_YEARS}y`");
    expect(src).toContain("`ffperf:${CACHE_VERSION}:${RANGE_TAG}:${SCOPE}:${ticker}:${kind}`");
    expect(src).toMatch(/setUTCFullYear\(d\.getUTCFullYear\(\) - MAX_LOOKBACK_YEARS\)[\s\S]*?setUTCDate\(d\.getUTCDate\(\) - HISTORY_BUFFER_DAYS\)/);
    expect(src).toContain('basis: kind === "nav" ? "mf_nav" : "etf_adjusted"');
  });
  test("bounded to firm holdings; partial failure isolated to Unavailable", async () => {
    const fetchPerf = async (t: string): Promise<PerfResult | null> => {
      if (t === "BAD") throw new Error("down");
      return { periods: periodsFromBars(bars("2015-05-01", END)).periods, asOf: END, basis: "etf_adjusted" };
    };
    const out = await boundedPeriodPerformance(["VTI", "BAD", "SPY"], new Set(["VTI", "BAD"]), () => "ETF", fetchPerf);
    expect(Object.keys(out).sort()).toEqual(["BAD", "VTI"]);
    expect(out.BAD).toBeNull();
    expect(out.VTI).not.toBeNull();
  });
});

describe("cumulative-primary display + labels (no annualized labeled as plain gain)", () => {
  test("Firm Funds: primary cumulative, Total Gain/Annualized toggle, /yr on annualized", () => {
    const ui = read("src/components/FirmFundsTab.tsx");
    expect(ui).toContain("perf[r.ticker]?.periods?.[period]");          // return + sparkline same period
    expect(ui).toContain("Total Gain");
    expect(ui).toMatch(/\$\{period\} Total Gain/);                       // header default = Total Gain
    expect(ui).toContain("/yr");                                        // annualized suffix
    expect(ui).toContain("showAnn ? p?.annualizedReturn : p?.recentReturn"); // primary=cumulative
    expect(ui).toContain("Total return through");
  });
  test("Analysis: cumulative-primary return metric + multi-year toggle", () => {
    const ui = read("src/components/AnalysisTab.tsx");
    expect(ui).toContain("returnStat");
    expect(ui).toContain("ps.cumulativeReturn");
    expect(ui).toContain("Total Gain");
    expect(ui).toMatch(/showAnnRet \? " \/yr" : ""/);
  });
  test("Screen/Compare surface cumulative total gain (annualized explicitly labeled)", () => {
    expect(read("src/components/ScreenTab.tsx")).toContain("total gain");
    const cmp = read("src/components/CompareTab.tsx");
    expect(cmp).toContain("Total Gain");
    expect(cmp).toContain("Annualized");
  });
});
