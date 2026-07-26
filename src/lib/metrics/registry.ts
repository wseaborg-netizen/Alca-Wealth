/**
 * Metric registry — the single source of truth for what every advisor-facing
 * number in ALCA means: where it comes from, how it's calculated, its unit and
 * period, and what happens when it can't be produced.
 *
 * Rules this registry encodes (and tests enforce):
 *  - Nothing advisor-facing is random, hardcoded, or invented.
 *  - Missing data renders as "—" (unavailable) — never zero, never substituted.
 *  - Historical metrics are labeled with their period; assumption-driven
 *    numbers (Model paths) are labeled illustrative.
 *  - Returns computed from adjusted prices are net of fund expenses; the
 *    expense ratio is displayed as a fact and never subtracted a second time.
 */

export type MetricSource =
  | "provider"        // supplied directly by Tiingo/SEC
  | "calculated"      // computed by ALCA from provider price/dividend history
  | "static"          // manually maintained classification/reference data
  | "assumption"      // user/model input — illustrative, not a measurement
  | "unavailable";    // no defensible source exists yet — never shown as real

export type MetricBasis = "historical" | "current" | "assumption";

export interface MetricDef {
  key: string;
  label: string;               // exact display label (with period where applicable)
  definition: string;
  source: MetricSource;
  unit: "%" | "$" | "ratio" | "count" | "date" | "text";
  basis: MetricBasis;
  inputs: string[];            // required inputs
  calc: string;                // calculation notes / formula
  whenMissing: string;         // unavailable behavior
}

/** The dash every surface renders for a missing value. */
export const UNAVAILABLE = "—";

/** Assumed annual risk-free rate used by Sharpe/Sortino/alpha (3-month T-bill
    proxy; maintained manually in src/lib/kpi.ts). */
export const RISK_FREE_ASSUMPTION = "4.5%/yr (3-month T-bill proxy, static)";

export const METRICS: MetricDef[] = [
  {
    key: "return1y", label: "1Y Return", basis: "historical", source: "calculated", unit: "%",
    definition: "Trailing 1-year annualized total return computed from adjusted prices (net of fund expenses).",
    inputs: ["≥ ~0.9y of adjusted daily price history"],
    calc: "CAGR over the actual window; null when the real span is < 90% of the labeled period.",
    whenMissing: "Show — (insufficient history).",
  },
  {
    key: "return3y", label: "3Y Return (annualized)", basis: "historical", source: "calculated", unit: "%",
    definition: "Trailing 3-year annualized total return from adjusted prices.",
    inputs: ["≥ ~2.7y adjusted daily price history"],
    calc: "CAGR (end/start)^(1/3) − 1. Span-guarded so young funds never get a mislabeled figure.",
    whenMissing: "Show — (insufficient history).",
  },
  {
    key: "return5y", label: "5Y Return (annualized)", basis: "historical", source: "calculated", unit: "%",
    definition: "Trailing 5-year annualized total return from adjusted prices.",
    inputs: ["≥ ~4.5y adjusted daily price history"],
    calc: "CAGR over 5y, span-guarded.",
    whenMissing: "Show — (insufficient history).",
  },
  {
    key: "stdDev3y", label: "Std Dev 3Y (annualized)", basis: "historical", source: "calculated", unit: "%",
    definition: "Annualized standard deviation of monthly total returns over 3 years.",
    inputs: ["≥ 24 aligned monthly returns"],
    calc: "Sample std dev of monthly returns × √12.",
    whenMissing: "Show —.",
  },
  {
    key: "maxDrawdown", label: "Max Drawdown (3Y / 5Y)", basis: "historical", source: "calculated", unit: "%",
    definition: "Largest peak-to-trough decline in the labeled window, from the daily adjusted price series.",
    inputs: ["daily price history covering ~the full labeled window"],
    calc: "min((price − running peak) / running peak); span-guarded.",
    whenMissing: "Show —.",
  },
  {
    key: "sharpe3y", label: "Sharpe 3Y", basis: "historical", source: "calculated", unit: "ratio",
    definition: `(geometric annualized 3y return − risk-free) / annualized 3y std dev. Risk-free assumption: ${RISK_FREE_ASSUMPTION}.`,
    inputs: ["≥ 24 monthly returns"],
    calc: "Monthly-return based, geometric annualization (src/lib/metrics/performance.ts).",
    whenMissing: "Show —.",
  },
  {
    key: "sortino3y", label: "Sortino 3Y", basis: "historical", source: "calculated", unit: "ratio",
    definition: `Like Sharpe but using downside deviation below the monthly risk-free rate. Risk-free: ${RISK_FREE_ASSUMPTION}.`,
    inputs: ["≥ 24 monthly returns with ≥ 2 below-target months"],
    calc: "(ann return − rf) / annualized downside deviation.",
    whenMissing: "Show —.",
  },
  {
    key: "beta3y", label: "Beta 3Y", basis: "historical", source: "calculated", unit: "ratio",
    definition: "Sensitivity to the fund's mapped benchmark (SPY/AGG/VXUS) over 3 years of monthly returns.",
    inputs: ["24+ aligned fund & benchmark monthly returns"],
    calc: "cov(fund, bench) / var(bench).",
    whenMissing: "Show —.",
  },
  {
    key: "alpha3y", label: "Alpha 3Y (annualized)", basis: "historical", source: "calculated", unit: "%",
    definition: `Annualized Jensen's alpha vs the fund's mapped benchmark over 3 years (label states the benchmark). Risk-free: ${RISK_FREE_ASSUMPTION}.`,
    inputs: ["beta3y", "geometric annualized fund & benchmark returns from the aligned window"],
    calc: "annReturn − (rf + β·(annBench − rf)); β from monthly excess-return covariance (src/lib/metrics/performance.ts).",
    whenMissing: "Show —.",
  },
  {
    key: "expenseRatio", label: "Expense Ratio", basis: "current", source: "static", unit: "%",
    definition: "Published net expense ratio from ALCA's maintained reference file (the market-data provider does not expose ER).",
    inputs: ["data/fund-meta.json entry"],
    calc: "None — static reference value; reviewed manually. Never subtracted from adjusted-price historical returns (those are already net of expenses).",
    whenMissing: "Show —.",
  },
  {
    key: "weightedExpense", label: "Weighted Expense Ratio", basis: "current", source: "calculated", unit: "%",
    definition: "Holdings-weighted average of published expense ratios.",
    inputs: ["holdings with weights ≈ 100%", "per-fund expense ratios"],
    calc: "Σ(weightᵢ × ERᵢ) / Σweightᵢ; only computed when weights validate.",
    whenMissing: "Show — and a validation warning when weights don't total ~100%.",
  },
  {
    key: "ttmYield", label: "TTM Yield", basis: "historical", source: "calculated", unit: "%",
    definition: "Trailing-12-month distribution yield from the provider dividend stream, winsorized to damp year-end capital-gains distributions that the provider folds into the dividend series.",
    inputs: ["12m dividend records", "current price"],
    calc: "Σ(clamped TTM payments)/price; outliers > 2.5× median AND > 2% of price clamp to the median; capped at 15%. Documented limitation: funds distributing cap gains every period may still read high.",
    whenMissing: "Show —.",
  },
  {
    key: "stressWindows", label: "Historical stress windows", basis: "historical", source: "calculated", unit: "%",
    definition: "Actual total return over fixed named historical windows (GFC, COVID crash, 2022, 2018 Q4) for fund and benchmark.",
    inputs: ["price history covering the window"],
    calc: "end/start − 1 over the fixed dates; null when the fund didn't exist yet.",
    whenMissing: "Show — for windows before the fund's inception.",
  },
  {
    key: "classification", label: "Category / Style Box / Asset Class", basis: "current", source: "static", unit: "text",
    definition: "ALCA's controlled-taxonomy classification, produced by the offline fund pipeline with manual verification for ambiguous funds.",
    inputs: ["data/generated/fund-universe.json (verified funds only)"],
    calc: "Deterministic rules + manual overrides; every value validated against the locked taxonomy.",
    whenMissing: "Fund is excluded from the universe until verified.",
  },
  {
    key: "marketIndices", label: "Market indices (Advisor Overview)", basis: "current", source: "provider", unit: "%",
    definition: "Index/ETF proxy quotes and day moves from Tiingo (ETF proxies) at request time (short server cache).",
    inputs: ["Tiingo daily prices"],
    calc: "Provider-supplied; ALCA displays as delivered.",
    whenMissing: "Strip shows a loading/blank state — no cached fake quotes.",
  },
  {
    key: "modelPaths", label: "Downside / Base / Upside Path", basis: "assumption", source: "assumption", unit: "$",
    definition: "Deterministic monthly-compounded projection under three explicit, editable annual-return assumptions (net of fund expenses). Illustrative — not a forecast, probability band, or guarantee.",
    inputs: ["user/derived return assumptions", "cash flows", "horizon", "inflation"],
    calc: "src/lib/model.ts projectPaths(); volatility is context only and never adjusts a path.",
    whenMissing: "Projection pauses with explicit validation errors instead of running on bad inputs.",
  },
  {
    key: "taxEfficiency", label: "Tax Efficiency (A–D)", basis: "current", source: "calculated", unit: "text",
    definition: "ALCA-calculated heuristic grade from category, vehicle, expense ratio, and TTM yield — an estimate for account-location discussion, not a measured tax figure.",
    inputs: ["category", "vehicle", "expenseRatio", "ttmYield"],
    calc: "src/lib/tax.ts heuristic scoring; reasons surfaced with the grade.",
    whenMissing: "Grade omitted when inputs are missing.",
  },
  {
    key: "alcaScore", label: "Composite / Fit scores", basis: "historical", source: "calculated", unit: "count",
    definition: "Category-relative percentile composites over measured KPIs (cost, risk-adjusted return, downside, alpha, consistency, yield). A ranking aid — not a rating of future performance.",
    inputs: ["peer KPI pool within the fund's category"],
    calc: "Percentile ranks combined with fixed weights (src/lib/kpi.ts computePercentiles / screen route).",
    whenMissing: "Neutral 50th-percentile profile only when no peer pool exists; peer count shown.",
  },
  // ── Explicitly unavailable — no provider on the current stack ──
  {
    key: "duration", label: "Bond Duration", basis: "current", source: "unavailable", unit: "ratio",
    definition: "Not supplied by Tiingo. ALCA does not estimate or fake it.",
    inputs: [], calc: "None.", whenMissing: "Metric is not displayed anywhere.",
  },
  {
    key: "maturity", label: "Maturity / Credit Quality", basis: "current", source: "unavailable", unit: "text",
    definition: "Not supplied by the current providers. Not displayed.",
    inputs: [], calc: "None.", whenMissing: "Metric is not displayed anywhere.",
  },
  {
    key: "aum", label: "AUM / Net Assets", basis: "current", source: "provider", unit: "$",
    definition: "Provider-supplied net assets where available.",
    inputs: ["Tiingo metadata"], calc: "Displayed as delivered, formatted.",
    whenMissing: "Show —.",
  },
];

export const metricByKey = (key: string) => METRICS.find((m) => m.key === key);

/** Format helper honoring the unavailable convention: missing → "—",
    real zero renders as zero. */
export function fmtMetric(v: number | null | undefined, unit: "%" | "ratio", digits = 2): string {
  if (v == null || Number.isNaN(v)) return UNAVAILABLE;
  return unit === "%" ? `${v.toFixed(digits)}%` : v.toFixed(digits);
}
