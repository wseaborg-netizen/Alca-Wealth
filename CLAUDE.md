@AGENTS.md

# Alca Wealth — fund research + advisor platform

Fund analytics + portfolio construction platform for financial advisors.
Next.js 16 (App Router, Turbopack), React 19, TypeScript. Deployed at
**alcawealth.vercel.app**.

## Data sources
- **Fund reference/identity** (name, issuer, ETF/MF): **FMP** (`FMP_API_KEY`) — used
  by the offline fund pipeline and by runtime `/api/funds` requests.
- **Fund price history / KPIs** (returns/Sharpe/history): **FMP** primary, **Tiingo**
  fallback (`TIINGO_API_KEY`, prod only) for funds FMP doesn't cover.
- **Expense ratios**: static `src/data/fund-meta.json` (FMP Starter doesn't expose ER).
- **Market indices + news** (dashboard): Yahoo Finance (scrape, no key), FRED for macro.
- Never print or hardcode `FMP_API_KEY` / `TIINGO_API_KEY`. Scripts read env → `.env.local`.

## Fund-universe pipeline
The website's fund list is generated offline, never fetched at runtime in bulk.

```
data/input/fund-tickers.txt
  → npm run funds:import   (FMP) → data/generated/fund-reference-data.json  (+ fund-import-failures.json)
  → npm run funds:classify        → data/generated/fund-universe.json       (+ fund-review-queue.json)
                                    reads data/config/fund-taxonomy.json + fund-classification-overrides.json
```

- `npm run funds:build` = import then classify.
- `npm run funds:validate` = structure, dup tickers, taxonomy validity, all-verified, empty review, empty failures.
- **`data/generated/fund-universe.json` is the ONLY fund-universe source the website reads**,
  via `src/lib/universe.ts` (verified funds only). Do not import fund lists anywhere else.
- `src/lib/universe.ts` maps the precise `primary_category` onto the legacy category vocabulary
  the screener/portfolio sleeves match on (compat shim — don't change portfolio logic).

## Key files
- `src/app/page.tsx` — lock screen / splash. `SHOW_TOOL_DIRECTLY = true` bypasses login (demo mode).
- `src/components/AppShell.tsx` — app shell + nav + tab routing.
- `src/lib/universe.ts` — the single fund-universe loader (verified-only).
- `src/lib/funds.ts` — per-fund record (KPIs + metadata) via FMP/Tiingo + `fund-meta.json`.
- `src/lib/fmp.ts` — FMP/Tiingo provider layer.
- `src/lib/portfolioModel.ts` — allocation + asset-location engine.
- `src/lib/kpi.ts` — scoring. `src/app/api/portfolio/select` — per-sleeve fund selection.
- `scripts/paths.mjs` — centralized data paths for the pipeline scripts.

## Guardrails
- Project is in an **iCloud-synced folder** → Turbopack `.next` corrupts easily and iCloud
  spawns `" 2.ts"` duplicate files. **NEVER `rm -rf .next` while `next dev` runs.** If dev
  gets stuck, stop the server, `rm -rf .next`, restart.

## Deploy
From the project root: `npx vercel --prod` (aliases to alcawealth.vercel.app).
If the live site lags: hard-refresh (Cmd+Shift+R) / incognito; confirm the CLI printed a Production URL.
