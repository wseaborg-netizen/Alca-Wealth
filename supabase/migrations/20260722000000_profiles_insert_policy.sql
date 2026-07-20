-- ════════════════════════════════════════════════════════════════════════════
-- Bugfix: profiles was missing an INSERT policy.
--
-- The original auth migration created SELECT + UPDATE policies on `profiles`
-- but no INSERT policy. /api/profile writes with upsert (INSERT ... ON CONFLICT
-- DO UPDATE), which RLS evaluates as an INSERT — so with RLS enabled and no
-- INSERT policy, EVERY profile write was denied (both "Complete your profile"
-- and Settings → Profile save failed).
--
-- Fix: allow an authenticated user to INSERT only their own profile row
-- (id = auth.uid()). SELECT + UPDATE policies are already own-row scoped, so a
-- user can still only read/update their own profile. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert to authenticated
  with check (id = auth.uid());
