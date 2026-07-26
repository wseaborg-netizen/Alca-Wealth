-- ════════════════════════════════════════════════════════════════════════════
-- Phase 2B — Firm Funds + Fund Reviews data foundation.
--
-- Four firm-scoped tables:
--   firm_funds        — a firm's curated fund shelf (canonical ticker + status +
--                       role + rationale + next review date). Stores canonical
--                       IDENTITY only — name/category/benchmark/vehicle are
--                       resolved from the canonical universe, never duplicated.
--   fund_reviews      — a review workflow record for one firm_fund.
--   review_candidates — replacement/alternative tickers considered in a review.
--   review_evidence   — evidence attached to a review (metrics, filings, notes).
--
-- Integrity enforced at the DATABASE level (application checks alone are not
-- relied on):
--   • Same-firm ownership of a review: composite FK (firm_id, firm_fund_id) →
--     firm_funds(firm_id, id). ON DELETE NO ACTION so review history cannot be
--     erased by deleting a firm_fund (a fund with reviews cannot be deleted).
--   • Same-firm users: created_by / assigned_reviewer / author (each nullable)
--     must be a member of the owning firm — composite FKs to
--     firm_members(firm_id, user_id) (MATCH SIMPLE, so NULL stays allowed).
--   • Candidates + evidence cascade only with their parent review.
--
-- RLS follows the existing firm-membership model (is_firm_member). Every table
-- carries explicit SELECT/INSERT/UPDATE/DELETE policies. Provider-neutral names;
-- no monitoring/alerts/client fields. Wrapped in a single transaction; idempotent
-- and safe for one manual application. No previously-applied migration is edited.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── firm_funds ───────────────────────────────────────────────────────────────
create table if not exists firm_funds (
  id                 uuid primary key default gen_random_uuid(),
  firm_id            uuid not null references firms(id) on delete cascade,
  normalized_ticker  text not null
    check (normalized_ticker = upper(normalized_ticker) and char_length(normalized_ticker) between 1 and 12),
  status             text not null default 'candidate'
    check (status in ('approved', 'watch', 'candidate', 'restricted', 'retired')),
  fund_role          text check (fund_role is null or char_length(fund_role) <= 120),
  approval_rationale text check (approval_rationale is null or char_length(approval_rationale) <= 2000),
  next_review_date   date,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- one row per fund per firm
  unique (firm_id, normalized_ticker),
  -- target for the composite same-firm FK on fund_reviews
  unique (firm_id, id),
  -- same-firm creator: when set, created_by must be a member of firm_id
  -- (MATCH SIMPLE — a NULL created_by is allowed and unchecked)
  foreign key (firm_id, created_by) references firm_members(firm_id, user_id)
);
create index if not exists firm_funds_firm_idx on firm_funds(firm_id, status);
create index if not exists firm_funds_next_review_idx on firm_funds(firm_id, next_review_date);

-- ── fund_reviews ─────────────────────────────────────────────────────────────
create table if not exists fund_reviews (
  id                uuid primary key default gen_random_uuid(),
  firm_id           uuid not null references firms(id) on delete cascade,
  firm_fund_id      uuid not null,
  status            text not null default 'open'
    check (status in ('open', 'in_review', 'completed', 'cancelled')),
  reason            text check (reason is null or char_length(reason) <= 2000),
  assigned_reviewer uuid references auth.users(id) on delete set null,
  opened_date       date not null default current_date,
  review_date       date,
  completed_date    date,
  decision          text
    check (decision is null or decision in ('keep', 'watch', 'replace', 'restrict', 'retire')),
  rationale         text check (rationale is null or char_length(rationale) <= 4000),
  effective_date    date,
  next_review_date  date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- target for the composite same-firm FK on review_evidence
  unique (firm_id, id),
  -- DATABASE-level same-firm ownership: the review's firm must own the firm_fund.
  -- NO ACTION preserves review history — a firm_fund with reviews cannot be
  -- deleted (a firm-level delete still cascades through firm_id → firms).
  foreign key (firm_id, firm_fund_id) references firm_funds(firm_id, id) on delete no action,
  -- same-firm reviewer: when set, assigned_reviewer must be a member of firm_id
  foreign key (firm_id, assigned_reviewer) references firm_members(firm_id, user_id),
  -- a completed review must record a final decision
  constraint fund_reviews_completed_decision
    check (status <> 'completed' or decision is not null),
  -- next review cannot be scheduled before the review was completed
  constraint fund_reviews_next_after_completed
    check (next_review_date is null or completed_date is null or next_review_date >= completed_date)
);
create index if not exists fund_reviews_firm_status_idx on fund_reviews(firm_id, status);
create index if not exists fund_reviews_firm_fund_idx on fund_reviews(firm_id, firm_fund_id);
create index if not exists fund_reviews_next_review_idx on fund_reviews(firm_id, next_review_date);

-- ── review_candidates ────────────────────────────────────────────────────────
-- No candidate_status column: ordering + notes + selected fully express intent.
create table if not exists review_candidates (
  id                  uuid primary key default gen_random_uuid(),
  review_id           uuid not null references fund_reviews(id) on delete cascade,
  normalized_ticker   text not null
    check (normalized_ticker = upper(normalized_ticker) and char_length(normalized_ticker) between 1 and 12),
  display_order       int not null default 0,
  notes               text check (notes is null or char_length(notes) <= 2000),
  selected            boolean not null default false,
  comparison_snapshot jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- candidate tickers are unique within a review
  unique (review_id, normalized_ticker)
);
create index if not exists review_candidates_review_idx on review_candidates(review_id, display_order);
-- at most one candidate may be selected within a review
create unique index if not exists review_candidates_one_selected
  on review_candidates(review_id) where selected;

-- ── review_evidence ──────────────────────────────────────────────────────────
-- Carries firm_id so same-firm author + same-firm review can be enforced by
-- composite FKs (firm_id is the tenant key, not duplicated fund metadata).
create table if not exists review_evidence (
  id               uuid primary key default gen_random_uuid(),
  firm_id          uuid not null references firms(id) on delete cascade,
  review_id        uuid not null,
  evidence_type    text not null check (char_length(evidence_type) between 1 and 40),
  title            text check (title is null or char_length(title) <= 200),
  source_reference text check (source_reference is null or char_length(source_reference) <= 500),
  as_of_date       date,
  snapshot         jsonb,
  author           uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  -- evidence belongs to a review OWNED BY THE SAME FIRM; cascades with the review
  foreign key (firm_id, review_id) references fund_reviews(firm_id, id) on delete cascade,
  -- same-firm author: when set, author must be a member of firm_id
  foreign key (firm_id, author) references firm_members(firm_id, user_id)
);
create index if not exists review_evidence_review_idx on review_evidence(review_id, created_at desc);

-- ── updated_at maintenance (reuses the existing touch_updated_at() function) ──
drop trigger if exists touch_firm_funds on firm_funds;
create trigger touch_firm_funds before update on firm_funds for each row execute function touch_updated_at();
drop trigger if exists touch_fund_reviews on fund_reviews;
create trigger touch_fund_reviews before update on fund_reviews for each row execute function touch_updated_at();
drop trigger if exists touch_review_candidates on review_candidates;
create trigger touch_review_candidates before update on review_candidates for each row execute function touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table firm_funds        enable row level security;
alter table fund_reviews      enable row level security;
alter table review_candidates enable row level security;
alter table review_evidence   enable row level security;

-- firm_funds: firm members only, explicit per-command policies.
drop policy if exists firm_funds_select on firm_funds;
create policy firm_funds_select on firm_funds for select to authenticated using (is_firm_member(firm_id));
drop policy if exists firm_funds_insert on firm_funds;
create policy firm_funds_insert on firm_funds for insert to authenticated with check (is_firm_member(firm_id));
drop policy if exists firm_funds_update on firm_funds;
create policy firm_funds_update on firm_funds for update to authenticated using (is_firm_member(firm_id)) with check (is_firm_member(firm_id));
drop policy if exists firm_funds_delete on firm_funds;
create policy firm_funds_delete on firm_funds for delete to authenticated using (is_firm_member(firm_id));

-- fund_reviews: firm members only.
drop policy if exists fund_reviews_select on fund_reviews;
create policy fund_reviews_select on fund_reviews for select to authenticated using (is_firm_member(firm_id));
drop policy if exists fund_reviews_insert on fund_reviews;
create policy fund_reviews_insert on fund_reviews for insert to authenticated with check (is_firm_member(firm_id));
drop policy if exists fund_reviews_update on fund_reviews;
create policy fund_reviews_update on fund_reviews for update to authenticated using (is_firm_member(firm_id)) with check (is_firm_member(firm_id));
drop policy if exists fund_reviews_delete on fund_reviews;
create policy fund_reviews_delete on fund_reviews for delete to authenticated using (is_firm_member(firm_id));

-- review_candidates: scoped through the parent review's firm membership.
drop policy if exists review_candidates_select on review_candidates;
create policy review_candidates_select on review_candidates for select to authenticated
  using (exists (select 1 from fund_reviews r where r.id = review_id and is_firm_member(r.firm_id)));
drop policy if exists review_candidates_insert on review_candidates;
create policy review_candidates_insert on review_candidates for insert to authenticated
  with check (exists (select 1 from fund_reviews r where r.id = review_id and is_firm_member(r.firm_id)));
drop policy if exists review_candidates_update on review_candidates;
create policy review_candidates_update on review_candidates for update to authenticated
  using (exists (select 1 from fund_reviews r where r.id = review_id and is_firm_member(r.firm_id)))
  with check (exists (select 1 from fund_reviews r where r.id = review_id and is_firm_member(r.firm_id)));
drop policy if exists review_candidates_delete on review_candidates;
create policy review_candidates_delete on review_candidates for delete to authenticated
  using (exists (select 1 from fund_reviews r where r.id = review_id and is_firm_member(r.firm_id)));

-- review_evidence: firm members only (firm_id is present + FK-tied to the review).
drop policy if exists review_evidence_select on review_evidence;
create policy review_evidence_select on review_evidence for select to authenticated using (is_firm_member(firm_id));
drop policy if exists review_evidence_insert on review_evidence;
create policy review_evidence_insert on review_evidence for insert to authenticated with check (is_firm_member(firm_id));
drop policy if exists review_evidence_update on review_evidence;
create policy review_evidence_update on review_evidence for update to authenticated using (is_firm_member(firm_id)) with check (is_firm_member(firm_id));
drop policy if exists review_evidence_delete on review_evidence;
create policy review_evidence_delete on review_evidence for delete to authenticated using (is_firm_member(firm_id));

commit;
