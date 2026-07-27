/**
 * Canonical trailing-return engine — the ONE source of standardized fund total
 * returns for the whole app (display, Advisor Review Score, peer ranking,
 * screener, comparison, analysis, firm funds — every consumer). Provider-neutral
 * and PURE: it takes dated adjusted observations (ETF adjusted close or mutual-
 * fund NAV-compatible adjusted values — the caller supplies the correct series)
 * and returns each standardized period's total return.
 *
 * Convention (the approved dcf5914 convention — do not revert):
 *   • Start observation = latest valid observation ON OR BEFORE the calendar
 *     cutoff (nearest trading day on/before the target date); end = latest
 *     completed EOD observation. Never fixed trading-day approximations.
 *   • 1D/1M/3M/YTD/1Y → cumulative total return.
 *   • 3Y/5Y/10Y      → geometric annualized total return over ACTUAL elapsed time.
 *   • Full precision retained (returns are FRACTIONS, e.g. 0.1234); rounding
 *     happens only at display.
 *   • Genuine insufficient history → return null with an availability reason
 *     (never 0). Valid negative/zero returns stay valid.
 *   • The sparkline covers the SAME source range as its period's return.
 */

export const PERF_PERIODS = ["1D", "1M", "3M", "YTD", "1Y", "3Y", "5Y", "10Y"] as const;
export type PerfPeriod = (typeof PERF_PERIODS)[number];
export const DEFAULT_PERF_PERIOD: PerfPeriod = "1M";

/** Which windows are presented annualized. */
export const ANNUALIZED_PERIODS: Record<PerfPeriod, boolean> = {
  "1D": false, "1M": false, "3M": false, "YTD": false, "1Y": false, "3Y": true, "5Y": true, "10Y": true,
};
/** Display labels (annualized windows are explicitly marked). */
export const PERIOD_LABEL: Record<PerfPeriod, string> = {
  "1D": "1D", "1M": "1M", "3M": "3M", "YTD": "YTD", "1Y": "1Y",
  "3Y": "3Y Annualized", "5Y": "5Y Annualized", "10Y": "10Y Annualized",
};
/** Calendar-year lookback per multi-year/annual window (for the buffered fetch). */
export const MAX_LOOKBACK_YEARS = 10;

export interface CanonicalReturn {
  period: PerfPeriod;
  /** PRIMARY user-facing figure — cumulative total return (end/start − 1) over the
   *  whole selected period, for ALL periods. FRACTION, full precision. */
  cumulativeReturn: number | null;
  /** SECONDARY — geometric annualized total return; only for 3Y/5Y/10Y (else null).
   *  Computed directly from the same start/end values, never by compounding a
   *  rounded cumulative figure. FRACTION, full precision. */
  annualizedReturn: number | null;
  /** True for 3Y/5Y/10Y (an annualized figure is meaningful/shown). */
  annualizable: boolean;
  startDate: string | null;
  endDate: string | null;
  spark: number[] | null;        // same source range as the returns
  unavailableReason: string | null;
}
export interface CanonicalResult { periods: Record<PerfPeriod, CanonicalReturn>; asOf: string | null }

export interface DatedObs { date: string; value: number }

const iso = (d: Date) => d.toISOString().slice(0, 10);
function calendarCutoff(lastISO: string, period: Exclude<PerfPeriod, "1D" | "YTD">): string {
  const d = new Date(lastISO + "T00:00:00Z");
  if (period === "1M") d.setUTCMonth(d.getUTCMonth() - 1);
  else if (period === "3M") d.setUTCMonth(d.getUTCMonth() - 3);
  else if (period === "1Y") d.setUTCFullYear(d.getUTCFullYear() - 1);
  else if (period === "3Y") d.setUTCFullYear(d.getUTCFullYear() - 3);
  else if (period === "5Y") d.setUTCFullYear(d.getUTCFullYear() - 5);
  else d.setUTCFullYear(d.getUTCFullYear() - 10); // "10Y"
  return iso(d);
}

/**
 * PURE canonical engine: derive every standardized period's total return + as-of
 * from an ascending series of adjusted observations. Uses calendar cutoffs (the
 * nearest trading day on/before each target date) and geometric annualization
 * over actual elapsed years for 3Y/5Y/10Y. Consumes `value` (adjusted) only.
 */
export function canonicalPeriodReturns(observations: DatedObs[]): CanonicalResult {
  const asc = observations
    .filter((o): o is DatedObs => o != null && Number.isFinite(o.value) && o.value > 0)
    .map((o) => ({ date: o.date, v: o.value }));
  const n = asc.length;
  const asOf = n ? asc[n - 1].date : null;
  const periods = {} as Record<PerfPeriod, CanonicalReturn>;
  const blank = (p: PerfPeriod, reason: string): CanonicalReturn =>
    ({ period: p, cumulativeReturn: null, annualizedReturn: null, annualizable: ANNUALIZED_PERIODS[p], startDate: null, endDate: asOf, spark: null, unavailableReason: reason });

  if (n < 2) { for (const p of PERF_PERIODS) periods[p] = blank(p, "insufficient history"); return { periods, asOf }; }

  const last = asc[n - 1];
  const indexAtOrBefore = (cut: string): number => { for (let i = n - 1; i >= 0; i--) if (asc[i].date <= cut) return i; return -1; };
  const finite = (x: number | null) => (x != null && Number.isFinite(x) ? x : null);

  for (const p of PERF_PERIODS) {
    let startIdx: number;
    if (p === "1D") startIdx = n - 2;                                          // previous completed EOD
    else if (p === "YTD") startIdx = indexAtOrBefore(`${Number(last.date.slice(0, 4)) - 1}-12-31`); // previous year-end
    else startIdx = indexAtOrBefore(calendarCutoff(last.date, p));             // calendar cutoff

    if (startIdx < 0 || startIdx >= n - 1) { periods[p] = blank(p, "history does not reach the period cutoff"); continue; }
    const s = asc[startIdx];
    const annualizable = ANNUALIZED_PERIODS[p];
    // BOTH figures come from the SAME start/end adjusted values — cumulative is
    // computed directly (never by compounding a rounded annualized number).
    const cumulativeReturn = s.v > 0 ? (last.v - s.v) / s.v : null;
    let annualizedReturn: number | null = null;
    if (annualizable) {
      const years = (Date.parse(last.date) - Date.parse(s.date)) / (365.25 * 864e5);
      annualizedReturn = years > 0 ? Math.pow(last.v / s.v, 1 / years) - 1 : null; // geometric annualized
    }
    const sparkVals = asc.slice(startIdx).map((b) => b.v);
    periods[p] = {
      period: p, annualizable,
      cumulativeReturn: finite(cumulativeReturn),                             // full precision
      annualizedReturn: finite(annualizedReturn),
      startDate: s.date, endDate: last.date,
      spark: sparkVals.length > 8 ? sparkVals : null,
      unavailableReason: null,
    };
  }
  return { periods, asOf };
}
