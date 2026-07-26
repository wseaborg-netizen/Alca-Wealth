/**
 * Stage 5 — analytics revalidation over Tiingo inputs. Offline only: the fund
 * service takes an injected fake provider (no network, no FMP, no fixtures at
 * runtime). Verifies that adjusted-price / NAV inputs produce mathematically
 * coherent, deterministic results and that missing data never becomes zero.
 * Methodology (kpi.ts / metrics) is unchanged — this asserts the INTEGRATION.
 */
import { cacheClear } from "@/lib/cache";
import type { MarketDataProvider, ProviderErrorCategory, PriceBar } from "@/lib/market-data";
import { getFund, getRecommendFund, __setProviderForTests as setFundProvider } from "@/lib/market-data/fundService";

const PROV = { source: "tiingo" as const, fetchedAt: "2026-07-25T00:00:00Z" };
const err = (category: ProviderErrorCategory) => ({ ok: false as const, error: { kind: "provider_error" as const, category, retryable: false, message: "x", source: "tiingo" as const } });
const notStub = async () => { throw new Error("not stubbed"); };

/** A bar with an ADJUSTED close (and matching raw close). */
const abar = (date: string, adj: number, close: number = adj): PriceBar => ({ date, close, adjClose: adj, open: null, high: null, low: null, volume: null });

/** N+1 daily adjusted bars ending today with a fixed daily drift (steady uptrend). */
function trendBars(days: number, start: number, driftPerDay: number): PriceBar[] {
  const out: PriceBar[] = [];
  const today = new Date();
  for (let i = days; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    out.push(abar(d.toISOString().slice(0, 10), +(start * (1 + driftPerDay) ** (days - i)).toFixed(4)));
  }
  return out;
}

function fakeProvider(over: Partial<MarketDataProvider>): MarketDataProvider {
  return { getSecurityMetadata: notStub, getPriceHistory: notStub, getDistributions: notStub, getSplits: notStub, getPriceSeries: notStub, ...over } as MarketDataProvider;
}
const history = (bars: PriceBar[]) => ({ ok: true as const, data: { symbol: "X", kind: "price" as const, bars, availability: { status: "available" as const, count: bars.length }, provenance: PROV, freshness: { asOf: bars.at(-1)?.date ?? null, observedAt: PROV.fetchedAt } } });
const series = (bars: PriceBar[], divs: { exDate: string; amount: number }[] = []) => ({ ok: true as const, data: {
  history: history(bars).data,
  distributions: { symbol: "X", distributions: divs, availability: divs.length ? { status: "available" as const, count: divs.length } : { status: "empty" as const }, provenance: PROV },
  splits: { symbol: "X", splits: [], availability: { status: "empty" as const }, provenance: PROV },
} });

/** Provider that serves the SAME bars for the fund series and the benchmark. */
function providerWith(bars: PriceBar[], divs: { exDate: string; amount: number }[] = [], benchBars: PriceBar[] = bars) {
  return fakeProvider({ getPriceSeries: async () => series(bars, divs), getPriceHistory: async () => history(benchBars) });
}

beforeEach(async () => { await cacheClear(); setFundProvider(null); });

const YEARS = 2000; // ~5.5y of daily bars → 1Y/3Y/5Y periods all populate (span guards satisfied)

describe("ETF adjusted-price analytics coherence", () => {
  test("returns/risk are finite and directionally correct; drawdown ≤ 0, vol ≥ 0", async () => {
    setFundProvider(providerWith(trendBars(YEARS, 100, 0.0003))); // steady uptrend
    const r = await getFund("VTI", "ETF", "US Equity Large Blend", "SPY");
    expect(r.error).toBeUndefined();
    expect(Number.isFinite(r.kpi.return1y!)).toBe(true);
    expect(r.kpi.return1y!).toBeGreaterThan(0);           // uptrend → positive
    expect(r.kpi.periods["1Y"].volatility!).toBeGreaterThanOrEqual(0);
    expect(r.kpi.maxDrawdown5y!).toBeLessThanOrEqual(0);  // drawdown never positive
    expect(r.kpi.maxDrawdown5y!).toBeGreaterThan(-0.5);   // monotonic-ish → shallow
  });

  test("dividends are NOT double-counted — returns depend only on adjusted prices", async () => {
    const bars = trendBars(YEARS, 100, 0.0003);
    const noDiv = providerWith(bars, []);
    const withDiv = providerWith(bars, [{ exDate: bars.at(-40)!.date, amount: 5 }, { exDate: bars.at(-200)!.date, amount: 5 }]);
    setFundProvider(noDiv);
    const a = await getFund("VTI", "ETF", "US Equity Large Blend", "SPY");
    await cacheClear();
    setFundProvider(withDiv);
    const b = await getFund("VTI", "ETF", "US Equity Large Blend", "SPY");
    expect(b.kpi.return3y).toBe(a.kpi.return3y);   // dividends do not change total-return path
    expect(b.kpi.ttmYield).not.toBeNull();          // but DO drive income yield
    expect(a.kpi.ttmYield).toBeNull();
  });

  test("bars lacking adjClose are dropped, not mixed with raw close", async () => {
    const clean = trendBars(YEARS, 100, 0.0003);
    // Insert bars with NO adjClose but a wild raw close — if mixed in, drawdown craters.
    const poisoned = [...clean];
    for (let i = 5; i < 15; i++) poisoned[i] = { ...poisoned[i], adjClose: null, close: 1 };
    setFundProvider(providerWith(poisoned));
    const r = await getFund("VTI", "ETF", "US Equity Large Blend", "SPY");
    expect(r.kpi.maxDrawdown5y!).toBeGreaterThan(-0.5); // stayed shallow → raw close was NOT used
  });
});

describe("mutual-fund NAV analytics", () => {
  test("MF uses NAV series and produces coherent KPIs", async () => {
    let kind: string | undefined;
    setFundProvider(fakeProvider({ getPriceSeries: async (_s, _c, o) => { kind = o?.kind; return series(trendBars(YEARS, 50, 0.0002)); }, getPriceHistory: async () => history(trendBars(YEARS, 100, 0.0003)) }));
    const r = await getFund("VFIAX", "Mutual Fund", "US Equity Large Blend", "SPY");
    expect(kind).toBe("nav");
    expect(Number.isFinite(r.kpi.return3y!)).toBe(true);
    expect(r.kpi.periods["3Y"].volatility!).toBeGreaterThanOrEqual(0);
  });
});

describe("missing / insufficient / failed data never fabricates analytics", () => {
  test("insufficient history → null period KPIs (no annualization)", async () => {
    setFundProvider(providerWith(trendBars(15, 100, 0.001))); // ~2 weeks
    const r = await getFund("NEW", "ETF", "Other", "SPY");
    expect(r.kpi.return3y).toBeNull();
    expect(r.kpi.return1y).toBeNull();
    expect(r.error).toBeUndefined(); // not an error — just insufficient
  });

  test("provider failure → explicit error record, all KPIs null (not zeroed)", async () => {
    setFundProvider(fakeProvider({ getPriceSeries: async () => err("timeout"), getPriceHistory: async () => err("timeout") }));
    const r = await getFund("VTI", "ETF", "US Equity Large Blend", "SPY");
    expect(r.error).toBe("timeout");
    expect(r.kpi.return3y).toBeNull();
    expect(r.kpi.sharpe3y).toBeNull();
    expect(r.kpi.maxDrawdown5y).toBeNull(); // NOT 0
  });

  test("missing benchmark → fund returns computed, beta/alpha null (never zero)", async () => {
    const bars = trendBars(YEARS, 100, 0.0003);
    setFundProvider(fakeProvider({ getPriceSeries: async () => series(bars), getPriceHistory: async () => err("not_found") })); // benchmark fails
    const r = await getFund("VTI", "ETF", "US Equity Large Blend", "SPY");
    expect(r.error).toBeUndefined();
    expect(Number.isFinite(r.kpi.return3y!)).toBe(true); // fund-only stats still there
    expect(r.kpi.beta3y).toBeNull();                     // no benchmark → null, not 0
    expect(r.kpi.alpha3y).toBeNull();
  });

  test("AUM / inception / fund age remain Unavailable regardless of history", async () => {
    setFundProvider(providerWith(trendBars(YEARS, 100, 0.0003)));
    const r = await getRecommendFund("VTI", "ETF", "US Equity Large Blend", "SPY");
    expect(r.aum).toBeNull();
    expect(r.aumFormatted).toBe("Unavailable");
    expect(r.inceptionDate).toBeNull();
    expect(r.fundAge).toBeNull();
  });

  test("results are deterministic (same inputs → identical KPIs)", async () => {
    const bars = trendBars(YEARS, 100, 0.0003);
    setFundProvider(providerWith(bars));
    const a = await getFund("VTI", "ETF", "US Equity Large Blend", "SPY");
    await cacheClear();
    setFundProvider(providerWith(bars));
    const b = await getFund("VTI", "ETF", "US Equity Large Blend", "SPY");
    expect(b.kpi).toEqual(a.kpi);
  });
});
