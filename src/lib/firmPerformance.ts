/**
 * Firm Funds performance adapter — provider I/O + cache over the ONE canonical
 * PRICE-performance engine (src/lib/perf/canonicalPricePerformance.ts). The
 * primary metric is PRICE CHANGE (Nasdaq-style, dividends excluded): ETFs use
 * split-adjusted raw market price; mutual funds use raw NAV change. One buffered
 * 10-year raw-close fetch per ticker covers 1D–10Y; shorter periods derive from
 * the same series. adjClose (total return) is never used for this number. No raw
 * provider shape/token reaches the client; values are unrounded until display.
 */
import { cacheGet, cacheSet, coalesce } from "@/lib/cache";
import { createTiingoProvider } from "@/lib/market-data";
import type { TokenContext, MarketDataProvider, PriceSeriesKind } from "@/lib/market-data";
import {
  canonicalPricePerformance, PRICE_PERIODS, DEFAULT_PRICE_PERIOD, MAX_PRICE_LOOKBACK_YEARS,
  type PricePeriod, type SeriesBasis,
} from "@/lib/perf/canonicalPricePerformance";

let _provider: MarketDataProvider | null = null;
const tiingo = (): MarketDataProvider => (_provider ??= createTiingoProvider());
/** TEST ONLY — inject a fake provider. Never used by production code paths. */
export function __setProviderForTests(p: MarketDataProvider | null): void { _provider = p; }
const INTERNAL: TokenContext = { kind: "internal" };
const SCOPE = "internal";
const TTL = 15 * 60;
const HISTORY_BUFFER_DAYS = 45;
// Cache identity: methodology version (price v4), range, series basis (kind).
const CACHE_VERSION = "v4price";
const RANGE_TAG = `r${MAX_PRICE_LOOKBACK_YEARS}y`;

export const FIRM_PERF_PERIODS = PRICE_PERIODS;
export type { PricePeriod };
export const DEFAULT_FIRM_PERF_PERIOD = DEFAULT_PRICE_PERIOD;

export interface PerfPoint { priceChange: number | null; spark: number[] | null }
export type PerfByPeriod = Record<PricePeriod, PerfPoint>;
export type PerfBasis = SeriesBasis; // "market_price" | "nav"
export interface PerfResult { periods: PerfByPeriod; asOf: string | null; basis: PerfBasis }

/** Canonical vehicle → provider series kind. Mutual funds use NAV history. */
export function kindForVehicle(vehicle: string | null | undefined): PriceSeriesKind {
  return vehicle === "Mutual Fund" || vehicle === "MF" ? "nav" : "price";
}
const basisForKind = (kind: PriceSeriesKind): PerfBasis => (kind === "nav" ? "nav" : "market_price");

const iso = (d: Date) => d.toISOString().slice(0, 10);
function bufferedStartISO(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - MAX_PRICE_LOOKBACK_YEARS);
  d.setUTCDate(d.getUTCDate() - HISTORY_BUFFER_DAYS);
  return iso(d);
}

/** Adapt raw bars (close + splitFactor) → the Firm-Funds price-change shape. */
export function periodsFromBars(bars: { date: string; close: number | null; splitFactor?: number }[], basis: PerfBasis = "market_price"): { periods: PerfByPeriod; asOf: string | null } {
  const { periods: canon, asOf } = canonicalPricePerformance(
    bars.filter((b) => b.close != null).map((b) => ({ date: b.date, rawClose: b.close as number, splitFactor: b.splitFactor })),
    basis,
  );
  const periods = {} as PerfByPeriod;
  for (const p of PRICE_PERIODS) periods[p] = { priceChange: canon[p].priceChange, spark: canon[p].spark };
  return { periods, asOf };
}

export async function fetchPeriodPerformance(ticker: string, vehicle: string | null): Promise<PerfResult | null> {
  const kind = kindForVehicle(vehicle);
  const basis = basisForKind(kind);
  const key = `ffperf:${CACHE_VERSION}:${RANGE_TAG}:${SCOPE}:${ticker}:${kind}`;
  const cached = await cacheGet<PerfResult>(key);
  if (cached) return cached;
  return coalesce(key, async () => {
    const again = await cacheGet<PerfResult>(key);
    if (again) return again;
    const r = await tiingo().getPriceHistory(ticker, INTERNAL, { kind, startDate: bufferedStartISO() });
    if (!r.ok) return null;
    const { periods, asOf } = periodsFromBars(r.data.bars.map((b) => ({ date: b.date, close: b.close, splitFactor: b.splitFactor })), basis);
    const result: PerfResult = { periods, asOf, basis };
    await cacheSet(key, result, TTL);
    return result;
  });
}

/** Bounded, firm-scoped enrichment; per-ticker failure isolated to Unavailable. */
export async function boundedPeriodPerformance(
  requested: string[],
  firmTickers: Set<string>,
  vehicleOf: (t: string) => string | null,
  fetchPerf: (t: string, vehicle: string | null) => Promise<PerfResult | null>,
  cap = 200,
): Promise<Record<string, PerfResult | null>> {
  const uniq = Array.from(new Set(requested.map((t) => String(t).toUpperCase())))
    .filter((t) => firmTickers.has(t))
    .slice(0, cap);
  const entries = await Promise.all(uniq.map(async (t): Promise<[string, PerfResult | null]> => {
    try { return [t, await fetchPerf(t, vehicleOf(t))]; }
    catch { return [t, null]; }
  }));
  return Object.fromEntries(entries);
}
