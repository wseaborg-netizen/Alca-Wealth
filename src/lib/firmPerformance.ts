/**
 * Firm Funds period performance — SERVER-SIDE ONLY.
 *
 * Computes recent-return + sparkline for six selectable windows (1D/1M/3M/YTD/
 * 1Y/3Y) from ONE adjusted-price (ETF) or NAV (mutual fund) history fetch per
 * ticker, reusing the canonical Tiingo provider + the existing cache/coalesce
 * infrastructure. The change-window math is the SAME point-to-point method the
 * dashboard quote already uses — no return formula or analytics methodology is
 * changed here. Missing/insufficient history for a window → Unavailable (null),
 * never 0%. No raw provider shape or token ever reaches the client.
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

export const FIRM_PERF_PERIODS = ["1D", "1M", "3M", "YTD", "1Y", "3Y"] as const;
export type FirmPerfPeriod = (typeof FIRM_PERF_PERIODS)[number];
export const DEFAULT_FIRM_PERF_PERIOD: FirmPerfPeriod = "1M";

export interface PerfPoint { recentReturn: number | null; spark: number[] | null }
export type PerfByPeriod = Record<FirmPerfPeriod, PerfPoint>;

// Approx trading-day windows (same convention as the existing quote service:
// 1d = 1 bar back, 1m ≈ 21, etc.). YTD is handled by calendar year.
const WINDOW_DAYS: Record<Exclude<FirmPerfPeriod, "YTD">, number> = {
  "1D": 1, "1M": 21, "3M": 63, "1Y": 252, "3Y": 756,
};

const UNAVAILABLE: PerfPoint = { recentReturn: null, spark: null };

/** Canonical vehicle → provider series kind. Mutual funds use NAV history. */
export function kindForVehicle(vehicle: string | null | undefined): PriceSeriesKind {
  return vehicle === "Mutual Fund" || vehicle === "MF" ? "nav" : "price";
}

function yearsAgoISO(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

/**
 * PURE: derive every period's { recentReturn, spark } from an ascending series of
 * adjusted/NAV bars. Insufficient history for a window → Unavailable (never 0).
 */
export function periodsFromBars(bars: { date: string; adjClose: number | null }[]): PerfByPeriod {
  const asc = bars
    .filter((b): b is { date: string; adjClose: number } => b.adjClose != null && b.adjClose > 0)
    .map((b) => ({ date: b.date, v: b.adjClose }));
  const n = asc.length;
  const out = {} as PerfByPeriod;
  const last = n ? asc[n - 1].v : null;

  for (const p of FIRM_PERF_PERIODS) {
    if (last == null || n < 2) { out[p] = UNAVAILABLE; continue; }
    let startIdx: number;
    if (p === "YTD") {
      const yr = new Date().getFullYear();
      startIdx = asc.findIndex((b) => new Date(b.date).getFullYear() === yr);
    } else {
      startIdx = n - 1 - WINDOW_DAYS[p];
    }
    if (startIdx < 0 || startIdx >= n - 1) { out[p] = UNAVAILABLE; continue; } // not enough history
    const start = asc[startIdx].v;
    const recentReturn = start > 0 ? (last - start) / start : null;
    const sparkVals = asc.slice(startIdx).map((b) => b.v);
    out[p] = {
      recentReturn: recentReturn != null && Number.isFinite(recentReturn) ? recentReturn : null,
      spark: sparkVals.length > 8 ? sparkVals : null, // short windows (e.g. 1D) → no sparkline
    };
  }
  return out;
}

/** Fetch + cache all-period performance for one ticker (kind by vehicle). Returns
 *  null on provider error (retryable — not cached). */
export async function fetchPeriodPerformance(ticker: string, vehicle: string | null): Promise<PerfByPeriod | null> {
  const kind = kindForVehicle(vehicle);
  const key = `ffperf:${SCOPE}:${ticker}:${kind}`;
  const cached = await cacheGet<PerfByPeriod>(key);
  if (cached) return cached;
  return coalesce(key, async () => {
    const again = await cacheGet<PerfByPeriod>(key);
    if (again) return again;
    const r = await tiingo().getPriceHistory(ticker, INTERNAL, { kind, startDate: yearsAgoISO(3) });
    if (!r.ok) return null; // provider error → explicit null, not cached
    const periods = periodsFromBars(r.data.bars.map((b) => ({ date: b.date, adjClose: b.adjClose })));
    await cacheSet(key, periods, TTL);
    return periods;
  });
}

/**
 * Bounded, firm-scoped enrichment: only tickers in the firm's own inventory are
 * enriched (intersection), capped, fetched concurrently. Each ticker is isolated
 * — one provider failure yields Unavailable for that row and never fails the
 * batch. `fetchPerf` + `vehicleOf` are injected so this is testable offline.
 */
export async function boundedPeriodPerformance(
  requested: string[],
  firmTickers: Set<string>,
  vehicleOf: (t: string) => string | null,
  fetchPerf: (t: string, vehicle: string | null) => Promise<PerfByPeriod | null>,
  cap = 200,
): Promise<Record<string, PerfByPeriod | null>> {
  const uniq = Array.from(new Set(requested.map((t) => String(t).toUpperCase())))
    .filter((t) => firmTickers.has(t))
    .slice(0, cap);
  const entries = await Promise.all(uniq.map(async (t): Promise<[string, PerfByPeriod | null]> => {
    try { return [t, await fetchPerf(t, vehicleOf(t))]; }
    catch { return [t, null]; } // isolate failure → Unavailable
  }));
  return Object.fromEntries(entries);
}
