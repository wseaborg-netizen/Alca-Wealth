/**
 * Canonical PRICE-performance engine — the ONE source of the primary user-facing
 * fund-performance number across ALCA, AND the ONE source of period date-selection
 * for every visible price-return surface (Firm Funds, Advisor Overview / Daily
 * Desk, market cards, fund cards). It is PRICE CHANGE (Nasdaq-style), NOT
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
 *
 * Period date-selection (the ONE shared boundary rule — do not duplicate it):
 *   1D  — latest completed obs vs the immediately preceding completed obs.
 *   5D  — latest completed obs vs the obs five completed trading sessions earlier.
 *   1M  — latest obs on/before exactly one calendar month before the latest obs.
 *   6M  — latest obs on/before exactly six calendar months before the latest obs.
 *   YTD — latest obs vs the final obs on/before Dec 31 of the previous year.
 *   1Y/3Y/5Y — latest obs on/before the one/three/five-calendar-year cutoff.
 *   Max — earliest available obs through the latest completed obs.
 * A weekend/holiday cutoff resolves to the latest observation on OR BEFORE it.
 *
 * Full precision internally; rounding only at display. Genuine insufficient history
 * → null with a reason (never 0). Provider-neutral and PURE. `adjClose` (total
 * return) is deliberately NOT consulted here.
 */

export const PRICE_PERIODS = ["1D", "5D", "1M", "6M", "YTD", "1Y", "3Y", "5Y", "Max"] as const;
export type PricePeriod = (typeof PRICE_PERIODS)[number];
export const DEFAULT_PRICE_PERIOD: PricePeriod = "1M";
export const MAX_PRICE_LOOKBACK_YEARS = 10;

export type SeriesBasis = "market_price" | "nav";

export interface PricePerf {
  period: PricePeriod;
  priceChange: number | null;      // FRACTION, full precision (cumulative price change)
  startDate: string | null;
  endDate: string | null;
  startPrice: number | null;       // raw close/NAV at the start observation
  endPrice: number | null;         // raw close/NAV at the end observation (= latestPrice)
  spark: number[] | null;          // split-adjusted price series over the same range
  unavailableReason: string | null;
}
export interface PricePerfResult {
  periods: Record<PricePeriod, PricePerf>;
  asOf: string | null;             // latest completed EOD observation date
  asOfDate: string | null;         // alias of asOf (explicit field name)
  latestPrice: number | null;      // latest completed RAW close / NAV
  seriesBasis: SeriesBasis;
}

export interface RawObs { date: string; rawClose: number; splitFactor?: number }

/** Number of completed trading sessions in the 5D window. */
const FIVE_SESSIONS = 5;

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Calendar cutoff for the month/year periods (never called for 1D/5D/YTD/Max). */
function calendarCutoff(lastISO: string, period: "1M" | "6M" | "1Y" | "3Y" | "5Y"): string {
  const d = new Date(lastISO + "T00:00:00Z");
  if (period === "1M") d.setUTCMonth(d.getUTCMonth() - 1);
  else if (period === "6M") d.setUTCMonth(d.getUTCMonth() - 6);
  else if (period === "1Y") d.setUTCFullYear(d.getUTCFullYear() - 1);
  else if (period === "3Y") d.setUTCFullYear(d.getUTCFullYear() - 3);
  else d.setUTCFullYear(d.getUTCFullYear() - 5); // "5Y"
  return iso(d);
}

export function canonicalPricePerformance(observations: RawObs[], seriesBasis: SeriesBasis): PricePerfResult {
  const asc = observations
    .filter((o): o is RawObs => o != null && Number.isFinite(o.rawClose) && o.rawClose > 0)
    .map((o) => ({ date: o.date, raw: o.rawClose, sf: o.splitFactor ?? 1 }));
  const n = asc.length;
  const asOf = n ? asc[n - 1].date : null;
  const latestPrice = n ? asc[n - 1].raw : null;
  const periods = {} as Record<PricePeriod, PricePerf>;
  const blank = (p: PricePeriod, reason: string): PricePerf =>
    ({ period: p, priceChange: null, startDate: null, endDate: asOf, startPrice: null, endPrice: latestPrice, spark: null, unavailableReason: reason });

  if (n < 2) { for (const p of PRICE_PERIODS) periods[p] = blank(p, "insufficient history"); return { periods, asOf, asOfDate: asOf, latestPrice, seriesBasis }; }

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
    else if (p === "5D") startIdx = n - 1 - FIVE_SESSIONS;              // five completed sessions earlier
    else if (p === "YTD") startIdx = indexAtOrBefore(`${Number(last.date.slice(0, 4)) - 1}-12-31`);
    else if (p === "Max") startIdx = 0;                                 // earliest available observation
    else startIdx = indexAtOrBefore(calendarCutoff(last.date, p));      // 1M / 6M / 1Y / 3Y / 5Y

    if (startIdx < 0 || startIdx >= n - 1) { periods[p] = blank(p, "history does not reach the period cutoff"); continue; }
    const pc = adj[startIdx] > 0 ? adj[n - 1] / adj[startIdx] - 1 : null;
    const sparkVals = adj.slice(startIdx);
    periods[p] = {
      period: p,
      priceChange: pc != null && Number.isFinite(pc) ? pc : null,   // full precision, cumulative
      startDate: asc[startIdx].date, endDate: last.date,
      startPrice: asc[startIdx].raw, endPrice: last.raw,
      spark: sparkVals.length > 8 ? sparkVals : null,
      unavailableReason: null,
    };
  }
  return { periods, asOf, asOfDate: asOf, latestPrice, seriesBasis };
}
