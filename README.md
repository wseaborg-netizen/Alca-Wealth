# Alca Wealth

Fund research and portfolio-construction platform for financial advisors. Screens
mutual funds and ETFs, computes standardized risk/return KPIs from price history,
ranks candidates, compares funds side by side, and builds client portfolios.

KPIs are computed locally from price history (no per-use AI cost). The fund universe
is a curated, classified list generated offline.

## Project overview

- **Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4.
- **Fund identity/reference data:** Financial Modeling Prep (FMP).
- **Price history / KPIs:** FMP primary, Tiingo fallback (production).
- **Deployed at:** alcawealth.vercel.app.

## Folder structure

```
data/
  input/
    fund-tickers.txt                    # hand-maintained ticker list (pipeline input)
  config/
    fund-taxonomy.json                  # controlled classification vocabulary
    fund-classification-overrides.json  # manual, fund-specific classifications
  generated/
    fund-reference-data.json            # FMP import output (intermediate)
    fund-universe.json                  # THE fund universe the website reads (verified funds)
    fund-review-queue.json              # funds needing manual classification
    fund-import-failures.json           # tickers FMP could not resolve

scripts/
  paths.mjs                 # centralized data paths
  import-funds-from-fmp.mjs # funds:import
  classify-funds.mjs        # funds:classify
  validate-funds.mjs        # funds:validate

src/
  app/            # routes + API (funds, screen, compare, universe, portfolio/select, …)
  components/     # AppShell (nav/shell) + tabs + UI
  lib/
    universe.ts   # single fund-universe loader (verified-only) — the app's only fund list
    funds.ts      # per-fund record (KPIs + metadata)
    fmp.ts        # FMP/Tiingo provider layer
    kpi.ts        # KPI engine + scoring
    portfolioModel.ts / portfolioCalc.ts  # allocation + asset location
```

## Fund data flow

```
data/input/fund-tickers.txt
  ── funds:import ──▶  FMP  ──▶  data/generated/fund-reference-data.json  (+ fund-import-failures.json)
  ── funds:classify ─▶  rules + data/config/fund-taxonomy.json + fund-classification-overrides.json
                        ──▶  data/generated/fund-universe.json  (+ fund-review-queue.json)

website ──▶ src/lib/universe.ts ──▶ imports data/generated/fund-universe.json (verified === true only)
```

`data/generated/fund-universe.json` is the **only** fund-universe source the site reads.

## Commands

### Local development
```bash
npm install
npm run dev            # http://localhost:3000
```

### Fund pipeline
```bash
npm run funds:import     # read fund-tickers.txt, call FMP, write fund-reference-data.json (+ failures)
npm run funds:classify   # classify → fund-universe.json (+ review queue)
npm run funds:build      # funds:import then funds:classify
npm run funds:validate   # JSON structure, dup tickers, taxonomy validity, all-verified, 0 review, 0 failed
```

### Production build
```bash
npm run build
```

### Deployment
```bash
npx vercel --prod        # aliases to alcawealth.vercel.app
```
Set `FMP_API_KEY`, `TIINGO_API_KEY`, and `APP_PASSWORD` in Vercel → Environment Variables.

## Environment

```
FMP_API_KEY=...        # required
TIINGO_API_KEY=...     # optional — price-history fallback (production)
APP_PASSWORD=...        # optional — dev auth gate
```
Secrets are read from the environment (then `.env.local`) — never hardcoded.

## Adding / reclassifying funds

1. Add tickers to `data/input/fund-tickers.txt`.
2. `npm run funds:build`.
3. Any fund in `data/generated/fund-review-queue.json` needs either a deterministic rule
   in `scripts/classify-funds.mjs` or an entry in `data/config/fund-classification-overrides.json`.
4. `npm run funds:validate`, then `npm run build`.

## Tests
```bash
npm test
npm run lint
```

---

*Internal research aid. KPIs computed from public market data — verify against fund factsheets before client use. Not investment advice.*
