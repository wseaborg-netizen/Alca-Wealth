# Category Benchmarking & Analysis Periods — Methodology

**Code:** `src/lib/metrics/peers.ts` (peer groups + rank math), `src/lib/metrics/periods.ts`
(period vocabulary + Overall blend), per-period stats in `src/lib/kpi.ts` (`KpiResult.periods`),
rank attachment in `/api/funds/[ticker]`. Extends — does not replace — the central
methodology system (`performance.ts`, `registry.ts`, `docs/performance-metric-methodology.md`).

## Category source

Peer groups come from ALCA's controlled taxonomy: a fund's **verified
`primary_category`** (e.g. "US Large Blend"), produced by the offline
classification pipeline with manual overrides for ambiguous funds. This single
field already encodes asset class, region, market cap, and style, so grouping
by it guarantees same-type comparisons. (Duration/credit-quality fields do not
exist in the current taxonomy — bond funds group by their bond
`primary_category`, e.g. "Intermediate Core Bond".)

## Peer grouping rules

- Peers = all verified universe funds sharing the exact `primary_category`.
- Catch-all categories ("Other", "Alternative") are **not** peer groups.
- Unknown/unclassified fund → **no peer rank at all**.
- There is **no fallback to full-universe ranking**, ever.
- A rank requires ≥ **5** funds (including the subject fund) with data for the
  ranked metric and period; otherwise Unavailable.

## Periods

| Period | Window | Risk-stat frequency |
|---|---|---|
| 1Y | trailing 1 year | daily returns, √252 (12 monthly points can't support statistics — documented exception) |
| 3Y / 5Y / 10Y | trailing N years | month-end returns, √12 (Morningstar convention) |
| Overall | blended | see below |

Every stat in every period is independently guarded: the window must cover
≥ 90% of the labeled period, and statistical metrics need their minimum
observation count. Periods are never silently mixed — period-fixed stats
(capture ratios, batting average) carry their own explicit "3Y" labels.

## Overall

Overall is a **documented blended view**, not a measurement:

- Weights: 1Y 10% · 3Y 25% · 5Y 30% · 10Y 35%.
- Missing periods are dropped and remaining weights renormalized.
- Requires at least the 3Y value — a fund with only 1Y of history gets **no**
  confident Overall figure.
- Overall values are marked with an asterisk and explained in-UI.
- Category rank is not computed for Overall (ranks are per real period).

## Category rank

- Ranked metric: **annualized return** for the selected period (one
  transparent metric; rank 1 = highest). The UI states the metric.
- Peer values come from cached peer fund records (warm cache + a small
  cold-fetch budget per request). Peers without data for the period are
  excluded — never estimated.
- Display: "Ranked 12 of 84 US Large Blend funds over 3Y (by annualized
  return)" — count = peers **with data**, which may be fewer than the category.
- Nothing here is a recommendation; language is limited to peer comparison /
  category rank.

## Unavailable behavior

Rank or stat is Unavailable ("—") when: no verified peer group; fewer than 5
peers with data; insufficient fund history for the period; insufficient
benchmark overlap. Reasons are shown where practical (e.g. "no verified peer
group for this fund").

## Unified Contextual Advisor Review Score (2B → 2C)

**One score system across ALCA.** The old fund-page letter grade ("Overall
rating" A–E + "Is it worth it?") and the old screener `compositeScore` were
**removed in 2C** — the Advisor Review Score is now the single source of
truth for Fund Analysis, the Screener, Similar Funds, and (via the exported
helpers) future Portfolio Builder sleeve selection.

### Contexts

The score is not one fixed number: it answers "strong for what?" via a
scoring-context selector next to the period selector. Component weights per
context (rows sum to 1):

| Component | Overall | Growth | Income | Low Cost/Core | Risk-Adj | Downside | Tax | Long-Term |
|---|---|---|---|---|---|---|---|---|
| Performance | .20 | .35 | — | .10 | .10 | .05 | .10 | .10 |
| Risk-adjusted (Sharpe) | .25 | .30 | .10 | .10 | .35 | .20 | .10 | .25 |
| Downside (max DD) | .20 | .10 | .20 | .15 | .20 | .35 | .10 | .20 |
| Volatility | .10 | .05 | .15 | .15 | .15 | .20 | .10 | — |
| Cost (ER) | .15 | .10 | .15 | .35 | .10 | .10 | .25 | .10 |
| Yield (TTM) | — | — | .30 | — | — | — | — | — |
| Tax efficiency (heuristic) | — | — | — | — | — | — | .35 | — |
| Track record (fund age) | — | — | — | .15 | — | — | — | .20 |
| Consistency (3Y batting) | .10 | .10 | .10 | — | .10 | .10 | — | .15 |

Every component is a same-category peer percentile (ties count half,
deterministic; ≥5 funds with data required). Missing components are
**excluded and reweighted — never zeroed**; fewer than 3 valid components →
Unavailable with the missing list. Yield/tax components use the winsorized
TTM yield and the documented tax heuristic; where unreliable they simply drop
out — never faked.

### Display rules

- **No perfect scores in UI**: displayed score = min(internal, 99)
  (`displayScore`). Internal ordering is unaffected.
- Bands: 85+ Strong · 70–84 Above-average · 50–69 Mixed/average · 30–49 Weak
  · <30 Very weak (all "peer-relative profile").
- Overall period = the 2A blend of per-period scores (10/25/30/35,
  renormalized; refuses 1Y-only; "Limited history" note).

### Screener integration

`/api/screen` ranks with the same engine (`rankFundsForContext`): each fund is
scored against its own category group **within the filtered set** for the
selected period + context (priorities map to contexts: Low cost → Low
Cost/Core Index, Income/yield → Income, Downside protection → Downside
Protection, Sharpe/Alpha → Risk-Adjusted). Groups thinner than 5 get no score
and sort last with the reason shown. The factor radar keeps component
percentiles — detail, not a second score.

### Similar Funds integration

Alternatives use the same peer group, period, AND context; ordering by
context score, rationale emphasis follows the context (Low Cost leads with
expense, Downside leads with drawdown). Nothing surfaces without a reason.

### Portfolio Builder (future) integration point

`scoreFundForContext(inputs, peers, context)`,
`rankFundsForContext(funds, context)`,
`getPeerAlternativesForContext(subject, candidates, period, context)` in
`src/lib/metrics/score.ts` are pure and server/client-agnostic.
**As of 2D this integration is live**: `/api/portfolio/select` scores each
sleeve's candidates with `rankRecords` using `sleeveContext(category, goal)`
(bond sleeves → Downside Protection, or Income under an income goal;
growth categories → Growth; blend/broad/international → Low Cost / Core
Index; dividend/income equity → Income; else Overall Review).
`/api/recommend` maps its profile priorities to a context; `/api/replace`
maps its replacement reason (cost → Low Cost, risk → Downside, yield →
Income, alpha → Risk-Adjusted). The legacy `compositeScore` engine has been
deleted from the codebase. Adapters live in `src/lib/metrics/recordScore.ts`.

### Advisor-safe language

Allowed: advisor review score, peer-relative profile, similar funds to
review, review candidate, watch-outs. Banned (test-enforced): recommendation,
best fund, buy/sell, should invest, guaranteed alpha.

## Advisor Review Score (2B — superseded above, grouping rules still apply)

**Code:** `src/lib/metrics/score.ts` (engine), attached to `/api/funds/[ticker]`
as `peerIntel`. An **internal advisor review aid** — peer comparison language
only; a test fails the suite if recommendation vocabulary ("recommendation",
"best fund", "should invest", buy/sell) appears in score/UI strings.

### Method

1. For the selected period, each component is the fund's **percentile among
   same-category peers** (0–100, ties count half — deterministic):
   - Performance = period annualized return (higher better)
   - Risk-adjusted return = period Sharpe (higher better)
   - Downside risk = period max drawdown (shallower better)
   - Volatility = period annualized σ (lower better)
   - Cost = expense ratio (lower better)
2. Component percentiles combine with **weight profiles** chosen from the
   taxonomy's `management_style` (extensible structure for future asset-class
   formulas):

   | Component | Default | Passive/Index | Active |
   |---|---|---|---|
   | Performance | 25% | 15% | 20% |
   | Risk-adjusted | 30% | 20% | 35% |
   | Downside | 20% | 20% | 20% |
   | Volatility | 10% | 15% | 10% |
   | Cost | 15% | **30%** | 15% |

   Passive damps short-term outperformance and elevates cost; Active elevates
   risk-adjusted return so raw return alone is never rewarded.
3. Missing components are **excluded and the rest reweighted — never zeroed**.
   Fewer than 3 valid components → score Unavailable, with the missing
   components listed. Percentiles require ≥ 5 funds with data.
4. **Bands:** 85–100 Strong · 70–84 Above-average · 50–69 Mixed/average ·
   30–49 Weak · 0–29 Very weak (all "peer-relative profile").
5. **Overall score** = the 2A blend (1Y 10 / 3Y 25 / 5Y 30 / 10Y 35,
   renormalized) applied to the per-period scores; refuses a confident figure
   on 1Y-only history and shows a "Limited history" note when periods are
   missing.

### Similar Funds to Review (peer alternatives)

- Candidates: same verified peer group only; the subject fund and funds
  without period data are excluded. Never the full universe.
- Ordered by advisor review score (ties → lower expense ratio); top 3–5 shown.
- **Every surfaced fund carries an explicit rationale** (stronger score,
  higher Sharpe, lower expense ratio, shallower drawdown) — candidates with no
  articulable advantage are not shown.
- Overall mode ranks by each peer's own Overall score.

## Limitations

1. Peer records currently come from the 3-year-history cache tier, so ranks
   populate mostly for 1Y/3Y until deeper caches warm; 5Y/10Y ranks appear as
   full-history records are cached.
2. Rank coverage grows as the server cache warms — early requests may rank
   against fewer peers than the category holds (the shown count is always the
   truth).
3. Categories with few verified funds (< 5) never show ranks.
4. More funds in the universe improve peer comparisons; they do not change any
   single fund's raw metrics.
