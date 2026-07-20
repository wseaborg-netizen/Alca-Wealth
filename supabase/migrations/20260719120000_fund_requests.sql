-- ════════════════════════════════════════════════════════════════════════════
-- Add Missing Fund — fund_requests
--
-- Advisors can request a ticker that isn't in ALCA's verified universe. Each
-- request is tracked so it can be reviewed and, later, fed into the offline
-- fund-universe pipeline. This table NEVER mutates the verified universe on its
-- own — it only records intent + the outcome of automated checks.
--
-- Firm-scoped, exactly like every other saved-work table: RLS via
-- is_firm_member() is the authorization boundary, and the firm_members role
-- (owner/admin/member) is the existing pattern for who may review/approve.
-- No anon access. No secrets are ever stored here.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists fund_requests (
  id                    uuid primary key default gen_random_uuid(),
  firm_id               uuid not null references firms(id) on delete cascade,
  created_by            uuid references auth.users(id) on delete set null,
  ticker                text not null check (char_length(ticker) between 1 and 20),
  normalized_ticker     text not null check (normalized_ticker = upper(normalized_ticker)
                                             and char_length(normalized_ticker) between 1 and 20),
  status                text not null default 'pending' check (status in (
                          'pending', 'already_available', 'fmp_supported', 'needs_classification',
                          'ready_for_review', 'approved', 'rejected', 'unsupported')),
  fund_name             text,
  fmp_supported         boolean not null default false,
  already_in_universe   boolean not null default false,
  classification_status text,
  failure_reason        text,
  admin_note            text check (admin_note is null or char_length(admin_note) <= 1000),
  requested_at          timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists fund_requests_firm_idx on fund_requests(firm_id, requested_at desc);

-- At most one ACTIVE request per firm + ticker (terminal states can recur later).
create unique index if not exists fund_requests_active_unique
  on fund_requests (firm_id, normalized_ticker)
  where status in ('pending', 'fmp_supported', 'needs_classification', 'ready_for_review');

-- ── RLS: firm members only (same pattern as watchlists / saved work) ──────────
alter table fund_requests enable row level security;

create policy fund_requests_all on fund_requests for all to authenticated
  using (is_firm_member(firm_id)) with check (is_firm_member(firm_id));

-- ── Audit + updated_at (reuse the existing definer functions) ─────────────────
drop trigger if exists audit_fund_requests on fund_requests;
create trigger audit_fund_requests after insert or update or delete on fund_requests
  for each row execute function log_saved_work();

drop trigger if exists touch_fund_requests on fund_requests;
create trigger touch_fund_requests before update on fund_requests
  for each row execute function touch_updated_at();
