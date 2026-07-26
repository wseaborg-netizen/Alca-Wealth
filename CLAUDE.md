@AGENTS.md

# Alca Wealth — fund research + advisor platform

Fund analytics + portfolio construction platform for financial advisors.
Next.js 16 (App Router, Turbopack), React 19, TypeScript. Deployed at
**alcawealth.vercel.app**.

## Data sources
- **Market data** (price/NAV history, adjusted prices, distributions, dashboard
  quotes): **Tiingo** (`TIINGO_API_KEY`, server-only) — the sole provider. ETFs use
  adjusted price history; mutual funds use NAV history; dashboard indices use
  clearly-labeled ETF proxies (SPY/DIA/QQQ), never native index names.
- **Fund identity / classification** (name, vehicle, category, benchmark): the
  canonical merged universe (`data/generated/fund-universe.json` + verified
  `dynamic_funds`). Security type is never guessed from Tiingo metadata or ticker shape.
- **Expense ratios**: static `src/data/fund-meta.json` (a verified source Tiingo does not expose).
- **AUM / inception**: **Unavailable** (Tiingo supplies neither; never fabricated). Tiingo
  `startDate` is a *coverage start date*, never inception.
- Canonical provider layer: `src/lib/market-data/` (`tiingo/` adapter, `fundService`,
  `marketQuote`, `fundSupport`). Server-only; the token never reaches the browser.
- Never print or hardcode `TIINGO_API_KEY`. Read from env → `.env.local`.

## Fund-universe pipeline
The website's fund list is generated offline, never fetched at runtime in bulk.

```
data/input/fund-tickers.txt  +  data/generated/fund-reference-data.json (identity)
  → npm run funds:classify        → data/generated/fund-universe.json       (+ fund-review-queue.json)
                                    reads data/config/fund-taxonomy.json + fund-classification-overrides.json
```

- New funds are added at runtime via **Expansion** (Tiingo coverage check + human
  classification review for unknown vehicles) — not a bulk import script.
- `npm run funds:validate` = structure, dup tickers, taxonomy validity, all-verified, empty review, empty failures.
- **`data/generated/fund-universe.json` is the ONLY fund-universe source the website reads**,
  via `src/lib/universe.ts` (verified funds only). Do not import fund lists anywhere else.
- `src/lib/universe.ts` maps the precise `primary_category` onto the legacy category vocabulary
  the screener/portfolio sleeves match on (compat shim — don't change portfolio logic).

## Key files
- `src/app/page.tsx` — lock screen / splash. `SHOW_TOOL_DIRECTLY = true` bypasses login (demo mode).
- `src/components/AppShell.tsx` — app shell + nav + tab routing.
- `src/lib/universe.ts` — the single fund-universe loader (verified-only).
- `src/lib/market-data/fundService.ts` — per-fund record (KPIs + metadata) via Tiingo + `fund-meta.json`.
- `src/lib/market-data/` — canonical Tiingo provider layer (adapter + normalized types + quote/support services).
- `src/lib/portfolioModel.ts` — allocation + asset-location engine.
- `src/lib/kpi.ts` — KPI engine. `src/lib/metrics/score.ts` — THE Advisor Review Score
  (contextual, peer-relative; screener/analysis/portfolio-select all use it via
  `src/lib/metrics/recordScore.ts`). `src/app/api/portfolio/select` — per-sleeve fund selection.
- Saved fund lists: firm-scoped `watchlists`/`watchlist_items` tables, `/api/lists`,
  `src/components/SaveToList.tsx` + `ListsTab.tsx` (defaults: Commonly Used Funds, Watchlist).
- `scripts/paths.mjs` — centralized data paths for the pipeline scripts.

## Guardrails
- Project is in an **iCloud-synced folder** → Turbopack `.next` corrupts easily and iCloud
  spawns `" 2.ts"` duplicate files. **NEVER `rm -rf .next` while `next dev` runs.** If dev
  gets stuck, stop the server, `rm -rf .next`, restart.

## Deploy
From the project root: `npx vercel --prod` (aliases to alcawealth.vercel.app).
If the live site lags: hard-refresh (Cmd+Shift+R) / incognito; confirm the CLI printed a Production URL.
