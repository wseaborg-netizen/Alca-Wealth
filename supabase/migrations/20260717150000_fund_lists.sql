-- ════════════════════════════════════════════════════════════════════════════
-- Saved fund lists — extends the existing firm-scoped watchlists tables into
-- a full list system: two default lists per user (Commonly Used Funds +
-- Watchlist) plus custom lists, with optional per-fund notes.
--
-- RLS: unchanged — the existing firm-membership policies on watchlists /
-- watchlist_items already scope every row to the owning workspace.
-- Future alerts (SEC filings / news / holdings changes) will read these same
-- tables to answer "which funds is this advisor watching?" — alert_enabled
-- is reserved for that and unused today.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Columns ──────────────────────────────────────────────────────────────────

alter table watchlists
  add column if not exists type text not null default 'custom'
    check (type in ('common', 'watchlist', 'custom')),
  add column if not exists alert_enabled boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table watchlist_items
  add column if not exists fund_name text,
  add column if not exists category text,
  add column if not exists note text check (note is null or char_length(note) <= 500),
  add column if not exists updated_at timestamptz not null default now();

-- ── Migrate the old single "Default" list into the Watchlist default ────────
update watchlists set name = 'Watchlist', type = 'watchlist'
where name = 'Default' and type = 'custom'
  and not exists (select 1 from watchlists w2 where w2.firm_id = watchlists.firm_id and w2.name = 'Watchlist');
update watchlists set type = 'watchlist' where name = 'Watchlist' and type = 'custom';

-- ── Backfill defaults for every existing firm ────────────────────────────────
insert into watchlists (firm_id, created_by, name, type)
select f.id, f.created_by, 'Watchlist', 'watchlist' from firms f
where not exists (select 1 from watchlists w where w.firm_id = f.id and w.type = 'watchlist');

insert into watchlists (firm_id, created_by, name, type)
select f.id, f.created_by, 'Commonly Used Funds', 'common' from firms f
where not exists (select 1 from watchlists w where w.firm_id = f.id and w.type = 'common');

-- ── Signup provisioning: both default lists for new users ────────────────────
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

  insert into watchlists (firm_id, created_by, name, type) values (new_firm, new.id, 'Watchlist', 'watchlist');
  insert into watchlists (firm_id, created_by, name, type) values (new_firm, new.id, 'Commonly Used Funds', 'common');
  return new;
end $$;

-- ── updated_at maintenance ───────────────────────────────────────────────────
drop trigger if exists touch_watchlists on watchlists;
create trigger touch_watchlists before update on watchlists for each row execute function touch_updated_at();
drop trigger if exists touch_watchlist_items on watchlist_items;
create trigger touch_watchlist_items before update on watchlist_items for each row execute function touch_updated_at();
