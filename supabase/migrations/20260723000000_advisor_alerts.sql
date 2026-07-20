-- ════════════════════════════════════════════════════════════════════════════
-- Advisor Hub monitoring + alerts foundation.
--
-- Three tables:
--   monitored_entities — saved tickers that can be monitored (firm-scoped)
--   sec_filings        — SEC filing metadata (shared reference, unique cik+accn)
--   advisor_alerts     — unified attention feed (firm-scoped)
--
-- RLS follows the existing firm-scoped model (is_firm_member). Firm-scoped
-- tables use a single FOR ALL policy that includes the INSERT WITH CHECK, so
-- upserts are never denied. sec_filings is objective filing metadata (not
-- user-private): any authenticated user may read/insert it. No anon access.
-- Idempotent + re-runnable.
-- ════════════════════════════════════════════════════════════════════════════

-- ── monitored_entities ───────────────────────────────────────────────────────
create table if not exists monitored_entities (
  id                uuid primary key default gen_random_uuid(),
  firm_id           uuid not null references firms(id) on delete cascade,
  created_by        uuid references auth.users(id) on delete set null,
  ticker            text not null,
  normalized_ticker text not null check (normalized_ticker = upper(normalized_ticker)),
  entity_name       text,
  entity_type       text not null default 'unknown' check (entity_type in ('fund','company','unknown')),
  cik               text,
  cik_source        text not null default 'unavailable' check (cik_source in ('sec_mapping','manual','unavailable')),
  active            boolean not null default true,
  source_type       text not null default 'saved_list' check (source_type in ('saved_list','manual','future_portfolio')),
  source_id         uuid,
  last_checked_at   timestamptz,
  last_success_at   timestamptz,
  last_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (firm_id, normalized_ticker)
);
create index if not exists monitored_entities_firm_idx on monitored_entities(firm_id, active);

alter table monitored_entities enable row level security;
drop policy if exists monitored_entities_all on monitored_entities;
create policy monitored_entities_all on monitored_entities for all to authenticated
  using (is_firm_member(firm_id)) with check (is_firm_member(firm_id));

-- ── sec_filings (shared reference) ───────────────────────────────────────────
create table if not exists sec_filings (
  id                  uuid primary key default gen_random_uuid(),
  cik                 text not null,
  ticker              text,
  entity_name         text,
  accession_number    text not null,
  form_type           text,
  filing_date         date,
  report_date         date,
  acceptance_datetime timestamptz,
  primary_document    text,
  filing_url          text,
  sec_index_url       text,
  raw_metadata        jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (cik, accession_number)
);
create index if not exists sec_filings_ticker_idx on sec_filings(ticker, filing_date desc);

alter table sec_filings enable row level security;
drop policy if exists sec_filings_select on sec_filings;
drop policy if exists sec_filings_insert on sec_filings;
create policy sec_filings_select on sec_filings for select to authenticated using (true);
create policy sec_filings_insert on sec_filings for insert to authenticated with check (true);

-- ── advisor_alerts ───────────────────────────────────────────────────────────
create table if not exists advisor_alerts (
  id                uuid primary key default gen_random_uuid(),
  firm_id           uuid not null references firms(id) on delete cascade,
  created_by        uuid references auth.users(id) on delete set null,
  alert_type        text not null,
  severity          text not null default 'info' check (severity in ('info','watch','warning','critical')),
  status            text not null default 'unread' check (status in ('unread','read','archived')),
  source            text not null check (source in ('sec_edgar','fund_request','system_health','saved_list','expansion','future_news')),
  ticker            text,
  fund_name         text,
  cik               text,
  title             text not null,
  summary           text,
  reason            text,
  action_label      text,
  action_href       text,
  related_list_id   uuid,
  related_filing_id uuid references sec_filings(id) on delete set null,
  metadata          jsonb,
  dedupe_key        text,                       -- app-level dedupe (e.g. sec:cik:accession)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  read_at           timestamptz
);
create index if not exists advisor_alerts_firm_idx on advisor_alerts(firm_id, status, created_at desc);
-- One alert per firm per dedupe_key (SEC filing, etc.) — prevents duplicate alerts.
create unique index if not exists advisor_alerts_dedupe_uniq on advisor_alerts(firm_id, dedupe_key) where dedupe_key is not null;

alter table advisor_alerts enable row level security;
drop policy if exists advisor_alerts_all on advisor_alerts;
create policy advisor_alerts_all on advisor_alerts for all to authenticated
  using (is_firm_member(firm_id)) with check (is_firm_member(firm_id));

-- updated_at maintenance
drop trigger if exists touch_monitored_entities on monitored_entities;
create trigger touch_monitored_entities before update on monitored_entities for each row execute function touch_updated_at();
drop trigger if exists touch_advisor_alerts on advisor_alerts;
create trigger touch_advisor_alerts before update on advisor_alerts for each row execute function touch_updated_at();
drop trigger if exists touch_sec_filings on sec_filings;
create trigger touch_sec_filings before update on sec_filings for each row execute function touch_updated_at();
