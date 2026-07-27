/**
 * KPI engine - all formulas computed from daily NAV/adjusted-close history.
 * 3-year window for risk stats; 5-year for return/drawdown.
 * Monthly returns derived from last trading day of each calendar month.
 */

export interface DailyPrice {
  date: string;
  price: number;
}

export interface DividendRecord {
  date: string;
  amount: number;
}

export interface StressResult {
  label: string;
  start: string;
  end: string;
  fundReturn: number | null;    // % total return over the window
  benchReturn: number | null;
}

export interface KpiResult {
  // Returns
  return1y: number | null;
  return3y: number | null;
  return5y: number | null;

  // Risk
  stdDev3y: number | null;       // annualized std dev of monthly returns (3y)
  maxDrawdown5y: number | null;  // peak-to-trough % (negative)
  maxDrawdown3y: number | null;

  // Risk-adjusted
  sharpe3y: number | null;
  sortino3y: number | null;      // Sharpe using downside deviation only
  calmar3y: number | null;       // 3y ann return / |max DD 3y|
  infoRatio3y: number | null;    // alpha / tracking error

  // Factor
  beta3y: number | null;
  alpha3y: number | null;

  // Capture
  upsideCapture3y: number | null;
  downsideCapture3y: number | null;

  // Consistency
  battingAvg3y: number | null;   // % of months beating benchmark (3y)

  // Income
  ttmYield: number | null;       // trailing 12-month dividend yield %
  divGrowth3y: number | null;    // 3-year annualized dividend growth %

  // Rolling returns for chart (monthly points over 3y)
  rolling3y: { date: string; fundReturn: number; benchReturn: number }[];

  // Stress tests
  stressTests: StressResult[];

  // Per-period stat sets driving the Analysis period toggle
  periods: Record<Period, PeriodStats>;
  cumReturn: Record<Period, number | null>;   // cumulative total-gain % per period (primary display)
}

// All return/risk formulas live in the central methodology module — this file
// only orchestrates windows, alignment, and provider quirks.
import {
  RISK_FREE_ANNUAL, annualizedVolatility, maxDrawdown as calcMaxDrawdown,
  betaAlpha, sharpeRatio, sortinoRatio, sampleStdDev, alignByDate, periodicReturns,
} from "./metrics/performance";
import { PERIODS, PERIOD_YEARS, type Period } from "./metrics/periods";
import { canonicalPeriodReturns } from "./perf/canonicalReturns";
export { RISK_FREE_ANNUAL };

/** One period's full stat set — every value independently span/obs-guarded.
    Frequency: 1Y risk stats use DAILY returns (√252 — 12 monthly points can't
    support statistics); 3Y/5Y/10Y use month-end returns (√12, the documented
    Morningstar-convention choice). Returns/drawdown always daily + day-count. */
export interface PeriodStats {
  return: number | null;            // score-consumed %: annualized for 3Y/5Y/10Y, cumulative for 1Y
  cumulativeReturn: number | null;  // PRIMARY display %: total gain over the whole period
  annualizedReturn: number | null;  // secondary display %: geometric annualized (3Y/5Y/10Y only)
  volatility: number | null;   // annualized %
  sharpe: number | null;
  sortino: number | null;
  beta: number | null;
  alpha: number | null;        // annualized Jensen's alpha %
  maxDrawdown: number | null;  // %
}

export const EMPTY_PERIOD: PeriodStats = {
  return: null, cumulativeReturn: null, annualizedReturn: null,
  volatility: null, sharpe: null, sortino: null,
  beta: null, alpha: null, maxDrawdown: null,
};

/** Historical stress-test windows */
const STRESS_WINDOWS = [
  { label: "GFC 2008–09",   start: "2007-10-09", end: "2009-03-09" },
  { label: "COVID Crash",   start: "2020-02-19", end: "2020-03-23" },
  { label: "2022 Selloff",  start: "2022-01-03", end: "2022-10-13" },
  { label: "2018 Q4",       start: "2018-09-20", end: "2018-12-24" },
];

// ── helpers ───────────────────────────────────────────────────────────────────

function toMonthly(daily: DailyPrice[]): DailyPrice[] {
  const byMonth = new Map<string, DailyPrice>();
  for (const d of daily) {
    byMonth.set(d.date.slice(0, 7), d);
  }
  return [...byMonth.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function monthlyReturns(prices: DailyPrice[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    out.push(prices[i].price / prices[i - 1].price - 1);
  }
  return out;
}

function trailingYears(daily: DailyPrice[], years: number): DailyPrice[] {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);
  return daily.filter((d) => d.date >= cutoff.toISOString().slice(0, 10));
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

/** Median - robust center, used to gauge a fund's "normal" distribution size. */
function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Nearest price on or after a given date string */
function priceAt(daily: DailyPrice[], dateStr: string): number | null {
  const d = daily.find((p) => p.date >= dateStr);
  return d?.price ?? null;
}

// ── main ──────────────────────────────────────────────────────────────────────

export function computeKpis(
  fundDaily: DailyPrice[],
  benchDaily: DailyPrice[],
  dividends: DividendRecord[] = [],
  currentPrice = 0,
): KpiResult {
  const empty: KpiResult = {
    return1y: null, return3y: null, return5y: null,
    stdDev3y: null, maxDrawdown5y: null, maxDrawdown3y: null,
    sharpe3y: null, sortino3y: null, calmar3y: null, infoRatio3y: null,
    beta3y: null, alpha3y: null,
    upsideCapture3y: null, downsideCapture3y: null,
    battingAvg3y: null, ttmYield: null, divGrowth3y: null,
    rolling3y: [], stressTests: [],
    periods: { "1Y": { ...EMPTY_PERIOD }, "3Y": { ...EMPTY_PERIOD }, "5Y": { ...EMPTY_PERIOD }, "10Y": { ...EMPTY_PERIOD } },
    cumReturn: { "1Y": null, "3Y": null, "5Y": null, "10Y": null },
  };

  if (!fundDaily.length) return empty;

  const result = { ...empty };
  result.periods = computeAllPeriods(fundDaily, benchDaily);
  const lastPrice = fundDaily[fundDaily.length - 1].price;

  // Actual elapsed years between two dates — annualization must use the REAL
  // span, and a labeled N-year stat is only shown when ~the full N years of
  // history exist. A fund with 18 months of data gets null for 3y/5y fields
  // (shown as insufficient data), never a mislabeled or misannualized number.
  const lastDate = fundDaily[fundDaily.length - 1].date;
  const spanYears = (a: string, b: string) =>
    (new Date(b).getTime() - new Date(a).getTime()) / (365.25 * 24 * 3600 * 1000);
  const MIN_SPAN_FRACTION = 0.9;

  // ── Trailing total returns: THE canonical engine (one source used for display,
  //    Advisor Review Score, and peer ranking). Overwrites ONLY the return field
  //    of each period stat — volatility/Sharpe/Sortino/beta/alpha/drawdown are
  //    untouched. Calendar cutoff (latest obs on/before), geometric annualized
  //    for 3Y/5Y/10Y, cumulative for 1Y; full precision (stored as %).
  const canon = canonicalPeriodReturns(fundDaily.map((d) => ({ date: d.date, value: d.price })));
  for (const p of PERIODS) {
    const cr = canon.periods[p];
    const cum = cr.cumulativeReturn != null ? cr.cumulativeReturn * 100 : null;   // PRIMARY display (total gain)
    const ann = cr.annualizedReturn != null ? cr.annualizedReturn * 100 : null;   // secondary (annualized)
    result.periods[p].cumulativeReturn = cum;
    result.periods[p].annualizedReturn = ann;
    // Score-consumed return: annualized for 3Y/5Y/10Y, cumulative for 1Y (same canonical result).
    result.periods[p].return = cr.annualizable ? ann : cum;
    result.cumReturn[p] = cum;
  }
  // Top-level fields keep their historical meaning (return3y/5y = annualized/CAGR).
  result.return1y = result.periods["1Y"].return;
  result.return3y = result.periods["3Y"].return;
  result.return5y = result.periods["5Y"].return;

  // ── Drawdown (3y and 5y) from the daily adjusted series ─────────────────────
  for (const [field, years] of [["maxDrawdown5y", 5], ["maxDrawdown3y", 3]] as [keyof KpiResult, number][]) {
    const w = trailingYears(fundDaily, years);
    if (w.length < 20) continue;
    if (spanYears(w[0].date, lastDate) < years * MIN_SPAN_FRACTION) continue;
    (result[field] as number | null) = calcMaxDrawdown(w);
  }

  // ── Calmar (3y): 3y ann return / |max drawdown 3y| ───────────────────────────
  if (result.return3y !== null && result.maxDrawdown3y !== null && result.maxDrawdown3y < 0) {
    result.calmar3y = +(result.return3y / Math.abs(result.maxDrawdown3y)).toFixed(3);
  }

  // ── 3-year monthly alignment ─────────────────────────────────────────────────
  const fund3y = trailingYears(fundDaily, 3);
  const bench3y = trailingYears(benchDaily, 3);
  if (fund3y.length < 24 || bench3y.length < 24) {
    result.stressTests = computeStressTests(fundDaily, benchDaily);
    result.ttmYield = computeTtmYield(dividends, currentPrice || lastPrice);
    result.divGrowth3y = computeDivGrowth(dividends);
    return result;
  }

  const fundM = toMonthly(fund3y);
  const benchM = toMonthly(bench3y);
  const benchByMonth = new Map(benchM.map((d) => [d.date.slice(0, 7), d]));

  const alignedFund: DailyPrice[] = [];
  const alignedBench: DailyPrice[] = [];
  for (const fd of fundM) {
    const bd = benchByMonth.get(fd.date.slice(0, 7));
    if (bd) { alignedFund.push(fd); alignedBench.push(bd); }
  }

  if (alignedFund.length < 24) {
    result.stressTests = computeStressTests(fundDaily, benchDaily);
    result.ttmYield = computeTtmYield(dividends, currentPrice || lastPrice);
    result.divGrowth3y = computeDivGrowth(dividends);
    return result;
  }

  const fr = monthlyReturns(alignedFund);
  const br = monthlyReturns(alignedBench);
  if (fr.length < 24) return result;

  // ── Risk & factor stats — monthly-return convention (documented), all
  //    delegated to the central methodology module ─────────────────────────────
  result.stdDev3y = annualizedVolatility(fr, 12);

  // Sharpe / Sortino: geometric annualized return over the stated risk-free
  // assumption (see RISK_FREE_LABEL in metrics/performance).
  result.sharpe3y = sharpeRatio(fr, 12);
  result.sortino3y = sortinoRatio(fr, 12);

  // Beta + annualized Jensen's alpha vs the mapped benchmark, from aligned
  // monthly excess returns with geometric annualization.
  const ba = betaAlpha(fr, br, 12);
  result.beta3y = ba?.beta ?? null;
  result.alpha3y = ba?.alphaAnnualPct ?? null;

  // Information ratio: alpha / tracking error (annualized σ of excess returns)
  const excessReturns = fr.map((r, i) => r - br[i]);
  const te = (sampleStdDev(excessReturns) ?? 0) * Math.sqrt(12);
  const annAlpha = result.alpha3y ?? 0;
  result.infoRatio3y = te > 0 ? +(annAlpha / (te * 100)).toFixed(3) : null;

  // Upside / downside capture
  const upFund: number[] = [], upBench: number[] = [];
  const downFund: number[] = [], downBench: number[] = [];
  let beatCount = 0;

  for (let i = 0; i < br.length; i++) {
    if (br[i] > 0) { upFund.push(fr[i]); upBench.push(br[i]); }
    else if (br[i] < 0) { downFund.push(fr[i]); downBench.push(br[i]); }
    if (fr[i] > br[i]) beatCount++;
  }

  if (upBench.length > 0) result.upsideCapture3y = +(mean(upFund) / mean(upBench) * 100).toFixed(1);
  if (downBench.length > 0) result.downsideCapture3y = +(mean(downFund) / mean(downBench) * 100).toFixed(1);

  // Batting average: % of months fund beat benchmark
  result.battingAvg3y = +(beatCount / fr.length * 100).toFixed(1);

  // Rolling 3y monthly return series (growth of $100 rebased)
  result.rolling3y = alignedFund.slice(1).map((_, idx) => {
    const fundGrowth = alignedFund[idx + 1].price / alignedFund[0].price - 1;
    const benchGrowth = alignedBench[idx + 1].price / alignedBench[0].price - 1;
    return {
      date: alignedFund[idx + 1].date.slice(0, 7),
      fundReturn: +(fundGrowth * 100).toFixed(2),
      benchReturn: +(benchGrowth * 100).toFixed(2),
    };
  });

  // Stress tests
  result.stressTests = computeStressTests(fundDaily, benchDaily);

  // Income
  result.ttmYield = computeTtmYield(dividends, currentPrice || lastPrice);
  result.divGrowth3y = computeDivGrowth(dividends);

  return result;
}

// ── Per-period stats (Analysis period toggle) ────────────────────────────────

const SPAN_FRACTION = 0.9;

function windowSpanOk(w: DailyPrice[], lastDate: string, years: number): boolean {
  if (w.length < 20) return false;
  const span = (new Date(lastDate).getTime() - new Date(w[0].date).getTime()) / (365.25 * 24 * 3600 * 1000);
  return span >= years * SPAN_FRACTION;
}

/** Full stat set for one trailing window. Every stat guards independently. */
function computePeriodStats(fundDaily: DailyPrice[], benchDaily: DailyPrice[], years: number): PeriodStats {
  const out: PeriodStats = { ...EMPTY_PERIOD };
  if (!fundDaily.length) return out;
  const lastDate = fundDaily[fundDaily.length - 1].date;
  const w = trailingYears(fundDaily, years);
  if (!windowSpanOk(w, lastDate, years)) return out;

  // out.return is set from the canonical engine in computeKpis (single source).
  out.maxDrawdown = calcMaxDrawdown(w);

  const bw = trailingYears(benchDaily, years);
  if (years === 1) {
    // Daily-frequency risk stats (documented exception — see PeriodStats).
    const fr = periodicReturns(w);
    out.volatility = annualizedVolatility(fr, 252, 200);
    out.sharpe = sharpeRatio(fr, 252, undefined, 200);
    out.sortino = sortinoRatio(fr, 252, undefined, 200);
    const { a: fa, b: ba } = alignByDate(w, bw);
    const ab = betaAlpha(periodicReturns(fa), periodicReturns(ba), 252, undefined, 200);
    out.beta = ab?.beta ?? null;
    out.alpha = ab?.alphaAnnualPct ?? null;
  } else {
    const minObs = Math.floor(years * 12 * SPAN_FRACTION);
    const fm = toMonthly(w);
    const bm = toMonthly(bw);
    const bByMonth = new Map(bm.map((d) => [d.date.slice(0, 7), d]));
    const alignedF: DailyPrice[] = [], alignedB: DailyPrice[] = [];
    for (const fd of fm) {
      const bd = bByMonth.get(fd.date.slice(0, 7));
      if (bd) { alignedF.push(fd); alignedB.push(bd); }
    }
    const fr = monthlyReturns(fm);
    out.volatility = annualizedVolatility(fr, 12, minObs);
    out.sharpe = sharpeRatio(fr, 12, undefined, minObs);
    out.sortino = sortinoRatio(fr, 12, undefined, minObs);
    const ab = betaAlpha(monthlyReturns(alignedF), monthlyReturns(alignedB), 12, undefined, minObs);
    out.beta = ab?.beta ?? null;
    out.alpha = ab?.alphaAnnualPct ?? null;
  }
  return out;
}

function computeAllPeriods(fundDaily: DailyPrice[], benchDaily: DailyPrice[]): Record<Period, PeriodStats> {
  const out = {} as Record<Period, PeriodStats>;
  for (const p of PERIODS) out[p] = computePeriodStats(fundDaily, benchDaily, PERIOD_YEARS[p]);
  return out;
}

// ── Stress tests ──────────────────────────────────────────────────────────────

function computeStressTests(fundDaily: DailyPrice[], benchDaily: DailyPrice[]): StressResult[] {
  return STRESS_WINDOWS.map(({ label, start, end }) => {
    const fStart = priceAt(fundDaily, start);
    const fEnd = priceAt(fundDaily, end);
    const bStart = priceAt(benchDaily, start);
    const bEnd = priceAt(benchDaily, end);

    return {
      label,
      start,
      end,
      fundReturn: fStart && fEnd ? +((fEnd / fStart - 1) * 100).toFixed(2) : null,
      benchReturn: bStart && bEnd ? +((bEnd / bStart - 1) * 100).toFixed(2) : null,
    };
  });
}

// ── Dividend metrics ──────────────────────────────────────────────────────────

/**
 * Trailing-12-month distribution yield (%).
 *
 * Provider dividend streams commonly fold year-end CAPITAL-GAINS
 * distributions in with income dividends for mutual funds - there is no
 * separate capital-gains stream - so naively summing overstates the income
 * yield, often several-fold (e.g. AIVSX: ~1.5% income reads as ~10%).
 *
 * Fix: winsorize the stream. Any single payment that is BOTH a large multiple
 * of the fund's median payment AND a material fraction of price is treated as
 * cap-gains-like and clamped down to the median (counted as one normal payment)
 * rather than summed in full. Clamping (vs. dropping) keeps the recurring income
 * bundled into that same December event and degrades gracefully for funds
 * that pay only once a year. A final cap guards against pathological data.
 * Both gates must trip, so genuinely high-yield funds with a regular cadence
 * (covered-call, high-yield bond, preferred) are left untouched.
 *
 * Known limitation: funds that distribute large cap gains EVERY period (some
 * tax-inefficient allocation/growth funds) have no clean income baseline in this
 * stream and may remain somewhat overstated.
 */
const TTM_OUTLIER_MULT = 2.5;   // a payment > this × the median ...
const TTM_OUTLIER_PCT = 0.02;   // ... AND > this fraction of price looks like cap gains
const TTM_YIELD_CAP = 15;       // guardrail: max plausible distribution yield (%)

function computeTtmYield(dividends: DividendRecord[], currentPrice: number): number | null {
  if (!dividends.length || !currentPrice) return null;
  const ttmCutoff = new Date();
  ttmCutoff.setFullYear(ttmCutoff.getFullYear() - 1);
  const cutStr = ttmCutoff.toISOString().slice(0, 10);
  const ttm = dividends.filter((d) => d.date >= cutStr);
  if (!ttm.length) return null;

  // "Normal" payment size, robust to the occasional large cap-gains event.
  // Gauged over a trailing 3-year window (always ⊇ the TTM payments) so the
  // baseline tracks current distribution levels and is identical whether the
  // caller passes 3y (recommend) or 10y (screen) of history.
  const baseCutoff = new Date();
  baseCutoff.setFullYear(baseCutoff.getFullYear() - 3);
  const baseStr = baseCutoff.toISOString().slice(0, 10);
  const normal = median(dividends.filter((d) => d.date >= baseStr).map((d) => d.amount));

  const total = ttm.reduce((sum, d) => {
    const capGainLike =
      normal > 0 &&
      d.amount > normal * TTM_OUTLIER_MULT &&
      d.amount / currentPrice > TTM_OUTLIER_PCT;
    return sum + (capGainLike ? normal : d.amount);
  }, 0);

  return +Math.min((total / currentPrice) * 100, TTM_YIELD_CAP).toFixed(2);
}

function computeDivGrowth(dividends: DividendRecord[]): number | null {
  if (dividends.length < 4) return null; // need at least 1 full year each side

  // Annualize by calendar year
  const byYear = new Map<number, number>();
  for (const d of dividends) {
    const yr = +d.date.slice(0, 4);
    byYear.set(yr, (byYear.get(yr) ?? 0) + d.amount);
  }
  const years = [...byYear.keys()].sort();
  if (years.length < 2) return null;

  // Use oldest full year vs most recent full year (max 3-year window)
  const currentYear = new Date().getFullYear();
  const recentYears = years.filter((y) => y < currentYear).slice(-4); // up to 4 past full years
  if (recentYears.length < 2) return null;

  const earliest = recentYears[0];
  const latest = recentYears[recentYears.length - 1];
  const span = latest - earliest;
  if (span < 1) return null;

  const startDiv = byYear.get(earliest)!;
  const endDiv = byYear.get(latest)!;
  if (startDiv <= 0) return null;

  return +((endDiv / startDiv) ** (1 / span) - 1) * 100;
}

// ── Percentile scoring ────────────────────────────────────────────────────────

export function computePercentiles(
  funds: Array<{ kpi: KpiResult; expenseRatio: number | null }>
): Array<{
  cost: number;
  riskAdj: number;
  downside: number;
  alpha: number;
  consistency: number;
  yield: number;
}> {
  const n = funds.length;
  if (n === 0) return [];

  function pctRank(vals: (number | null)[], higherIsBetter: boolean): number[] {
    const pairs = vals.map((v, i) => ({ v, i }));
    const valid = pairs.filter((p) => p.v !== null) as { v: number; i: number }[];
    valid.sort((a, b) => higherIsBetter ? a.v - b.v : b.v - a.v);
    const ranks = new Array(n).fill(50);
    valid.forEach(({ i }, rank) => {
      ranks[i] = valid.length > 1 ? Math.round((rank / (valid.length - 1)) * 100) : 50;
    });
    return ranks;
  }

  const erRanks     = pctRank(funds.map((f) => f.expenseRatio), false);
  const sharpeRanks = pctRank(funds.map((f) => f.kpi.sharpe3y), true);
  const sortinoRanks = pctRank(funds.map((f) => f.kpi.sortino3y), true);
  const alphaRanks  = pctRank(funds.map((f) => f.kpi.alpha3y), true);
  const dcRanks     = pctRank(funds.map((f) => f.kpi.downsideCapture3y), false);
  const ddRanks     = pctRank(funds.map((f) => f.kpi.maxDrawdown5y), true);
  const yieldRanks  = pctRank(funds.map((f) => f.kpi.ttmYield), true);

  const r1Ranks = pctRank(funds.map((f) => f.kpi.return1y), true);
  const r3Ranks = pctRank(funds.map((f) => f.kpi.return3y), true);
  const r5Ranks = pctRank(funds.map((f) => f.kpi.return5y), true);
  const batRanks = pctRank(funds.map((f) => f.kpi.battingAvg3y), true);

  const consistencyRanks = funds.map((_, i) => {
    const avg = (r1Ranks[i] + r3Ranks[i] + r5Ranks[i] + batRanks[i]) / 4;
    const spread = Math.abs(r1Ranks[i] - r3Ranks[i]) + Math.abs(r3Ranks[i] - r5Ranks[i]);
    return Math.max(0, Math.round(avg - spread * 0.25));
  });

  return funds.map((_, i) => ({
    cost:        erRanks[i],
    riskAdj:     Math.round((sharpeRanks[i] + sortinoRanks[i]) / 2),
    downside:    Math.round((dcRanks[i] + ddRanks[i]) / 2),
    alpha:       alphaRanks[i],
    consistency: consistencyRanks[i],
    yield:       yieldRanks[i],
  }));
}

