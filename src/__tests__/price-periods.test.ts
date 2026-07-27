/**
 * Site-wide price-return period unification — OFFLINE (no provider network).
 *
 * Proves the ONE canonical price engine and its date-selection govern every
 * visible price-return surface, and that the 1M divergence (getMarketQuote's old
 * fixed 21-session lookback vs the calendar-month cutoff) is gone: getMarketQuote
 * now routes through canonicalPricePerformance, so a 1M quote equals the Firm
 * Funds 1M for identical inputs. Also pins the new locked period vocabulary,
 * the mutual-fund NAV fix, and the cache-version bumps.
 */
import * as fs from "fs";
import * as path from "path";
import {
  canonicalPricePerformance, PRICE_PERIODS, DEFAULT_PRICE_PERIOD,
} from "@/lib/perf/canonicalPricePerformance";
import { getMarketQuote, __setProviderForTests } from "@/lib/market-data/marketQuote";
import { periodsFromBars, kindForVehicle } from "@/lib/firmPerformance";
import { cacheClear } from "@/lib/cache";
import type { MarketDataProvider } from "@/lib/market-data";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

// ── Synthetic RAW-close series (no holidays: pure weekdays, each day distinct) ──
function weekdays(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  const d = new Date(fromISO + "T00:00:00Z"), end = new Date(toISO + "T00:00:00Z");
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) { const dow = d.getUTCDay(); if (dow === 0 || dow === 6) continue; out.push(d.toISOString().slice(0, 10)); }
  return out;
}
type Obs = { date: string; rawClose: number; splitFactor: number };
// Market holidays dropped from the synthetic series so a ~1-month span contains
// FEWER than 21 trading sessions — which is exactly what makes a fixed
// 21-session lookback diverge from the calendar-month cutoff (the reported bug).
const HOLIDAYS = new Set(["2026-01-19", "2026-01-01", "2025-12-25", "2025-11-27"]);
/** Distinct monotone price per day so any two different start bars ⇒ different %. */
function series(fromISO: string, toISO: string, p0 = 100, step = 0.37): Obs[] {
  return weekdays(fromISO, toISO)
    .filter((d) => !HOLIDAYS.has(d))
    .map((date, i) => ({ date, rawClose: p0 + i * step, splitFactor: 1 }));
}
const valAtOnOrBefore = (b: Obs[], iso: string) => { for (let i = b.length - 1; i >= 0; i--) if (b[i].date <= iso) return b[i]; return null; };

// ── Fake provider for getMarketQuote (records the requested kind) ──────────────
let lastKind: string | undefined;
function installProvider(bars: Obs[]) {
  const provider = {
    getPriceHistory: async (symbol: string, _c: unknown, opts?: { kind?: string }) => {
      lastKind = opts?.kind;
      return {
        ok: true as const,
        data: {
          symbol, kind: opts?.kind ?? "price",
          bars: bars.map((b) => ({ date: b.date, close: b.rawClose, adjClose: b.rawClose, open: null, high: null, low: null, volume: null, splitFactor: b.splitFactor })),
          availability: { status: "available" as const, count: bars.length },
          provenance: { source: "tiingo" as const, fetchedAt: "t" },
          freshness: { asOf: null, observedAt: "t" },
        },
      };
    },
    getPriceSeries: async () => ({ ok: false as const, error: { kind: "provider_error" as const, category: "not_found", retryable: false, message: "x", source: "tiingo" as const } }),
  };
  __setProviderForTests(provider as unknown as MarketDataProvider);
}

beforeEach(async () => { await cacheClear(); lastKind = undefined; });
afterEach(() => { __setProviderForTests(null); });

// ── Locked vocabulary ─────────────────────────────────────────────────────────
describe("locked period vocabulary", () => {
  test("exactly nine periods; default 1M; 3M and 10Y removed", () => {
    expect([...PRICE_PERIODS]).toEqual(["1D", "5D", "1M", "6M", "YTD", "1Y", "3Y", "5Y", "Max"]);
    expect(DEFAULT_PRICE_PERIOD).toBe("1M");
    expect(PRICE_PERIODS).not.toContain("3M");
    expect(PRICE_PERIODS).not.toContain("10Y");
  });
  test("3M / 10Y / 1W gone from the visible selectors and tables", () => {
    const firm = read("src/components/FirmFundsTab.tsx");
    expect(firm).toContain('["1D", "5D", "1M", "6M", "YTD", "1Y", "3Y", "5Y", "Max"]');
    expect(firm).not.toMatch(/"3M"|"10Y"/);
    // The market/desk quote exposes 5D, never the old 1W.
    const quote = read("src/lib/market-data/marketQuote.ts");
    expect(quote).toContain("change5d");
    expect(quote).not.toContain("change1w");
    const overview = read("src/app/api/advisor-overview/route.ts");
    expect(overview).toContain("change5d");
    expect(overview).not.toContain("change1w");
  });
});

// ── Date-selection rules ──────────────────────────────────────────────────────
describe("period boundaries (the ONE shared rule)", () => {
  const END = "2026-02-02"; // Monday
  const b = series("2020-05-01", END);
  const { periods } = canonicalPricePerformance(b, "market_price");
  const last = b[b.length - 1];

  test("1M targets exactly one calendar month before latest — NOT 21 sessions", () => {
    const oneMonthBar = valAtOnOrBefore(b, "2026-01-02")!;   // calendar month before 2026-02-02
    const sessions21 = b[b.length - 1 - 21];                 // fixed 21-session lookback (the OLD math)
    expect(oneMonthBar.date).not.toBe(sessions21.date);      // the two windows genuinely differ
    expect(periods["1M"].startDate).toBe(oneMonthBar.date);  // engine picks the CALENDAR-month bar
    expect(periods["1M"].priceChange!).toBeCloseTo(last.rawClose / oneMonthBar.rawClose - 1, 12);
    // ... and it is NOT the 21-session result
    expect(periods["1M"].priceChange!).not.toBeCloseTo(last.rawClose / sessions21.rawClose - 1, 6);
  });

  test("5D uses five completed trading sessions", () => {
    expect(periods["5D"].startDate).toBe(b[b.length - 1 - 5].date);
    expect(periods["5D"].priceChange!).toBeCloseTo(last.rawClose / b[b.length - 1 - 5].rawClose - 1, 12);
  });

  test("6M targets exactly six calendar months before latest", () => {
    const sixMoBar = valAtOnOrBefore(b, "2025-08-02")!;
    expect(periods["6M"].startDate).toBe(sixMoBar.date);
  });

  test("YTD uses the final observation on/before prior year-end", () => {
    expect(periods["YTD"].startDate).toBe(valAtOnOrBefore(b, "2025-12-31")!.date);
  });

  test("1Y / 3Y / 5Y use calendar-year cutoffs (latest obs on/before)", () => {
    expect(periods["1Y"].startDate).toBe(valAtOnOrBefore(b, "2025-02-02")!.date);
    expect(periods["3Y"].startDate).toBe(valAtOnOrBefore(b, "2023-02-02")!.date);
    expect(periods["5Y"].startDate).toBe(valAtOnOrBefore(b, "2021-02-02")!.date);
  });

  test("Max uses the earliest available observation through latest", () => {
    expect(periods["Max"].startDate).toBe(b[0].date);
    expect(periods["Max"].priceChange!).toBeCloseTo(last.rawClose / b[0].rawClose - 1, 12);
  });

  test("weekend/holiday cutoff resolves to the latest observation on or before it", () => {
    // Latest bar is a Friday; a Saturday cutoff must fall back to that Friday.
    const bb = series("2025-11-03", "2026-01-30"); // ends Fri 2026-01-30
    const cutSat = "2026-01-31"; // Saturday — no bar exists on this date
    const resolved = valAtOnOrBefore(bb, cutSat)!;
    expect(resolved.date).toBe("2026-01-30");
  });
});

// ── getMarketQuote is the SAME engine (divergence eliminated) ──────────────────
describe("getMarketQuote unified with Firm Funds", () => {
  const END = "2026-02-02";
  const bars = series("2024-05-01", END);

  test("1M quote equals the Firm Funds 1M for identical inputs (no 21-session drift)", async () => {
    installProvider(bars);
    const q = await getMarketQuote("TEST");
    const firm = periodsFromBars(bars.map((x) => ({ date: x.date, close: x.rawClose, splitFactor: 1 })), "market_price");
    expect(q).not.toBeNull();
    expect(q!.change1m).toBeCloseTo(firm.periods["1M"].priceChange!, 12);
    expect(q!.change5d).toBeCloseTo(firm.periods["5D"].priceChange!, 12);
    // The old fixed 21-session number is materially different from the shipped 1M.
    const asc = bars.map((x) => x.rawClose);
    const old21 = asc[asc.length - 1] / asc[asc.length - 1 - 21] - 1;
    expect(q!.change1m).not.toBeCloseTo(old21, 6);
  });

  test("mutual funds are quoted on NAV (never forced to price)", async () => {
    installProvider(bars);
    await getMarketQuote("VFIAX", { kind: kindForVehicle("Mutual Fund") });
    expect(lastKind).toBe("nav");
    installProvider(bars);
    await getMarketQuote("VTI", { kind: kindForVehicle("ETF") });
    expect(lastKind).toBe("price");
  });

  test("quote exposes change5d (not change1w)", async () => {
    installProvider(bars);
    const q = await getMarketQuote("TEST");
    expect(q).toHaveProperty("change5d");
    expect(q).not.toHaveProperty("change1w");
  });
});

// ── No total return / dividends / CAGR / annualization in the visible field ────
describe("visible price field is pure price change", () => {
  test("engine never consults adjClose / dividends / CAGR / annualization", () => {
    const code = read("src/lib/perf/canonicalPricePerformance.ts").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/adjClose|divCash|reinvest|CAGR|annualiz/i);
  });
  test("a split does not fabricate a gain; dividends never move price change", () => {
    const days = weekdays("2025-01-02", "2026-02-02");
    const splitDate = days[Math.floor(days.length / 2)];
    const bars = days.map((date) => ({ date, rawClose: date >= splitDate ? 50 : 100, splitFactor: date === splitDate ? 2 : 1 }));
    expect(canonicalPricePerformance(bars, "market_price").periods["Max"].priceChange!).toBeCloseTo(0, 6);
  });
});

// ── Cache versions bumped so pre-change values cannot serve ────────────────────
describe("cache invalidation", () => {
  test("every affected cache is versioned past the old (21-session / 3M / 10Y) values", () => {
    const mq = read("src/lib/market-data/marketQuote.ts");
    expect(mq).toContain("td:quote:cpp:");   // new canonical key
    expect(mq).not.toContain("td:quote:px:"); // old raw-close key retired

    const firm = read("src/lib/firmPerformance.ts");
    expect(firm).toContain('CACHE_VERSION = "v5price"');
    expect(firm).not.toContain("v4price");

    const overview = read("src/app/api/advisor-overview/route.ts");
    expect(overview).toContain("ovq:q2:");    // versioned + vehicle-aware desk quote

    const market = read("src/app/api/market/route.ts");
    expect(market).toContain("market:dashboard:v5");
    expect(market).not.toContain("market:dashboard:v4");
  });
});
