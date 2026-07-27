/**
 * Firm Funds period performance — SERVER-SIDE fetch/cache adapter over the ONE
 * canonical trailing-return engine (src/lib/perf/canonicalReturns.ts). It fetches
 * ONE buffered adjusted-price (ETF) or NAV (mutual fund) history per ticker,
 * covering the longest supported window (10Y), and derives every period from that
 * single series — no per-period provider calls. All return math lives in the
 * canonical engine; this file only handles provider I/O, cache coverage, and the
 * Firm-Funds display shape. Basis (ETF adjusted vs mutual-fund NAV) comes from the
 * canonical universe via kindForVehicle. No raw provider shape/token reaches the
 * client; returns are unrounded until display.
 */
import { cacheGet, cacheSet, coalesce } from "@/lib/cache";
import { createTiingoProvider } from "@/lib/market-data";
import type { TokenContext, MarketDataProvider, PriceSeriesKind } from "@/lib/market-data";
import {
  canonicalPeriodReturns, PERF_PERIODS, ANNUALIZED_PERIODS, DEFAULT_PERF_PERIOD, MAX_LOOKBACK_YEARS,
  type PerfPeriod,
} from "@/lib/perf/canonicalReturns";

let _provider: MarketDataProvider | null = null;
const tiingo = (): MarketDataProvider => (_provider ??= createTiingoProvider());
/** TEST ONLY — inject a fake provider. Never used by production code paths. */
export function __setProviderForTests(p: MarketDataProvider | null): void { _provider = p; }
const INTERNAL: TokenContext = { kind: "internal" };
const SCOPE = "internal";
const TTL = 15 * 60; // 15 minutes (market data)
// Fetch the longest supported lookback + a buffer so a bar exists at/before every
// calendar cutoff (weekends/holidays). One request covers 1D…10Y.
const HISTORY_BUFFER_DAYS = 45;
// Cache identity: version + basis (kind) + range coverage. A short-history entry
// can never satisfy a longer request because the range tag pins the fetched span.
const CACHE_VERSION = "v3";
const RANGE_TAG = `r${MAX_LOOKBACK_YEARS}y`;

export const FIRM_PERF_PERIODS = PERF_PERIODS;
export type { PerfPeriod };
export const DEFAULT_FIRM_PERF_PERIOD = DEFAULT_PERF_PERIOD;
export const ANNUALIZED = ANNUALIZED_PERIODS;

export interface PerfPoint { recentReturn: number | null; spark: number[] | null; annualized: boolean }
export type PerfByPeriod = Record<PerfPeriod, PerfPoint>;
export type PerfBasis = "etf_adjusted" | "mf_nav";
export interface PerfResult { periods: PerfByPeriod; asOf: string | null; basis: PerfBasis }

/** Canonical vehicle → provider series kind. Mutual funds use NAV history. */
export function kindForVehicle(vehicle: string | null | undefined): PriceSeriesKind {
  return vehicle === "Mutual Fund" || vehicle === "MF" ? "nav" : "price";
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
function bufferedStartISO(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - MAX_LOOKBACK_YEARS);
  d.setUTCDate(d.getUTCDate() - HISTORY_BUFFER_DAYS);
  return iso(d);
}

/** Adapt the canonical result to the Firm-Funds display shape (all math is the
 *  canonical engine's; this only reshapes). Returns { periods, asOf }. */
export function periodsFromBars(bars: { date: string; adjClose: number | null }[]): { periods: PerfByPeriod; asOf: string | null } {
  const { periods: canon, asOf } = canonicalPeriodReturns(
    bars.filter((b) => b.adjClose != null).map((b) => ({ date: b.date, value: b.adjClose as number })),
  );
  const periods = {} as PerfByPeriod;
  for (const p of PERF_PERIODS) {
    const cr = canon[p];
    periods[p] = { recentReturn: cr.return, spark: cr.spark, annualized: ANNUALIZED_PERIODS[p] };
  }
  return { periods, asOf };
}

/** Fetch + cache all-period performance for one ticker (kind by vehicle). One
 *  buffered 10Y history fetch; shorter periods derive from the same series.
 *  Returns null on provider error (retryable — not cached). */
export async function fetchPeriodPerformance(ticker: string, vehicle: string | null): Promise<PerfResult | null> {
  const kind = kindForVehicle(vehicle);
  const key = `ffperf:${CACHE_VERSION}:${RANGE_TAG}:${SCOPE}:${ticker}:${kind}`;
  const cached = await cacheGet<PerfResult>(key);
  if (cached) return cached;
  return coalesce(key, async () => {
    const again = await cacheGet<PerfResult>(key);
    if (again) return again;
    const r = await tiingo().getPriceHistory(ticker, INTERNAL, { kind, startDate: bufferedStartISO() });
    if (!r.ok) return null; // provider error → explicit null, not cached
    const { periods, asOf } = periodsFromBars(r.data.bars.map((b) => ({ date: b.date, adjClose: b.adjClose })));
    const result: PerfResult = { periods, asOf, basis: kind === "nav" ? "mf_nav" : "etf_adjusted" };
    await cacheSet(key, result, TTL);
    return result;
  });
}

/**
 * Bounded, firm-scoped enrichment: only tickers in the firm's own inventory are
 * enriched (intersection), capped, fetched concurrently. Each ticker is isolated
 * — one provider failure yields Unavailable (null) for that row and never fails
 * the batch. `fetchPerf` + `vehicleOf` are injected so this is testable offline.
 */
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
    catch { return [t, null]; } // isolate failure → Unavailable
  }));
  return Object.fromEntries(entries);
}
