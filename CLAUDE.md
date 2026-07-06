@AGENTS.md

# Project: "Tool" (aka Alca) - fund research + advisor tool for The Capital Group

Internal fund analytics + portfolio construction tool for advisors. Next.js 16
(App Router, Turbopack), React 19, TypeScript. Deployed at **alcawealth.vercel.app**.

## Data sources (important)
- **Fund data** (returns/Sharpe/expense/history): **Tiingo** primary (`TIINGO_API_KEY`),
  **FMP** fallback (`FMP_API_KEY`). NOTE: `.env.local` has ONLY the FMP key, so LOCAL
  dev uses FMP's weak free tier (many null metrics). **Production (Vercel) has the
  Tiingo key**, so the live site's fund data is much fuller than local testing shows.
- **Market indices** (dashboard) + **news**: Yahoo Finance (free scrape, no key).

## Key files
- `src/app/page.tsx` - lock screen / splash. `SHOW_TOOL_DIRECTLY = true` bypasses login
  (demo mode). Brand text currently "Tool" (temp; was "Alca").
- `src/components/FundGrid.tsx` - app shell + nav + tab routing.
- `src/components/PortfoliosTab.tsx` - Build / Compare / Match Funds sub-tabs (client
  profile -> data-driven portfolio + asset location; compare vs current holdings;
  embed of ProfileMode matcher).
- `src/components/MurderBoardTab.tsx` - funds-in-use + news alerts + gap analysis.
- `src/components/RecommendTab.tsx` - Discover modes (ScreenTab, from-fund, ProfileMode).
- `src/lib/portfolioModel.ts` - allocation + asset-location engine.
- `src/lib/client.ts` - client profile model (localStorage).
- `src/lib/kpi.ts` - scoring (computePercentiles / compositeScore).
- `src/app/api/portfolio/select` - data-driven per-sleeve fund selection.

## Guardrails learned
- Project lives in an **iCloud-synced folder** -> Turbopack `.next` cache corrupts easily
  and iCloud creates `" 2.ts"` duplicate files. **NEVER `rm -rf .next` while `next dev`
  is running** (corrupts the dev cache). If dev gets stuck "Compiling", stop the server,
  `rm -rf .next`, restart.
- No git remote yet (no off-machine backup) - consider pushing to a private GitHub repo.

## Deploy
`cd "/Users/willseaborg/Documents/Fund Grid/fundgrid" && npx vercel --prod`
If the live site doesn't reflect changes: hard-refresh (Cmd+Shift+R) / check incognito;
confirm the CLI printed a Production URL and that it aliases alcawealth.vercel.app.

## Open items
- Merge the "Match Funds" sub-tab INTO the Build section of PortfoliosTab (show client
  portfolio and matched funds together in one view).
- Verify production deploy is actually promoting to alcawealth.vercel.app.
