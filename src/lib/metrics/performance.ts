/**
 * ALCA performance & risk methodology — THE single implementation of every
 * return/risk formula in the product. `src/lib/kpi.ts` (and anything else)
 * must delegate here; a scan test fails if a competing implementation appears.
 *
 * Methodology (full prose: docs/performance-metric-methodology.md):
 *  - Inputs are ADJUSTED prices (splits + distributions reinvested) → total
 *    return, net of fund expenses. Expense ratios are never subtracted again.
 *  - Cumulative & annualized returns and drawdown: computed on the daily
 *    adjusted series; annualization = CAGR over ACTUAL elapsed days (365.25).
 *  - Volatility, Sharpe, Sortino, beta, alpha: computed on MONTH-END returns
 *    and annualized with √12 / ^12. This is the deliberate, documented choice
 *    (Morningstar's MPT-statistics convention) rather than daily/√252 — it
 *    maximizes comparability with the systems advisors check against.
 *  - Benchmark-relative stats require aligned shared observations (≥ MIN_OBS);
 *    fund and benchmark are matched by month, never interpolated.
 *  - Alpha = annualized Jensen's alpha: geometric annualized fund return minus
 *    CAPM-expected return (rf + β·(benchmark − rf)), where both annualized
 *    returns are geometric (compound) over the same aligned window.
 *  - Beta = cov(fund excess, bench excess) / var(bench excess) on monthly
 *    excess returns over the risk-free rate. (With a constant rf this equals
 *    the raw-return beta; excess form is kept for correctness if rf becomes a
 *    series.)
 *  - Risk-free policy: one static, documented annual assumption below. It is
 *    surfaced in the registry, methodology docs, and UI methodology notes —
 *    never a silent unknown.
 *  - Insufficient data → null (rendered "—"). Values are never invented.
 */

export interface PricePoint { date: string; price: number }

/** Static risk-free assumption (annual, decimal). 3-month T-bill proxy —
    reviewed manually; update here and every metric follows. */
export const RISK_FREE_ANNUAL = 0.045;
export const RISK_FREE_LABEL = "4.5%/yr static 3-month T-bill proxy";

/** Minimum aligned periodic observations for any statistical metric. */
export const MIN_OBS = 24;

export const DAYS_PER_YEAR = 365.25;

// ── Return fundamentals ───────────────────────────────────────────────────────

/** Actual elapsed years between two ISO dates. */
export function elapsedYears(startDate: string, endDate: string): number {
  return (new Date(endDate).getTime() - new Date(startDate).getTime()) / (DAYS_PER_YEAR * 24 * 3600 * 1000);
}

/** Simple periodic returns from an ordered value series. */
export function periodicReturns(series: PricePoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) out.push(series[i].price / series[i - 1].price - 1);
  return out;
}

/** Cumulative total return (%) from first to last adjusted value. */
export function cumulativeReturn(series: PricePoint[]): number | null {
  if (series.length < 2 || series[0].price <= 0) return null;
  return +((series[series.length - 1].price / series[0].price - 1) * 100).toFixed(2);
}

/** Annualized return (%) — CAGR over the ACTUAL elapsed days of the series. */
export function annualizedReturn(series: PricePoint[]): number | null {
  if (series.length < 2 || series[0].price <= 0) return null;
  const years = elapsedYears(series[0].date, series[series.length - 1].date);
  if (years <= 0) return null;
  return +(((series[series.length - 1].price / series[0].price) ** (1 / years) - 1) * 100).toFixed(2);
}

/** Geometric (compound) annualized return from periodic returns (decimal). */
export function geometricAnnualized(returns: number[], periodsPerYear: number): number | null {
  if (returns.length < 2) return null;
  const growth = returns.reduce((g, r) => g * (1 + r), 1);
  return growth ** (periodsPerYear / returns.length) - 1;
}

// ── Risk ──────────────────────────────────────────────────────────────────────

/** Sample standard deviation. */
export function sampleStdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
}

/** Annualized volatility (%) from periodic returns: σ × √periodsPerYear. */
export function annualizedVolatility(returns: number[], periodsPerYear: number, minObs = MIN_OBS): number | null {
  if (returns.length < minObs) return null;
  const sd = sampleStdDev(returns);
  if (sd == null) return null;
  return +(sd * Math.sqrt(periodsPerYear) * 100).toFixed(2);
}

/** Max drawdown (%) — largest peak-to-trough decline of the value series. */
export function maxDrawdown(series: PricePoint[]): number | null {
  if (series.length < 2) return null;
  let peak = series[0].price, maxDD = 0;
  for (const p of series) {
    if (p.price > peak) peak = p.price;
    const dd = (p.price - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }
  return +(maxDD * 100).toFixed(2);
}

// ── Benchmark-relative ────────────────────────────────────────────────────────

/** Align two series on exact shared dates; no interpolation. */
export function alignByDate(a: PricePoint[], b: PricePoint[]): { a: PricePoint[]; b: PricePoint[] } {
  const bByDate = new Map(b.map((p) => [p.date, p]));
  const outA: PricePoint[] = [], outB: PricePoint[] = [];
  for (const p of a) {
    const match = bByDate.get(p.date);
    if (match) { outA.push(p); outB.push(match); }
  }
  return { a: outA, b: outB };
}

/** Align two series on shared month keys (YYYY-MM); no interpolation. */
export function alignByMonth(a: PricePoint[], b: PricePoint[]): { a: PricePoint[]; b: PricePoint[] } {
  const bByMonth = new Map(b.map((p) => [p.date.slice(0, 7), p]));
  const outA: PricePoint[] = [], outB: PricePoint[] = [];
  for (const p of a) {
    const match = bByMonth.get(p.date.slice(0, 7));
    if (match) { outA.push(p); outB.push(match); }
  }
  return { a: outA, b: outB };
}

export interface BetaAlphaResult { beta: number; alphaAnnualPct: number; obs: number }

/**
 * Beta and annualized Jensen's alpha from aligned periodic returns.
 *  beta  = cov(fund − rf, bench − rf) / var(bench − rf)
 *  alpha = annualized fund return − [rf + β·(annualized bench − rf)]
 * where the annualized returns are geometric over the same window.
 * Returns null unless ≥ minObs aligned observations exist.
 */
export function betaAlpha(
  fundReturns: number[], benchReturns: number[],
  periodsPerYear: number, rfAnnual = RISK_FREE_ANNUAL, minObs = MIN_OBS,
): BetaAlphaResult | null {
  const n = Math.min(fundReturns.length, benchReturns.length);
  if (n < minObs) return null;
  const rfPeriodic = (1 + rfAnnual) ** (1 / periodsPerYear) - 1;
  const fx = fundReturns.slice(0, n).map((r) => r - rfPeriodic);
  const bx = benchReturns.slice(0, n).map((r) => r - rfPeriodic);
  const fm = fx.reduce((s, v) => s + v, 0) / n;
  const bm = bx.reduce((s, v) => s + v, 0) / n;
  let cov = 0, bvar = 0;
  for (let i = 0; i < n; i++) { cov += (fx[i] - fm) * (bx[i] - bm); bvar += (bx[i] - bm) ** 2; }
  cov /= n - 1; bvar /= n - 1;
  if (bvar <= 0) return null;
  const beta = cov / bvar;
  const annFund = geometricAnnualized(fundReturns.slice(0, n), periodsPerYear);
  const annBench = geometricAnnualized(benchReturns.slice(0, n), periodsPerYear);
  if (annFund == null || annBench == null) return null;
  const alpha = annFund - (rfAnnual + beta * (annBench - rfAnnual));
  return { beta: +beta.toFixed(3), alphaAnnualPct: +(alpha * 100).toFixed(2), obs: n };
}

// ── Risk-adjusted ─────────────────────────────────────────────────────────────

/** Sharpe: (geometric annualized return − rf) / annualized volatility. */
export function sharpeRatio(returns: number[], periodsPerYear: number, rfAnnual = RISK_FREE_ANNUAL, minObs = MIN_OBS): number | null {
  if (returns.length < minObs) return null;
  const annRet = geometricAnnualized(returns, periodsPerYear);
  const sd = sampleStdDev(returns);
  // Epsilon guard: a constant series has no meaningful risk-adjusted ratio.
  if (annRet == null || sd == null || sd < 1e-9) return null;
  const annVol = sd * Math.sqrt(periodsPerYear);
  return +((annRet - rfAnnual) / annVol).toFixed(3);
}

/** Downside deviation vs a periodic target (annualized, decimal). */
export function downsideDeviation(returns: number[], periodicTarget: number): number | null {
  const below = returns.filter((r) => r < periodicTarget).map((r) => (r - periodicTarget) ** 2);
  if (below.length < 2) return null;
  return Math.sqrt(below.reduce((s, v) => s + v, 0) / returns.length);
}

/** Sortino: (geometric annualized return − target) / annualized downside dev.
    Default minimum acceptable return = the risk-free assumption. */
export function sortinoRatio(returns: number[], periodsPerYear: number, targetAnnual = RISK_FREE_ANNUAL, minObs = MIN_OBS): number | null {
  if (returns.length < minObs) return null;
  const annRet = geometricAnnualized(returns, periodsPerYear);
  const periodicTarget = (1 + targetAnnual) ** (1 / periodsPerYear) - 1;
  const dd = downsideDeviation(returns, periodicTarget);
  if (annRet == null || dd == null || dd < 1e-9) return null;
  const annDD = dd * Math.sqrt(periodsPerYear);
  return +((annRet - targetAnnual) / annDD).toFixed(3);
}
