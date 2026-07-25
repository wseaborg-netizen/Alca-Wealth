-- ════════════════════════════════════════════════════════════════════════════
-- ALCA Auth + Secure Saved Work foundation
--
-- Identity: Supabase Auth (auth.users). Every user gets a profile, a default
-- firm (workspace), and an owner membership — created by trigger on signup.
-- All saved work is FIRM-scoped so team accounts slot in later without a
-- schema change. RLS is the authorization boundary: users only reach rows in
-- firms where they are members. No anon access to any user data.
--
-- PII policy: saved_portfolios.name (and all saved-work names) must be
-- anonymous/de-identified labels ("Client A — Growth", "Retiree 60/40").
-- No real client names, account numbers, SSNs, credentials, or documents.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists firms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 80),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists firm_members (
  firm_id    uuid not null references firms(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (firm_id, user_id)
);
create index if not exists firm_members_user_idx on firm_members(user_id);

-- Named watchlists (a default list per firm/user; more lists later).
-- NOTE: an early prototype used a flat `watchlists(user_id, ticker)` table.
-- If that shape is detected it is renamed to watchlists_legacy below and its
-- rows are migrated after firm backfill.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'watchlists' and column_name = 'ticker'
  ) then
    alter table watchlists rename to watchlists_legacy;
  end if;
end $$;

create table if not exists watchlists (
  id         uuid primary key default gen_random_uuid(),
  firm_id    uuid not null references firms(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name       text not null default 'Default' check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (firm_id, name)
);

create table if not exists watchlist_items (
  watchlist_id uuid not null references watchlists(id) on delete cascade,
  ticker       text not null check (ticker = upper(ticker) and char_length(ticker) between 1 and 12),
  added_by     uuid references auth.users(id) on delete set null,
  added_at     timestamptz not null default now(),
  primary key (watchlist_id, ticker)
);

create table if not exists saved_comparisons (
  id         uuid primary key default gen_random_uuid(),
  firm_id    uuid not null references firms(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name       text not null check (char_length(name) between 1 and 80),
  tickers    jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists saved_comparisons_firm_idx on saved_comparisons(firm_id);

-- Anonymous/de-identified names ONLY (enforced by convention + UI copy).
create table if not exists saved_portfolios (
  id         uuid primary key default gen_random_uuid(),
  firm_id    uuid not null references firms(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name       text not null check (char_length(name) between 1 and 80),
  payload    jsonb not null default '{}',   -- holdings, weights, horizon, risk — no PII
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists saved_portfolios_firm_idx on saved_portfolios(firm_id);

create table if not exists saved_model_scenarios (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid not null references firms(id) on delete cascade,
  created_by  uuid references auth.users(id) on delete set null,
  name        text not null check (char_length(name) between 1 and 80),
  tool        text not null check (tool in ('fund-benchmark','projection','scenarios','stress')),
  subject     text not null default '',
  assumptions jsonb not null default '{}',
  extra       jsonb,
  version     int not null default 2,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists saved_model_scenarios_firm_idx on saved_model_scenarios(firm_id);

create table if not exists user_preferences (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  prefs      jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists audit_log (
  id          bigint generated always as identity primary key,
  firm_id     uuid references firms(id) on delete cascade,
  user_id     uuid,
  action      text not null check (action in ('create','update','delete')),
  object_type text not null,
  object_id   text not null,
  meta        jsonb,
  at          timestamptz not null default now()
);
create index if not exists audit_log_firm_idx on audit_log(firm_id, at desc);

-- ── Signup provisioning: profile + default firm + owner membership ──────────

create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  new_firm uuid;
begin
  insert into profiles (id, email, display_name)
  values (new.id, new.email, split_part(coalesce(new.email,''), '@', 1))
  on conflict (id) do nothing;

  insert into firms (name, created_by)
  values (coalesce(nullif(split_part(coalesce(new.email,''), '@', 1), ''), 'My') || ' Workspace', new.id)
  returning id into new_firm;

  insert into firm_members (firm_id, user_id, role) values (new_firm, new.id, 'owner');

  insert into watchlists (firm_id, created_by, name) values (new_firm, new.id, 'Default');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Backfill any pre-existing users (idempotent).
do $$
declare u record; new_firm uuid;
begin
  for u in select id, email from auth.users
           where id not in (select user_id from firm_members) loop
    insert into profiles (id, email, display_name)
    values (u.id, u.email, split_part(coalesce(u.email,''), '@', 1))
    on conflict (id) do nothing;
    insert into firms (name, created_by)
    values (coalesce(nullif(split_part(coalesce(u.email,''), '@', 1), ''), 'My') || ' Workspace', u.id)
    returning id into new_firm;
    insert into firm_members (firm_id, user_id, role) values (new_firm, u.id, 'owner');
    insert into watchlists (firm_id, created_by, name) values (new_firm, u.id, 'Default');
  end loop;
end $$;

-- Migrate rows from the legacy flat watchlist, if it existed.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'watchlists_legacy') then
    insert into watchlist_items (watchlist_id, ticker, added_by, added_at)
    select w.id, upper(l.ticker), l.user_id, coalesce(l.added_at, now())
    from watchlists_legacy l
    join firm_members m on m.user_id = l.user_id
    join watchlists w on w.firm_id = m.firm_id and w.name = 'Default'
    on conflict do nothing;
  end if;
end $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────

-- Membership check used by every firm-scoped policy. SECURITY DEFINER so the
-- policy can consult firm_members without recursive RLS evaluation.
create or replace function is_firm_member(f uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from firm_members where firm_id = f and user_id = auth.uid());
$$;

alter table profiles              enable row level security;
alter table firms                 enable row level security;
alter table firm_members          enable row level security;
alter table watchlists            enable row level security;
alter table watchlist_items       enable row level security;
alter table saved_comparisons     enable row level security;
alter table saved_portfolios      enable row level security;
alter table saved_model_scenarios enable row level security;
alter table user_preferences      enable row level security;
alter table audit_log             enable row level security;

-- profiles: own row only
create policy profiles_select on profiles for select to authenticated using (id = auth.uid());
create policy profiles_update on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- firms: readable by members
create policy firms_select on firms for select to authenticated using (is_firm_member(id));

-- firm_members: read memberships of firms you belong to
create policy firm_members_select on firm_members for select to authenticated using (is_firm_member(firm_id));

-- watchlists + items: full access for firm members
create policy watchlists_all on watchlists for all to authenticated
  using (is_firm_member(firm_id)) with check (is_firm_member(firm_id));
create policy watchlist_items_all on watchlist_items for all to authenticated
  using (exists (select 1 from watchlists w where w.id = watchlist_id and is_firm_member(w.firm_id)))
  with check (exists (select 1 from watchlists w where w.id = watchlist_id and is_firm_member(w.firm_id)));

-- saved work: full access for firm members
create policy saved_comparisons_all on saved_comparisons for all to authenticated
  using (is_firm_member(firm_id)) with check (is_firm_member(firm_id));
create policy saved_portfolios_all on saved_portfolios for all to authenticated
  using (is_firm_member(firm_id)) with check (is_firm_member(firm_id));
create policy saved_model_scenarios_all on saved_model_scenarios for all to authenticated
  using (is_firm_member(firm_id)) with check (is_firm_member(firm_id));

-- preferences: own row only
create policy user_preferences_all on user_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit log: readable by firm members; rows are written by triggers below
-- (definer function), never directly by clients.
create policy audit_log_select on audit_log for select to authenticated using (is_firm_member(firm_id));

-- ── Audit triggers on saved work ─────────────────────────────────────────────

create or replace function log_saved_work()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  f uuid; oid text; act text;
begin
  if tg_op = 'INSERT' then act := 'create'; f := new.firm_id; oid := new.id::text;
  elsif tg_op = 'UPDATE' then act := 'update'; f := new.firm_id; oid := new.id::text;
  else act := 'delete'; f := old.firm_id; oid := old.id::text;
  end if;
  insert into audit_log (firm_id, user_id, action, object_type, object_id)
  values (f, auth.uid(), act, tg_table_name, oid);
  return coalesce(new, old);
end $$;

create or replace function log_watchlist_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare f uuid; t text; act text;
begin
  if tg_op = 'INSERT' then act := 'create'; t := new.ticker;
    select firm_id into f from watchlists where id = new.watchlist_id;
  else act := 'delete'; t := old.ticker;
    select firm_id into f from watchlists where id = old.watchlist_id;
  end if;
  insert into audit_log (firm_id, user_id, action, object_type, object_id)
  values (f, auth.uid(), act, 'watchlist_items', t);
  return coalesce(new, old);
end $$;

drop trigger if exists audit_saved_comparisons on saved_comparisons;
create trigger audit_saved_comparisons after insert or update or delete on saved_comparisons
  for each row execute function log_saved_work();
drop trigger if exists audit_saved_portfolios on saved_portfolios;
create trigger audit_saved_portfolios after insert or update or delete on saved_portfolios
  for each row execute function log_saved_work();
drop trigger if exists audit_saved_model_scenarios on saved_model_scenarios;
create trigger audit_saved_model_scenarios after insert or update or delete on saved_model_scenarios
  for each row execute function log_saved_work();
drop trigger if exists audit_watchlist_items on watchlist_items;
create trigger audit_watchlist_items after insert or delete on watchlist_items
  for each row execute function log_watchlist_item();

-- updated_at maintenance
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists touch_saved_comparisons on saved_comparisons;
create trigger touch_saved_comparisons before update on saved_comparisons for each row execute function touch_updated_at();
drop trigger if exists touch_saved_portfolios on saved_portfolios;
create trigger touch_saved_portfolios before update on saved_portfolios for each row execute function touch_updated_at();
drop trigger if exists touch_saved_model_scenarios on saved_model_scenarios;
create trigger touch_saved_model_scenarios before update on saved_model_scenarios for each row execute function touch_updated_at();
