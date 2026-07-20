# SEC EDGAR Monitoring + Advisor Alerts

Phase-1 SEC filing monitoring for the funds in a firm's saved lists. Real SEC
filing metadata only — **no fake alerts, no generic news, no buy/sell or
change claims.**

## Identity (required)

- **`SEC_USER_AGENT`** — the SEC EDGAR fair-access User-Agent, e.g.
  `Alca Wealth will@alcawealth.com`. Set locally (`.env.local`) and in Vercel.
  Falls back to `ALCA Wealth <SEC_CONTACT_EMAIL>` if unset (see `src/lib/sec.ts`).
- **Missing UA → SEC is never called.** The refresh route returns `503` and the
  System Health "SEC Monitoring" card goes **red**.

## SEC endpoints used (server-side only, `src/lib/sec.ts`)

- Ticker → CIK/series/class mapping (SEC company/mutual-fund ticker files).
- `https://data.sec.gov/submissions/CIK##########.json` — recent filings.
- `browse-edgar ...&output=atom` — series/class scope feeds.

All responses are **cached** (Redis in prod, in-memory locally) and **rate
limited** (shared token bucket + polite gap). SEC is **never** called from the
browser and **never** on page load — only via the explicit refresh route.

## Monitored forms

Funds: `N-PORT`, `N-PORT-P`, `N-CEN`, `N-CSR`, `N-CSRS`, `N-1A`, `485BPOS`,
`485APOS`, `497`, `497K`, `N-PX` (fetched via `getFundFilings`, which filters to
`FUND_FORMS`). Company forms (`10-K`, `10-Q`, `8-K`, `DEF 14A`, `S-1`, `4`) are
recognized in `RELEVANT_FORMS` for a **future** company-monitoring path.

## Data model (migration `20260723000000_advisor_alerts.sql`)

- **`monitored_entities`** (firm-scoped) — saved tickers that can be monitored:
  ticker, cik, cik_source, entity_type, active, source_type/id, last_checked/
  success/error. Unique `(firm_id, normalized_ticker)` — no duplicate active row.
- **`sec_filings`** (shared reference) — filing metadata, unique
  `(cik, accession_number)` so a filing is stored once.
- **`advisor_alerts`** (firm-scoped) — unified attention feed. Partial-unique
  `(firm_id, dedupe_key)` so one filing = one alert.

RLS: firm-scoped tables use a single `FOR ALL` policy (`is_firm_member(firm_id)`)
that **includes the INSERT WITH CHECK** (upsert-safe); `sec_filings` is readable/
insertable by any authenticated user. No anon access.

## Alert creation rules (`src/lib/monitoring.ts`)

1. Saved-list tickers → `monitored_entities` (dedup by firm+ticker).
2. For each active entity (capped per refresh): resolve CIK via SEC mapping;
   unresolved → `cik_source=unavailable`, **warning** (not error, never a crash).
3. Fetch recent filings; store **new** ones in `sec_filings`.
4. For each **new** filing only, create **one** `advisor_alert` (deduped by
   `sec:<cik>:<accession>`). A filing already stored creates **no** alert.
5. Summaries are generic + factual (`formSummary`) — "New fund portfolio report
   filed.", etc. Never "manager/expense/strategy/holdings/risk changed."

## Routes

- `GET /api/alerts` — feed + counts + monitored funds (firm-scoped, 401 out).
- `POST /api/alerts/[id]/read` · `POST /api/alerts/[id]/archive`.
- `POST /api/monitoring/sec/refresh` — on-demand refresh (signed-in, server-side,
  503 if UA missing). Removing a saved ticker does **not** delete historical
  alerts/filings.
- `GET /api/advisor-overview` — aggregates user, attention items, saved-list
  summary, recent activity, expansion + health hints for the Advisor Hub.

## What is real now vs future

- **Real:** SEC filing alerts from saved-list funds; monitored-entity status;
  read/archive; System Health SEC card; Advisor Hub aggregation.
- **Future:** company-form (`10-K`…) monitoring; portfolio-sourced monitoring;
  `future_news` source (data-model only, honest empty state — no unlicensed news);
  filing-body parsing / change detection (Phase 1 is metadata only).

## Limitations

- CIK resolution depends on SEC's ticker files; some tickers have no mapping
  (shown as "unresolved", warning).
- Each refresh checks a bounded number of monitored tickers to stay polite to
  SEC; large lists refresh across multiple runs.
- Peer/scoring of a fund is unaffected by monitoring; alerts are metadata only.
