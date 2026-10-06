-- =========================================================
-- 0008 — Put is_admin() back to the version from 0003
-- Run once in Supabase: SQL Editor → paste → Run.
-- (Safe to run again.)
--
-- The is_admin() saved in Supabase had been changed outside these files and
-- answered "no" for admins who had entered the emailed code, so the Founders
-- and Admins pages could not load. This is the same function as in 0003:
-- an admin account that signed in with the emailed code ("otp").
-- =========================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin_account()
     and exists (
       select 1
       from jsonb_array_elements(coalesce((select auth.jwt()) -> 'amr', '[]'::jsonb)) as sign_in
       where sign_in ->> 'method' in ('otp', 'magiclink')
     );
$$;

revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;
