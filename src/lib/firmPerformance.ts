/**
 * Firm Funds period performance — SERVER-SIDE ONLY.
 *
 * Computes total return + sparkline for six windows (1D/1M/3M/YTD/1Y/3Y) from ONE
 * buffered adjusted-price (ETF) or NAV (mutual fund) history fetch per ticker,
 * reusing the canonical Tiingo provider + the existing cache/coalesce layer.
 *
 * Semantics (labeled in the UI):
 *   1D/1M/3M/YTD/1Y → cumulative total return
 *   3Y             → ANNUALIZED total return
 * Basis: ETF rows are adjusted-close total return (dividends reinvested);
 * mutual-fund rows are NAV total return. ETF market-price return is never shown
 * as NAV return. Every window uses a CALENDAR cutoff (nearest trading day on/
 * before the target date), not a fixed trading-day count — so weekends/holidays
 * and month lengths never shift the boundary. YTD uses the previous year-end
 * close; 1D uses the previous trading-day close. Missing genuine history for a
 * window → Unavailable (null), never 0%. No raw provider shape/token reaches the
 * client. Returns are unrounded here — rounding happens only at display.
 */
import { cacheGet, cacheSet, coalesce } from "@/lib/cache";
import { createTiingoProvider } from "@/lib/market-data";
import type { TokenContext, MarketDataProvider, PriceSeriesKind } from "@/lib/market-data";

let _provider: MarketDataProvider | null = null;
const tiingo = (): MarketDataProvider => (_provider ??= createTiingoProvider());
/** TEST ONLY — inject a fake provider. Never used by production code paths. */
export function __setProviderForTests(p: MarketDataProvider | null): void { _provider = p; }
const INTERNAL: TokenContext = { kind: "internal" };
const SCOPE = "internal";
const TTL = 15 * 60; // 15 minutes (market data)
// Fetch 3 years + a generous buffer so a bar exists at/before the 3-years-ago
// calendar cutoff (covers weekends + holiday gaps). The exact-3-year request
// returned ~751 bars and could never satisfy a 3Y window — this buffer fixes it.
const HISTORY_BUFFER_DAYS = 45;
// Cache key carries a RANGE tag + version so a short-history entry can never be
// reused for a long-period request (and the pre-fix cache is invalidated).
const RANGE_TAG = "v2-r3y";

export const FIRM_PERF_PERIODS = ["1D", "1M", "3M", "YTD", "1Y", "3Y"] as const;
export type FirmPerfPeriod = (typeof FIRM_PERF_PERIODS)[number];
export const DEFAULT_FIRM_PERF_PERIOD: FirmPerfPeriod = "1M";

/** Which windows are presented annualized (3Y only). */
export const ANNUALIZED: Record<FirmPerfPeriod, boolean> = { "1D": false, "1M": false, "3M": false, "YTD": false, "1Y": false, "3Y": true };

export interface PerfPoint { recentReturn: number | null; spark: number[] | null; annualized: boolean }
export type PerfByPeriod = Record<FirmPerfPeriod, PerfPoint>;
export type PerfBasis = "etf_adjusted" | "mf_nav";
export interface PerfResult { periods: PerfByPeriod; asOf: string | null; basis: PerfBasis }

/** Canonical vehicle → provider series kind. Mutual funds use NAV history. */
export function kindForVehicle(vehicle: string | null | undefined): PriceSeriesKind {
  return vehicle === "Mutual Fund" || vehicle === "MF" ? "nav" : "price";
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
function bufferedStartISO(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 3);
  d.setUTCDate(d.getUTCDate() - HISTORY_BUFFER_DAYS);
  return iso(d);
}
/** Calendar cutoff for a window, relative to the latest EOD date. */
function calendarCutoff(lastISO: string, period: Exclude<FirmPerfPeriod, "1D" | "YTD">): string {
  const d = new Date(lastISO + "T00:00:00Z");
  if (period === "1M") d.setUTCMonth(d.getUTCMonth() - 1);
  else if (period === "3M") d.setUTCMonth(d.getUTCMonth() - 3);
  else if (period === "1Y") d.setUTCFullYear(d.getUTCFullYear() - 1);
  else d.setUTCFullYear(d.getUTCFullYear() - 3); // "3Y"
  return iso(d);
}

/**
 * PURE: derive every window's { recentReturn, spark, annualized } + the as-of
 * date from an ascending series of adjusted/NAV bars. Uses calendar cutoffs and
 * the nearest trading day on/before each cutoff. Insufficient history for a
 * window → Unavailable (never 0). The sparkline uses the SAME source range as
 * the return. Consumes `adjClose` only (never raw close).
 */
export function periodsFromBars(bars: { date: string; adjClose: number | null }[]): { periods: PerfByPeriod; asOf: string | null } {
  const asc = bars
    .filter((b): b is { date: string; adjClose: number } => b.adjClose != null && b.adjClose > 0)
    .map((b) => ({ date: b.date, v: b.adjClose }));
  const n = asc.length;
  const asOf = n ? asc[n - 1].date : null;
  const periods = {} as PerfByPeriod;
  const blank = (p: FirmPerfPeriod): PerfPoint => ({ recentReturn: null, spark: null, annualized: ANNUALIZED[p] });

  if (n < 2) { for (const p of FIRM_PERF_PERIODS) periods[p] = blank(p); return { periods, asOf }; }

  const last = asc[n - 1];
  // largest index whose date <= cutoff (nearest trading day on/before cutoff)
  const indexAtOrBefore = (cut: string): number => { for (let i = n - 1; i >= 0; i--) if (asc[i].date <= cut) return i; return -1; };

  for (const p of FIRM_PERF_PERIODS) {
    let startIdx: number;
    if (p === "1D") startIdx = n - 2;                                   // previous trading-day close
    else if (p === "YTD") startIdx = indexAtOrBefore(`${Number(last.date.slice(0, 4)) - 1}-12-31`); // previous year-end close
    else startIdx = indexAtOrBefore(calendarCutoff(last.date, p));      // 1M/3M/1Y/3Y calendar cutoff

    if (startIdx < 0 || startIdx >= n - 1) { periods[p] = blank(p); continue; } // genuine insufficient history
    const s = asc[startIdx];
    let ret: number | null;
    if (ANNUALIZED[p]) {
      const years = (Date.parse(last.date) - Date.parse(s.date)) / (365.25 * 864e5);
      ret = years > 0 ? Math.pow(last.v / s.v, 1 / years) - 1 : null;   // annualized total return
    } else {
      ret = s.v > 0 ? (last.v - s.v) / s.v : null;                       // cumulative total return
    }
    const sparkVals = asc.slice(startIdx).map((b) => b.v);               // same source range as the return
    periods[p] = {
      recentReturn: ret != null && Number.isFinite(ret) ? ret : null,
      spark: sparkVals.length > 8 ? sparkVals : null,                    // short windows (1D) → no sparkline
      annualized: ANNUALIZED[p],
    };
  }
  return { periods, asOf };
}

/** Fetch + cache all-period performance for one ticker (kind by vehicle). Returns
 *  null on provider error (retryable — not cached). */
export async function fetchPeriodPerformance(ticker: string, vehicle: string | null): Promise<PerfResult | null> {
  const kind = kindForVehicle(vehicle);
  const key = `ffperf:${RANGE_TAG}:${SCOPE}:${ticker}:${kind}`;
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
