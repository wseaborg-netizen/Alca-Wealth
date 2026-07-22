# ALCA Performance & Risk Metric Methodology

**Code:** all formulas live in `src/lib/metrics/performance.ts`; `src/lib/kpi.ts`
orchestrates windows/alignment and delegates every calculation. A scan test fails
the suite if a competing implementation of alpha/beta/Sharpe/Sortino appears
anywhere else. Definitions are mirrored in `src/lib/metrics/registry.ts` and the
first-pass audit in `docs/analysis-accuracy-audit.md`.

## Input data

- **Adjusted daily price history** from FMP (Tiingo fallback): split-adjusted and
  distribution-adjusted → a **total-return** series, **net of fund expenses**.
  Expense ratios are display facts and are never subtracted from these returns.
- Month-end observations are the last available trading day of each calendar month.
- Fund and benchmark are aligned on **shared months only** — no interpolation,
  no invented history.

## Frequency choices (deliberate, documented)

| Metric family | Frequency | Annualization |
|---|---|---|
| Trailing/cumulative returns, max drawdown | daily series | CAGR over **actual elapsed days** (365.25/yr) |
| Volatility, Sharpe, Sortino, beta, alpha, capture, batting avg | **month-end returns** | ×√12 (vol), ^12 (returns) |

The task-recommended daily/√252 convention was considered and **intentionally not
used for risk statistics**: Morningstar computes MPT statistics (σ, Sharpe, beta,
alpha) from **monthly** returns, and comparability with the systems advisors
check against is the primary goal of this methodology. Daily data remains the
basis for returns and drawdown, where it is strictly more accurate.

## Formulas (plain English)

- **Cumulative return** = end adjusted value ÷ start adjusted value − 1.
- **Annualized (trailing) return** = CAGR: (end/start)^(1/actual years) − 1, where
  actual years = real elapsed days ÷ 365.25. A labeled *N*-year figure is only
  shown when ≥ 90% of the labeled window exists; otherwise **Unavailable** —
  never annualized over a denominator the history doesn't cover.
- **Volatility (3Y)** = sample standard deviation of the 36 month-end returns × √12.
- **Max drawdown** = largest peak-to-trough decline of the daily adjusted series
  in the labeled window (span-guarded like returns).
- **Beta (3Y)** = covariance(fund excess, benchmark excess) ÷ variance(benchmark
  excess) on aligned monthly returns in excess of the risk-free rate. Requires
  ≥ 24 aligned observations.
- **Alpha (3Y)** = annualized **Jensen's alpha**: geometric annualized fund
  return − [rf + β × (geometric annualized benchmark return − rf)], computed on
  the same aligned window as beta. (Previous implementation annualized the
  *arithmetic mean* monthly return — this systematically overstated alpha for
  volatile funds; fixed.)
- **Sharpe (3Y)** = (geometric annualized return − rf) ÷ annualized volatility.
- **Sortino (3Y)** = (geometric annualized return − target) ÷ annualized downside
  deviation, where downside deviation uses returns below the periodic target and
  the **target (minimum acceptable return) = the risk-free assumption**.
- **Information ratio** = alpha ÷ annualized tracking error (σ of monthly excess
  returns × √12).
- **Capture ratios / batting average** = mean fund return in benchmark-up (or
  -down) months ÷ mean benchmark return in those months; % of months beating
  the benchmark.

## Risk-free rate policy

One static, documented assumption: **4.5%/yr (3-month T-bill proxy)** —
`RISK_FREE_ANNUAL` in `src/lib/metrics/performance.ts`. It applies identically to
Sharpe, Sortino (as the MAR), and alpha/beta excess returns. It is never silent:
the registry, this document, and in-app Methodology notes state it. Update the
one constant to move every metric. (A live rate feed is a possible future
upgrade; none of the current providers supplies one on our plan.)

## Benchmark policy

- Every fund maps to a category benchmark: **SPY** (equity), **AGG** (fixed
  income), **VXUS** (international), assigned by the classification pipeline.
- Alpha/beta labels state the benchmark ("Alpha 3Y vs SPY").
- If benchmark overlap is < 24 aligned months → alpha/beta/capture are
  **Unavailable**. Benchmarks are never silently swapped.
- Limitation (documented): this is a category proxy, not each fund's
  prospectus benchmark — a known, labeled source of difference vs Morningstar.

## Missing / insufficient data

Never invented. A metric is **Unavailable ("—")** when: insufficient fund history
for the labeled window (< 90% span), < 24 aligned fund/benchmark months,
missing adjusted series, or the metric is unsupported for the asset class
(bond duration/maturity/credit quality have no source and are not displayed).
Zero is only shown when the computed value is zero.

## Why ALCA may differ from Morningstar / FMP

1. **Benchmark**: ALCA uses category proxies (SPY/AGG/VXUS); Morningstar uses
   per-category or prospectus benchmarks.
2. **Period ends**: ALCA windows end at the latest fetched trading day;
   Morningstar figures are month-end as-of dates.
3. **Adjusted-close vs NAV**: for mutual funds, providers' adjusted close
   reconstruction can differ slightly from official NAV total-return series.
4. **Risk-free**: ALCA uses a static 4.5% proxy; others use a rolling T-bill series.
5. **Regression detail**: alpha here is Jensen's alpha from geometric annualized
   returns; some systems report the annualized monthly regression intercept —
   close, not identical.
6. **Rounding/data vendor revisions.**

Where a provider's exact methodology is not publicly reproducible from data we
hold, ALCA does **not** fake a match — it uses this documented method consistently.

## On fund-universe size

More funds improve **peer/category comparisons** (percentiles, composite scores,
leaderboards). They do **not** change single-fund return, alpha, beta, Sharpe,
Sortino, volatility, or drawdown accuracy — those depend only on the fund's and
benchmark's own series and the formulas above.
