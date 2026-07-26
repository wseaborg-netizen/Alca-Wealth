<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Alca Wealth — quick map for coding agents

- **Project name:** `alca-wealth`. The app shell component is `src/components/AppShell.tsx`.
- **Fund universe:** generated offline into `data/generated/fund-universe.json`, which is the
  ONLY fund-universe source the website reads (via `src/lib/universe.ts`, verified funds only).
  Never add another fund list or reintroduce the old `universe.json` (deleted).
- **Pipeline commands:** `npm run funds:classify` →
  `funds:validate`. Scripts live in `scripts/` and get all paths from `scripts/paths.mjs`.
- **Data folders:** `data/input/` (fund-tickers.txt), `data/config/` (fund-taxonomy.json,
  fund-classification-overrides.json), `data/generated/` (pipeline outputs).
- **Secrets:** `TIINGO_API_KEY` (required, server-only market data). Never
  print or hardcode them; read from env → `.env.local`.
- Don't change portfolio/scoring/recommendation logic or UI when doing data/pipeline work.
