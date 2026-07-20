-- ════════════════════════════════════════════════════════════════════════════
-- Minimal signup profile — extend `profiles` with name + timezone + onboarding.
--
-- The `profiles` table already exists (id = auth.users(id) — the standard
-- Supabase pattern; `id` IS the user id, so no separate user_id column). This
-- adds the minimal fields the personalized Advisor Hub needs. No firm_name, no
-- role, no position. RLS is unchanged (own-row select/update already in place).
--
-- Idempotent + re-runnable.
-- ════════════════════════════════════════════════════════════════════════════

alter table profiles
  add column if not exists first_name           text,
  add column if not exists last_name            text,
  add column if not exists timezone             text not null default 'America/Chicago',
  add column if not exists onboarding_completed boolean not null default false;

-- ── Signup provisioning: capture name + timezone from auth metadata ──────────
-- (raw_user_meta_data is populated by supabase.auth.signUp({ options: { data }})).
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  new_firm uuid;
  meta     jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  f_name   text := nullif(trim(meta->>'first_name'), '');
  l_name   text := nullif(trim(meta->>'last_name'), '');
  tz       text := nullif(trim(meta->>'timezone'), '');
  disp     text := nullif(trim(concat_ws(' ', f_name, l_name)), '');
begin
  insert into profiles (id, email, display_name, first_name, last_name, timezone, onboarding_completed)
  values (
    new.id, new.email,
    coalesce(disp, split_part(coalesce(new.email,''), '@', 1)),
    f_name, l_name,
    coalesce(tz, 'America/Chicago'),
    (f_name is not null and l_name is not null)   -- complete only if we already have a full name
  )
  on conflict (id) do update
    set first_name = coalesce(excluded.first_name, profiles.first_name),
        last_name  = coalesce(excluded.last_name,  profiles.last_name),
        timezone   = coalesce(excluded.timezone,   profiles.timezone),
        display_name = coalesce(excluded.display_name, profiles.display_name),
        onboarding_completed = profiles.onboarding_completed or excluded.onboarding_completed;

  insert into firms (name, created_by)
  values (coalesce(nullif(split_part(coalesce(new.email,''), '@', 1), ''), 'My') || ' Workspace', new.id)
  returning id into new_firm;

  insert into firm_members (firm_id, user_id, role) values (new_firm, new.id, 'owner');

  insert into watchlists (firm_id, created_by, name, type) values (new_firm, new.id, 'Watchlist', 'watchlist');
  insert into watchlists (firm_id, created_by, name, type) values (new_firm, new.id, 'Commonly Used Funds', 'common');
  return new;
end $$;
