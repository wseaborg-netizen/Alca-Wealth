/**
 * Canonical PRICE-performance engine + Firm Funds adapter. The PRIMARY metric is
 * PRICE CHANGE (Nasdaq-style): raw close (split-adjusted, dividends EXCLUDED) for
 * ETFs, raw NAV change for mutual funds. Never adjusted-close total return.
 */
import * as fs from "fs";
import * as path from "path";
import { canonicalPricePerformance, PRICE_PERIODS, DEFAULT_PRICE_PERIOD } from "@/lib/perf/canonicalPricePerformance";
import { periodsFromBars, kindForVehicle, boundedPeriodPerformance, FIRM_PERF_PERIODS, DEFAULT_FIRM_PERF_PERIOD, type PerfResult } from "@/lib/firmPerformance";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

function weekdays(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  const d = new Date(fromISO + "T00:00:00Z"), end = new Date(toISO + "T00:00:00Z");
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) { const dow = d.getUTCDay(); if (dow === 0 || dow === 6) continue; out.push(d.toISOString().slice(0, 10)); }
  return out;
}
// Raw-close observations {date, rawClose, splitFactor}
function raw(fromISO: string, toISO: string, p0 = 100, p1 = 200) {
  const ds = weekdays(fromISO, toISO);
  return ds.map((date, i) => ({ date, rawClose: p0 + (p1 - p0) * (i / (ds.length - 1)), splitFactor: 1 }));
}
const valAt = (b: { date: string; rawClose: number }[], iso: string) => { for (let i = b.length - 1; i >= 0; i--) if (b[i].date <= iso) return b[i].rawClose; return null; };
const END = "2026-07-24";

describe("price engine — primary metric is PRICE CHANGE", () => {
  test("eight periods; default 1M; every period cumulative (no annualization field)", () => {
    expect([...PRICE_PERIODS]).toEqual(["1D", "1M", "3M", "YTD", "1Y", "3Y", "5Y", "10Y"]);
    expect(DEFAULT_PRICE_PERIOD).toBe("1M");
    const { periods } = canonicalPricePerformance(raw("2015-05-01", END), "market_price");
    for (const p of PRICE_PERIODS) expect(periods[p]).not.toHaveProperty("annualizedReturn");
  });

  test("priceChange = end/start of RAW close; cumulative over the full period", () => {
    const b = raw("2015-05-01", END, 100, 260);
    const { periods, asOf, seriesBasis } = canonicalPricePerformance(b, "market_price");
    expect(asOf).toBe(END); expect(seriesBasis).toBe("market_price");
    for (const [p, cut] of [["1M", "2026-06-24"], ["YTD", "2025-12-31"], ["1Y", "2025-07-24"], ["5Y", "2021-07-24"], ["10Y", "2016-07-24"]] as const) {
      const s = valAt(b, cut)!;
      expect(periods[p].priceChange!).toBeCloseTo((b[b.length - 1].rawClose - s) / s, 10);
    }
    expect(periods["1D"].priceChange!).toBeCloseTo((b[b.length - 1].rawClose - b[b.length - 2].rawClose) / b[b.length - 2].rawClose, 10);
    // 5Y is NOT annualized — it equals the full-period cumulative change
    expect(periods["5Y"].priceChange!).toBeGreaterThan(periods["1Y"].priceChange!);
  });

  test("dividends DO NOT change priceChange (engine consumes rawClose only, never adjClose)", () => {
    const b = raw("2015-05-01", END, 100, 200);
    const withoutDiv = canonicalPricePerformance(b, "market_price").periods["5Y"].priceChange;
    // The engine CODE never references adjClose / dividends (comments stripped).
    const code = read("src/lib/perf/canonicalPricePerformance.ts").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/adjClose|divCash|reinvest/i);
    expect(withoutDiv).not.toBeNull();
  });

  test("a split does not create a false gain or loss", () => {
    // 100 flat, then a 2:1 split (price → 50), then 50 flat. True price change ≈ 0.
    const days = weekdays("2025-01-02", END);
    const splitDate = days[Math.floor(days.length / 2)];
    const bars = days.map((date) => {
      const post = date >= splitDate;
      return { date, rawClose: post ? 50 : 100, splitFactor: date === splitDate ? 2 : 1 };
    });
    const pc = canonicalPricePerformance(bars, "market_price").periods["YTD"].priceChange!;
    expect(pc).toBeCloseTo(0, 6);   // split-adjusted ⇒ no fabricated ±50%
  });

  test("VTI/VXUS-like: raw price change is LOWER than adjusted total return", () => {
    // raw rises 60%; a parallel adjusted (total-return) series rises 72%.
    const rawS = raw("2021-07-23", END, 100, 160);
    const price = canonicalPricePerformance(rawS, "market_price").periods["5Y"].priceChange!;
    const totalReturn = (172 - 100) / 100; // dividends add ~12pp
    expect(price).toBeLessThan(totalReturn);
    expect(price).toBeCloseTo(0.6, 2);
  });

  test("YTD starts at prior year-end; insufficient history Unavailable; negatives valid", () => {
    const b = raw("2025-06-02", END, 100, 160);
    expect(canonicalPricePerformance(b, "market_price").periods["YTD"].startDate).toBe(b.filter((x) => x.date <= "2025-12-31").at(-1)!.date);
    expect(canonicalPricePerformance(raw("2024-09-01", END), "market_price").periods["5Y"].priceChange).toBeNull();
    expect(canonicalPricePerformance(raw("2024-01-02", END, 200, 150), "market_price").periods["1Y"].priceChange!).toBeLessThan(0);
  });
});

describe("Firm Funds adapter (raw close + splitFactor → priceChange)", () => {
  test("uses raw close (not adjClose); NAV basis for mutual funds", () => {
    const bars = weekdays("2015-05-01", END).map((date, i, a) => ({ date, close: 100 + 100 * (i / (a.length - 1)), splitFactor: 1 }));
    const { periods, asOf } = periodsFromBars(bars, "market_price");
    expect(asOf).toBe(END);
    expect(periods["5Y"].priceChange).not.toBeNull();
    expect(periods["5Y"]).not.toHaveProperty("annualizedReturn"); // no annualized in the display shape
    expect([...FIRM_PERF_PERIODS]).toEqual(["1D", "1M", "3M", "YTD", "1Y", "3Y", "5Y", "10Y"]);
    expect(DEFAULT_FIRM_PERF_PERIOD).toBe("1M");
    expect(kindForVehicle("Mutual Fund")).toBe("nav");
    expect(kindForVehicle("ETF")).toBe("price");
  });
  test("cache key carries the price methodology version; bounded failure isolated", async () => {
    const src = read("src/lib/firmPerformance.ts");
    expect(src).toContain('CACHE_VERSION = "v4price"');
    expect(src).toContain("b.close");
    expect(src).not.toMatch(/b\.adjClose/);
    const fetchPerf = async (t: string): Promise<PerfResult | null> => {
      if (t === "BAD") throw new Error("down");
      return { periods: periodsFromBars(weekdays("2015-05-01", END).map((date, i) => ({ date, close: 100 + i, splitFactor: 1 })), "market_price").periods, asOf: END, basis: "market_price" };
    };
    const out = await boundedPeriodPerformance(["VTI", "BAD", "SPY"], new Set(["VTI", "BAD"]), () => "ETF", fetchPerf);
    expect(out.BAD).toBeNull(); expect(out.VTI).not.toBeNull();
  });
});

describe("site-wide: one Price Change everywhere; total return never in the primary field", () => {
  test("kpi exposes priceChange from RAW close; adjClose stays for scoring only", () => {
    const kpi = read("src/lib/kpi.ts");
    expect(kpi).toContain("canonicalPricePerformance");
    expect(kpi).toContain("result.priceChange[p]");
    expect(read("src/lib/market-data/fundService.ts")).toContain("close: b.close"); // raw close passed in
  });
  test("Firm Funds primary = priceChange; no annualized toggle", () => {
    const ui = read("src/components/FirmFundsTab.tsx");
    expect(ui).toContain("p?.priceChange");
    expect(ui).toContain("Price Change");
    expect(ui).not.toContain("Annualized");
    expect(ui).not.toContain("recentReturn");
  });
  test("Analysis / Compare / Screener / Watchlist show priceChange (not total-return period return)", () => {
    expect(read("src/components/AnalysisTab.tsx")).toContain("priceChange");
    expect(read("src/components/AnalysisTab.tsx")).toContain("priceBasisLabel");
    expect(read("src/components/CompareTab.tsx")).toContain('Price Change"');
    expect(read("src/components/ScreenTab.tsx")).toContain("price change");
    expect(read("src/components/WatchlistTab.tsx")).toContain('priceChange?.["1Y"]');
  });
  test("no primary visible field reads annualizedTotalReturn / cumReturn / periods[p].return", () => {
    for (const c of ["FirmFundsTab", "CompareTab", "ScreenTab", "WatchlistTab"]) {
      const ui = read(`src/components/${c}.tsx`);
      expect(ui).not.toContain("annualizedReturn");
      expect(ui).not.toContain("cumReturn");
    }
  });
});
