-- ════════════════════════════════════════════════════════════════════════════
-- Dynamic universe — funds added at runtime from the Expansion Hub.
--
-- The static generated universe (data/generated/fund-universe.json) stays the
-- base. Production Vercel cannot safely rewrite repo files per request, so
-- newly added, FMP-supported, taxonomy-classified funds are stored here and
-- MERGED into the app universe server-side (src/lib/universeServer.ts).
--
-- Fund reference/classification data is objective (not user-private), and the
-- app is internal/single-firm today, so VERIFIED rows are readable by any
-- authenticated user (one shared universe). Writes are tracked by created_by +
-- firm_id and audited. Only verified=true rows ever merge into the universe.
-- No API keys or raw provider payloads are stored — fmp_payload_summary holds
-- safe identity fields only.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists dynamic_funds (
  id                    uuid primary key default gen_random_uuid(),
  firm_id               uuid references firms(id) on delete set null,   -- provenance
  created_by            uuid references auth.users(id) on delete set null,
  source_request_id     uuid references fund_requests(id) on delete set null,
  ticker                text not null,
  normalized_ticker     text not null check (normalized_ticker = upper(normalized_ticker)
                                             and char_length(normalized_ticker) between 1 and 20),
  fund_name             text not null,
  vehicle               text,                     -- ETF | Mutual Fund
  -- classification (controlled taxonomy values — validated at write time)
  asset_class           text,
  primary_category      text,
  category              text,                     -- legacy vocabulary used by screener/sleeves
  benchmark             text,                     -- SPY | AGG | VXUS
  benchmark_category    text,
  management_style      text,
  portfolio_role        text,
  investment_focus      text,
  region                text,
  market_cap            text,
  style                 text,
  style_box             text,
  credit_quality        text,                     -- reserved (not produced by the classifier yet)
  duration              text,                     -- reserved
  fmp_supported         boolean not null default true,
  fmp_payload_summary   jsonb,                    -- SAFE identity only (no key, no raw payload)
  classification_source text,                     -- 'rule-based' | 'manual-override'
  verified              boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- One dynamic record per ticker across the shared universe.
create unique index if not exists dynamic_funds_ticker_unique on dynamic_funds (normalized_ticker);
create index if not exists dynamic_funds_verified_idx on dynamic_funds (verified);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table dynamic_funds enable row level security;

-- Idempotent: drop-then-create so re-running this file never errors with
-- "policy already exists".
drop policy if exists dynamic_funds_select on dynamic_funds;
drop policy if exists dynamic_funds_insert on dynamic_funds;
drop policy if exists dynamic_funds_update on dynamic_funds;
drop policy if exists dynamic_funds_delete on dynamic_funds;

-- Read: verified funds are the shared universe (any signed-in user); a firm also
-- sees its own in-progress rows.
create policy dynamic_funds_select on dynamic_funds for select to authenticated
  using (verified = true or is_firm_member(firm_id));

-- Write: authenticated firm members; inserts must be attributed to the caller.
create policy dynamic_funds_insert on dynamic_funds for insert to authenticated
  with check (created_by = auth.uid() and (firm_id is null or is_firm_member(firm_id)));
create policy dynamic_funds_update on dynamic_funds for update to authenticated
  using (is_firm_member(firm_id)) with check (is_firm_member(firm_id));
create policy dynamic_funds_delete on dynamic_funds for delete to authenticated
  using (is_firm_member(firm_id));

-- Audit + updated_at (reuse existing definer functions).
drop trigger if exists audit_dynamic_funds on dynamic_funds;
create trigger audit_dynamic_funds after insert or update or delete on dynamic_funds
  for each row execute function log_saved_work();
drop trigger if exists touch_dynamic_funds on dynamic_funds;
create trigger touch_dynamic_funds before update on dynamic_funds
  for each row execute function touch_updated_at();

-- ── Extend fund_requests statuses for the full add-fund lifecycle ─────────────
alter table fund_requests drop constraint if exists fund_requests_status_check;
alter table fund_requests add constraint fund_requests_status_check check (status in (
  'pending', 'already_available', 'fmp_supported', 'needs_classification',
  'ready_for_review', 'approved', 'rejected', 'unsupported',
  'classification_failed', 'added_to_universe', 'failed_validation'));
