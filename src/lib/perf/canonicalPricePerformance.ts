/**
 * Canonical PRICE-performance engine — the ONE source of the primary user-facing
 * fund-performance number across ALCA. It is PRICE CHANGE (Nasdaq-style), NOT
 * dividend-reinvested total return.
 *
 * Input: raw closing prices (ETF market price) or raw NAV (mutual fund) with each
 * bar's split factor. The engine builds a SPLIT-ADJUSTED, DIVIDEND-UNADJUSTED
 * series (raw close corrected only for stock/reverse splits, never for dividends
 * or cap-gain distributions) and computes, for every standard period:
 *
 *   priceChange = endingSplitAdjustedPrice / startingSplitAdjustedPrice − 1
 *
 * Every period is CUMULATIVE price change over the whole period (no annualization).
 * Start observation = latest bar on/before the calendar cutoff (the convention that
 * reproduces Nasdaq historical-chart figures); end = latest completed EOD. Full
 * precision internally; rounding only at display. Genuine insufficient history →
 * null with a reason (never 0). Provider-neutral and PURE. `adjClose` (total
 * return) is deliberately NOT consulted here.
 */

export const PRICE_PERIODS = ["1D", "1M", "3M", "YTD", "1Y", "3Y", "5Y", "10Y"] as const;
export type PricePeriod = (typeof PRICE_PERIODS)[number];
export const DEFAULT_PRICE_PERIOD: PricePeriod = "1M";
export const MAX_PRICE_LOOKBACK_YEARS = 10;

export type SeriesBasis = "market_price" | "nav";

export interface PricePerf {
  period: PricePeriod;
  priceChange: number | null;      // FRACTION, full precision (cumulative price change)
  startDate: string | null;
  endDate: string | null;
  startRawClose: number | null;    // raw close/NAV at the start bar (reporting)
  endRawClose: number | null;      // raw close/NAV at the end bar (reporting)
  spark: number[] | null;          // split-adjusted price series over the same range
  unavailableReason: string | null;
}
export interface PricePerfResult { periods: Record<PricePeriod, PricePerf>; asOf: string | null; seriesBasis: SeriesBasis }

export interface RawObs { date: string; rawClose: number; splitFactor?: number }

const iso = (d: Date) => d.toISOString().slice(0, 10);
function calendarCutoff(lastISO: string, period: Exclude<PricePeriod, "1D" | "YTD">): string {
  const d = new Date(lastISO + "T00:00:00Z");
  if (period === "1M") d.setUTCMonth(d.getUTCMonth() - 1);
  else if (period === "3M") d.setUTCMonth(d.getUTCMonth() - 3);
  else if (period === "1Y") d.setUTCFullYear(d.getUTCFullYear() - 1);
  else if (period === "3Y") d.setUTCFullYear(d.getUTCFullYear() - 3);
  else if (period === "5Y") d.setUTCFullYear(d.getUTCFullYear() - 5);
  else d.setUTCFullYear(d.getUTCFullYear() - 10);
  return iso(d);
}

export function canonicalPricePerformance(observations: RawObs[], seriesBasis: SeriesBasis): PricePerfResult {
  const asc = observations
    .filter((o): o is RawObs => o != null && Number.isFinite(o.rawClose) && o.rawClose > 0)
    .map((o) => ({ date: o.date, raw: o.rawClose, sf: o.splitFactor ?? 1 }));
  const n = asc.length;
  const asOf = n ? asc[n - 1].date : null;
  const periods = {} as Record<PricePeriod, PricePerf>;
  const blank = (p: PricePeriod, reason: string): PricePerf =>
    ({ period: p, priceChange: null, startDate: null, endDate: asOf, startRawClose: null, endRawClose: n ? asc[n - 1].raw : null, spark: null, unavailableReason: reason });

  if (n < 2) { for (const p of PRICE_PERIODS) periods[p] = blank(p, "insufficient history"); return { periods, asOf, seriesBasis }; }

  // Split-adjusted (dividend-unadjusted) price: divide historical prices by the
  // product of split factors that occur AFTER each bar. No split ⇒ adj = raw, so
  // a split never fabricates a gain or loss.
  const adj = new Array<number>(n);
  let fwd = 1;
  for (let i = n - 1; i >= 0; i--) {
    adj[i] = asc[i].raw / fwd;
    if (asc[i].sf && asc[i].sf !== 1) fwd *= asc[i].sf;
  }

  const last = asc[n - 1];
  const indexAtOrBefore = (cut: string): number => { for (let i = n - 1; i >= 0; i--) if (asc[i].date <= cut) return i; return -1; };

  for (const p of PRICE_PERIODS) {
    let startIdx: number;
    if (p === "1D") startIdx = n - 2;
    else if (p === "YTD") startIdx = indexAtOrBefore(`${Number(last.date.slice(0, 4)) - 1}-12-31`);
    else startIdx = indexAtOrBefore(calendarCutoff(last.date, p));

    if (startIdx < 0 || startIdx >= n - 1) { periods[p] = blank(p, "history does not reach the period cutoff"); continue; }
    const pc = adj[startIdx] > 0 ? adj[n - 1] / adj[startIdx] - 1 : null;
    const sparkVals = adj.slice(startIdx);
    periods[p] = {
      period: p,
      priceChange: pc != null && Number.isFinite(pc) ? pc : null,   // full precision, cumulative
      startDate: asc[startIdx].date, endDate: last.date,
      startRawClose: asc[startIdx].raw, endRawClose: last.raw,
      spark: sparkVals.length > 8 ? sparkVals : null,
      unavailableReason: null,
    };
  }
  return { periods, asOf, seriesBasis };
}
