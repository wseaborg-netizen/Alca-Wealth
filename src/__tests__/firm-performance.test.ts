/**
 * Phase 2E fix — Firm Funds performance periods.
 *
 * Pure-math tests for calendar-cutoff windows, 3Y annualization, buffered/insufficient
 * history, adjusted-price protection, return/sparkline consistency, and cache-range
 * isolation. No live provider — the correctness is in periodsFromBars.
 */
import * as fs from "fs";
import * as path from "path";
import {
  periodsFromBars, kindForVehicle, boundedPeriodPerformance,
  ANNUALIZED, FIRM_PERF_PERIODS, DEFAULT_FIRM_PERF_PERIOD, type PerfResult,
} from "@/lib/firmPerformance";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

// Weekday-only date strings in [from, to], optionally skipping holidays.
function weekdays(fromISO: string, toISO: string, holidays: string[] = []): string[] {
  const out: string[] = [];
  const d = new Date(fromISO + "T00:00:00Z"), end = new Date(toISO + "T00:00:00Z");
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay(); if (dow === 0 || dow === 6) continue;
    const s = d.toISOString().slice(0, 10); if (holidays.includes(s)) continue;
    out.push(s);
  }
  return out;
}
// Linear adjusted-price series from p0→p1 across the weekday span.
function bars(fromISO: string, toISO: string, p0 = 100, p1 = 200, holidays: string[] = []) {
  const ds = weekdays(fromISO, toISO, holidays);
  return ds.map((date, i) => ({ date, adjClose: p0 + (p1 - p0) * (i / (ds.length - 1)) }));
}
const valAt = (b: { date: string; adjClose: number }[], iso: string) => { for (let i = b.length - 1; i >= 0; i--) if (b[i].date <= iso) return b[i].adjClose; return null; };

const END = "2026-07-24"; // a Friday

describe("period windows", () => {
  test("exactly eight periods; default 1M; 3Y/5Y/10Y annualized", () => {
    expect([...FIRM_PERF_PERIODS]).toEqual(["1D", "1M", "3M", "YTD", "1Y", "3Y", "5Y", "10Y"]);
    expect(DEFAULT_FIRM_PERF_PERIOD).toBe("1M");
    for (const p of ["3Y", "5Y", "10Y"] as const) expect(ANNUALIZED[p]).toBe(true);
    for (const p of ["1D", "1M", "3M", "YTD", "1Y"] as const) expect(ANNUALIZED[p]).toBe(false);
  });

  test("3Y with weekends + holidays computes and is annualized (not cumulative)", () => {
    const b = bars("2023-05-01", END, 100, 200, ["2023-07-04", "2024-12-25", "2025-01-01"]);
    const { periods, asOf } = periodsFromBars(b);
    expect(asOf).toBe(END);
    expect(periods["3Y"].recentReturn).not.toBeNull();
    expect(periods["3Y"].annualized).toBe(true);
    // 3Y start is ~2023-07-24; annualized over ~3y is far below the cumulative figure.
    const start = valAt(b, "2023-07-24")!;
    const cumulative = (b[b.length - 1].adjClose - start) / start;
    expect(periods["3Y"].recentReturn!).toBeLessThan(cumulative - 0.1); // annualized ≪ cumulative
    expect(periods["3Y"].recentReturn!).toBeGreaterThan(0);
  });

  test("exact three-year boundary uses the bar at last − 3 years", () => {
    // First bar is exactly 2023-07-24 (a Monday). Linear 100→200 ⇒ start=100.
    const b = bars("2023-07-24", END, 100, 200);
    const { periods } = periodsFromBars(b);
    const T = (Date.parse(END) - Date.parse("2023-07-24")) / (365.25 * 864e5);
    expect(periods["3Y"].recentReturn!).toBeCloseTo(Math.pow(200 / 100, 1 / T) - 1, 4);
  });

  test("insufficient 3Y history → Unavailable (null), never 0; 1Y still available", () => {
    const b = bars("2024-09-01", END, 100, 150);
    const { periods } = periodsFromBars(b);
    expect(periods["3Y"]).toEqual({ recentReturn: null, spark: null, annualized: true });
    expect(periods["1Y"].recentReturn).not.toBeNull();
  });

  test("1D uses the previous trading-day close (cumulative)", () => {
    const b = bars("2026-05-01", END, 100, 130);
    const { periods } = periodsFromBars(b);
    const last = b[b.length - 1].adjClose, prev = b[b.length - 2].adjClose;
    expect(periods["1D"].recentReturn!).toBeCloseTo((last - prev) / prev, 8);
    expect(periods["1D"].spark).toBeNull(); // 2-point window → no sparkline
  });

  test("YTD uses the previous year-end close", () => {
    const b = bars("2025-06-02", END, 100, 160);
    const { periods } = periodsFromBars(b);
    const dec31 = valAt(b, "2025-12-31")!; // last 2025 trading day on/before Dec 31
    const last = b[b.length - 1].adjClose;
    expect(periods["YTD"].recentReturn!).toBeCloseTo((last - dec31) / dec31, 8);
  });

  test("1M and 3M use calendar-month cutoffs (nearest trading day on/before)", () => {
    const b = bars("2025-06-02", END, 100, 200);
    const { periods } = periodsFromBars(b);
    const last = b[b.length - 1].adjClose;
    expect(periods["1M"].recentReturn!).toBeCloseTo((last - valAt(b, "2026-06-24")!) / valAt(b, "2026-06-24")!, 8);
    expect(periods["3M"].recentReturn!).toBeCloseTo((last - valAt(b, "2026-04-24")!) / valAt(b, "2026-04-24")!, 8);
  });

  test("return + sparkline share the same source range", () => {
    const b = bars("2025-06-02", END, 100, 200);
    const { periods } = periodsFromBars(b);
    const start3m = valAt(b, "2026-04-24")!;
    expect(periods["3M"].spark![0]).toBeCloseTo(start3m, 8);          // spark starts at the return's start bar
    expect(periods["3M"].spark!.at(-1)).toBeCloseTo(b[b.length - 1].adjClose, 8);
  });

  test("consumes adjusted close only (raw close never used)", () => {
    // Only adjClose is populated; a divergent raw `close` (ignored by the type) must not affect results.
    const b = [{ date: "2026-07-22", adjClose: 100 }, { date: "2026-07-23", adjClose: 110 }, { date: "2026-07-24", adjClose: 121 }];
    const { periods } = periodsFromBars(b);
    expect(periods["1D"].recentReturn!).toBeCloseTo((121 - 110) / 110, 8);
    const src = read("src/lib/firmPerformance.ts");
    expect(src).toContain("b.adjClose");
    expect(src).not.toMatch(/b\.close\b/);
  });

  test("returns are unrounded (rounding happens only at display)", () => {
    const b = bars("2026-06-01", END, 100, 107.3333);
    const r = periodsFromBars(b).periods["1M"].recentReturn!;
    expect(r).not.toBe(Number(r.toFixed(2))); // full precision retained
  });
});

describe("basis, cache range, and labels", () => {
  test("ETF uses adjusted price; mutual fund uses NAV", () => {
    expect(kindForVehicle("ETF")).toBe("price");
    expect(kindForVehicle("Mutual Fund")).toBe("nav");
    expect(kindForVehicle("MF")).toBe("nav");
    expect(kindForVehicle(null)).toBe("price");
  });
  test("cache key carries version + range coverage (short history can't contaminate long periods)", () => {
    const src = read("src/lib/firmPerformance.ts");
    expect(src).toContain('CACHE_VERSION = "v3"');
    expect(src).toContain("RANGE_TAG = `r${MAX_LOOKBACK_YEARS}y`");
    expect(src).toContain("`ffperf:${CACHE_VERSION}:${RANGE_TAG}:${SCOPE}:${ticker}:${kind}`");
    // buffered fetch covers the longest lookback (10Y) so every cutoff has a bar
    expect(src).toMatch(/setUTCFullYear\(d\.getUTCFullYear\(\) - MAX_LOOKBACK_YEARS\)[\s\S]*?setUTCDate\(d\.getUTCDate\(\) - HISTORY_BUFFER_DAYS\)/);
  });
  test("basis is derived from the series kind", () => {
    const src = read("src/lib/firmPerformance.ts");
    expect(src).toContain('basis: kind === "nav" ? "mf_nav" : "etf_adjusted"');
  });
  test("UI labels annualized periods + an honest as-of and basis note", () => {
    const ui = read("src/components/FirmFundsTab.tsx");
    expect(ui).toMatch(/\$\{period\} Annualized/);
    expect(ui).toContain("IS_ANNUALIZED");
    expect(ui).toContain("Total return through");
    expect(ui).toMatch(/adjusted-close total return[\s\S]*?NAV total return/);
    expect(ui).toContain("perf[r.ticker]?.periods?.[period]"); // return + sparkline read the same period
  });
});

describe("bounded enrichment", () => {
  test("only firm holdings enriched; partial provider failure isolated to Unavailable", async () => {
    const fetchPerf = async (t: string): Promise<PerfResult | null> => {
      if (t === "BAD") throw new Error("provider down");
      return { periods: periodsFromBars(bars("2023-05-01", END)).periods, asOf: END, basis: "etf_adjusted" };
    };
    const out = await boundedPeriodPerformance(["VTI", "BAD", "SPY"], new Set(["VTI", "BAD"]), () => "ETF", fetchPerf);
    expect(Object.keys(out).sort()).toEqual(["BAD", "VTI"]); // SPY excluded (not in firm)
    expect(out.BAD).toBeNull();
    expect(out.VTI).not.toBeNull();
  });
  test("period state persists across navigation (Firm Funds stays mounted)", () => {
    expect(read("src/components/AppShell.tsx")).toMatch(/display: tab === "firmfunds" \? "block" : "none"/);
  });
});
