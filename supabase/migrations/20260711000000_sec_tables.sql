-- SEC/EDGAR durable storage — server-side only tables.
-- RLS is enabled with NO anon/authenticated policies: browser clients cannot
-- read or write these tables; only the service-role key (server) can.

create table if not exists sec_fund_mappings (
  ticker           text primary key,
  cik              text not null,
  series_id        text,
  class_id         text,
  registrant_name  text,
  retrieved_at     timestamptz not null default now(),
  source_timestamp timestamptz
);

create table if not exists sec_fund_filings (
  id               bigint generated always as identity primary key,
  ticker           text not null,
  accession_number text not null,
  form             text not null,
  filing_date      date,
  primary_document text,
  url              text not null,
  description      text,
  scope            text not null check (scope in ('exact_class','exact_series','registrant','unconfirmed')),
  scope_id         text,
  retrieved_at     timestamptz not null default now(),
  first_seen       timestamptz not null default now(),
  last_seen        timestamptz not null default now(),
  unique (ticker, accession_number)
);
create index if not exists sec_fund_filings_ticker_idx on sec_fund_filings (ticker, filing_date desc);

create table if not exists sec_sync_status (
  key                 text primary key,           -- ticker or dataset key (e.g. 'ticker-map')
  last_attempted      timestamptz,
  last_successful     timestamptz,
  last_error_category text,
  failure_count       int not null default 0,
  freshness           text not null default 'unknown' check (freshness in ('fresh','stale','failed','unknown'))
);

alter table sec_fund_mappings enable row level security;
alter table sec_fund_filings  enable row level security;
alter table sec_sync_status   enable row level security;
-- no policies created: anon/authenticated clients are denied everything;
-- the service-role client bypasses RLS for server-side sync.
