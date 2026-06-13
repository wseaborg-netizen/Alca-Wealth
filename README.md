# FUNDGRID

Internal fund screening and comparison tool for wealth management research staff.
Screens mutual funds and ETFs, computes standardized risk/return KPIs from price history,
ranks candidates by composite score, and compares up to 4 funds side by side.

**No AI calls. No per-use cost. All KPIs computed locally from NAV/price history.**

## Setup

### 1. Get a free FMP API key

Sign up at financialmodelingprep.com — free tier gives 250 calls/day.

### 2. Configure environment

Edit `.env.local`:

```
FMP_API_KEY=your_key_here
APP_PASSWORD=your_password_here   # optional — leave blank to skip auth in dev
```

### 3. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

### 4. Deploy to Vercel

```bash
vercel deploy
```

Set `FMP_API_KEY` and `APP_PASSWORD` in Vercel project settings → Environment Variables.

## Usage

### Screen tab

1. Set filters in the **Factor Builder** — asset class, market cap, style, vehicle, max expense ratio, track record
2. Toggle **Priority chips** to weight the composite score (Downside protection, Low cost, Sharpe, Alpha, Consistency)
3. Click **Run screen** — fetches up to 40 matching funds, computes KPIs, ranks by composite score
4. Click **+ Add to comparison** to push any fund to the Compare tab

### Compare tab

Enter up to 4 tickers manually or add them from Screen. Click **Compare** to see:
radar chart, Sharpe bar chart, full KPI table, percentile bars.

## KPI formulas

All risk stats use a **3-year trailing window**; return CAGRs use 5/3/1-year windows.
Monthly returns derived from last-trading-day-of-month adjusted closes.
Risk-free rate: **4.5% annualized** (edit `RISK_FREE_ANNUAL` in `src/lib/kpi.ts`).

| KPI | Formula |
|-----|---------|
| CAGR (1/3/5y) | `(endPrice/startPrice)^(1/years) − 1` |
| Std dev (3y ann.) | `stddev(monthly returns) × √12` |
| Sharpe (3y) | `(ann. fund return − risk-free) / ann. std dev` |
| Beta (3y) | `cov(fund, bench monthly returns) / var(bench)` |
| Alpha (3y ann.) | `fund_ann − [rf + β × (bench_ann − rf)]` |
| Upside capture (3y) | `mean(fund return in bench-up months) / mean(bench up-month return) × 100` |
| Downside capture (3y) | same for benchmark-down months |
| Max drawdown (5y) | largest peak-to-trough decline in adjusted NAV |

## Architecture

```
src/
  app/
    page.tsx           — entry point + password gate
    api/
      auth/            — env-var password check
      funds/[ticker]/  — fetch + cache single fund
      screen/          — filter universe + compute scores
      compare/         — compare up to 4 tickers
      universe/        — serve fund universe list
  lib/
    fmp.ts             — FMP API client (swap to change provider)
    cache.ts           — SQLite disk cache (24h TTL)
    kpi.ts             — KPI engine + percentile scoring
    funds.ts           — fund data service
  components/
    FundGrid.tsx       — shell + tab navigation
    ScreenTab.tsx      — factor builder + ranked results
    CompareTab.tsx     — side-by-side comparison
    ui.tsx             — shared UI primitives
    tokens.ts          — design tokens

data/
  universe.json        — ~200 fund seed list (edit to add/remove)

.cache/
  fundgrid.db          — SQLite cache (gitignored, auto-created)
```

## Swapping the data provider

All FMP-specific code lives in `src/lib/fmp.ts`. Implement the same exported functions
(`fetchProfile`, `fetchEtfInfo`, `fetchMutualFundInfo`, `fetchHistory`) and nothing else changes.

## Adding funds

Edit `data/universe.json`:

```json
{ "ticker": "SCHD", "name": "Schwab US Dividend Equity ETF", "category": "US Equity Large Value", "vehicle": "ETF", "benchmark": "SPY" }
```

Benchmarks: `SPY` (US equity), `AGG` (fixed income), `VXUS` (international).

## Tests

```bash
npm test
```

---

*Internal research aid. KPIs computed from public market data — verify against fund factsheets before client use. Not investment advice.*
