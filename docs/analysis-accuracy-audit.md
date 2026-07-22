# Analysis Accuracy Audit — ALCA Wealth

**Date:** 2026-07-17 · **Scope:** every advisor-facing financial number in the app.
**Companion code:** `src/lib/metrics/registry.ts` (machine-readable metric definitions),
`src/__tests__/metrics.test.ts` + `security.test.ts` (enforcement).

## Method

1. Full-source scan for `Math.random`, placeholder/mock/demo values, and hardcoded
   metric literals in rendered components.
2. Trace of every displayed metric to its producing file/route and data source.
3. Formula review of the KPI engine (`src/lib/kpi.ts`) and Model engine (`src/lib/model.ts`).
4. Label review (period, unit, weighted, historical vs assumption).

**Baseline finding:** no `Math.random()` financial metrics existed anywhere, and no
placeholder Sharpe/alpha/beta/yield values were found in rendered components. The
issues found were subtler: annualization over short histories, silent fallback
substitution for missing volatility/ER, and a few labels missing their period.

## Data-source map

| Source | What it supplies | Where |
|---|---|---|
| FMP (primary) | adjusted price history, dividends, profile/AUM, market quotes | `src/lib/fmp.ts`, `/api/market`, `/api/compare`, `/api/funds` |
| Tiingo (fallback, prod) | price history when FMP lacks coverage | `src/lib/fmp.ts` |
| SEC/EDGAR | filings data (separate feature, untouched) | `src/lib/sec*.ts` |
| Static reference | expense ratios (`data/fund-meta.json`), classifications (`data/generated/fund-universe.json`) | offline pipeline, manually verified |
| ALCA calculation | all KPIs, weighted portfolio stats, tax heuristic, composite scores | `src/lib/kpi.ts`, `tax.ts`, screen/compare routes |
| User assumption | Model Downside/Base/Upside paths, inflation, cash flows | `src/lib/model.ts` |

## Metric audit table

| Metric | Location | Source | Calculation | Status | Fix applied | Remaining limitation |
|---|---|---|---|---|---|---|
| 1Y/3Y/5Y annualized return | Analysis, Compare, Watchlist, Screen, Portfolios, Model | calculated | CAGR on adjusted prices (net of expenses) | **fixed → reliable** | Span guard: stat is null unless ≥90% of the labeled window exists (was: annualized over the wrong denominator for young funds) | Return "as-of" is fetch time; cached ≤ provider cache TTL |
| Std Dev 3Y | Analysis, Compare, Screen | calculated | sample σ of monthly returns × √12, ≥24 aligned months | reliable | — | Monthly sampling (industry-standard) |
| Max drawdown 3Y/5Y | Analysis, Compare, Portfolios, Model | calculated | running peak-to-trough on daily series | **fixed → reliable** | Same span guard (a 2y-old fund no longer shows a "5y" drawdown) | — |
| Sharpe 3Y / Sortino 3Y | Analysis, Compare, Screen | calculated | (ann ret − rf)/σ; rf = static 4.5% T-bill proxy | reliable | Registry documents the rf assumption; Watchlist header now says "Sharpe 3Y" | rf is static — update `RISK_FREE_ANNUAL` periodically |
| Alpha/Beta 3Y | Analysis, Compare, Portfolios | calculated | CAPM vs mapped benchmark (SPY/AGG/VXUS), monthly, 3y | reliable | — | Benchmark is the category-mapped proxy, not prospectus benchmark |
| Info ratio, capture, batting avg, Calmar | Analysis, Compare | calculated | standard formulas over aligned 3y monthlies | reliable | — | — |
| Expense ratio | everywhere | static | manually maintained `fund-meta.json` (FMP Starter has no ER) | reliable (static) | Registry marks it static; never double-counted vs net-of-expense returns (Model engine v2 + tests) | Manual upkeep required when funds reprice |
| Weighted expense ratio / weighted portfolio stats | Portfolios, Model | calculated | Σ(wᵢ·xᵢ)/Σwᵢ, labeled "Weighted" | **fixed → reliable** | Missing per-fund vol/ER no longer silently replaced with invented 10%/0.1% — each stat averages only holdings that have it; null → "—" | Weighted vol ignores correlations (stated in Methodology) |
| TTM yield | Analysis, Compare, Watchlist, Portfolios | calculated | winsorized TTM distributions / price, capped 15% | reliable | Watchlist header now says "TTM Yield" | Funds distributing cap gains every period may still read high (documented in code) |
| Dividend growth 3Y | Analysis | calculated | full-calendar-year totals CAGR | reliable | — | — |
| Historical stress windows (GFC/COVID/2022/2018) | Analysis, Compare | calculated | actual return over fixed dates | reliable | — | Null (—) when fund predates window |
| Model Downside/Base/Upside | Model | assumption | deterministic monthly compounding on explicit editable assumptions | reliable (labeled illustrative) | v2 engine already removed return±volatility paths and the ER double-count; tests enforce both | — |
| Stress-test impact (Model) | Model | assumption | explicit assumption changes vs base | reliable (labeled) | — | — |
| Category/style box/asset class | Research, Screen | static | offline pipeline + manual verification, locked taxonomy | reliable | — | Reclassify when a fund's mandate changes |
| Composite/fit scores | Screen, Compare | calculated | category-relative percentiles, fixed weights | reliable (ranking aid) | Registry documents it is not a rating of future performance | Peer pool depends on warm cache breadth |
| Tax efficiency A–D | Compare | calculated (heuristic) | category/vehicle/ER/yield heuristic with stated reasons | reliable (labeled estimate) | Registry entry documents heuristic nature | Not a measured after-tax figure |
| Market indices strip | Advisor Overview | provider | FMP quotes at request time | reliable | — | Short server cache; shows loading state, never stale fakes |
| AUM / inception | Analysis | provider | FMP profile | reliable | — | — |
| Bond duration / maturity / credit quality | — | unavailable | not supplied by current providers | **not displayed** | Registry pins them `unavailable` so they can't be added casually | Needs a data source before ever showing |
| Homepage showcase numbers | public homepage | demo | animated marketing mock | **fixed** | Explicit note added: "Animated product preview with illustrative sample values…" | — |
| "Expected return" wording | Portfolios risk description | prose | — | **fixed** | Re-worded to "potential return" (the only "expected return" in the app) | — |

## Removed

- `src/components/AdvisorTab.tsx`, `src/components/PortfolioTab.tsx`, `src/components/tokens.ts.bak` —
  dead, unreferenced components containing legacy metric displays. Deleted so they can
  never be re-wired by accident.

## Unavailable-value convention

Missing metric → **"—"** (em dash), produced by shared formatters (`pct`/`num`/`pctv`/
`fmtMetric`). Never zero, never a substituted metric. Methodology sections and the
registry explain why a value can be missing (insufficient history, provider gap).

## Enforcement (tests)

- `metrics.test.ts`: CAGR span-guard, volatility annualization, max drawdown, weighted
  ER with missing data → null, weight validation, no ER double-count, unavailable
  formatting, registry integrity (every metric declares source/unit/missing behavior).
- Static scan: fails the build if rendered components gain `Math.random` metrics,
  a bare "expected return" label outside Model assumptions, or service-role keys
  client-side (`security.test.ts`).

## Known limitations (documented, not hidden)

1. Risk-free rate is a static 4.5% proxy — revisit quarterly.
2. Expense ratios are manually maintained (no provider field on the current plan).
3. Alpha/beta use ALCA's mapped benchmark proxy, not each fund's prospectus benchmark.
4. Weighted portfolio volatility ignores cross-holding correlations (stated in UI).
5. TTM yield winsorization can still overstate funds that distribute capital gains
   every period.
6. 56 tickers were dropped from the universe because FMP has no data for them —
   nothing is shown rather than something invented.
