-- Stage 6B — remove schema-bound FMP residue (provider-neutral names).
-- Renames FMP-named columns and migrates the 'fmp_supported' status value to
-- 'provider_supported'. Preserves every row/value (column renames are
-- metadata-only). Runs transactionally; other allowed statuses are untouched.

begin;

-- ── fund_requests: status value + boolean column ─────────────────────────────
-- Drop the status CHECK and the active-request partial index first (both
-- reference the 'fmp_supported' status value), migrate the value, then restore.
alter table fund_requests drop constraint if exists fund_requests_status_check;
drop index if exists fund_requests_active_unique;

update fund_requests set status = 'provider_supported' where status = 'fmp_supported';

alter table fund_requests rename column fmp_supported to provider_supported;

alter table fund_requests add constraint fund_requests_status_check check (status in (
  'pending', 'already_available', 'provider_supported', 'needs_classification',
  'ready_for_review', 'approved', 'rejected', 'unsupported',
  'classification_failed', 'added_to_universe', 'failed_validation'));

create unique index if not exists fund_requests_active_unique
  on fund_requests (firm_id, normalized_ticker)
  where status in ('pending', 'provider_supported', 'needs_classification', 'ready_for_review');

-- ── dynamic_funds: rename the two FMP-named columns (data preserved) ──────────
alter table dynamic_funds rename column fmp_supported to provider_supported;
alter table dynamic_funds rename column fmp_payload_summary to provider_payload_summary;

commit;
