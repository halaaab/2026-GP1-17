-- =========================================================
-- 0011 — Admin second step: back to the authenticator app
-- Run once in Supabase: SQL Editor → paste → Run.
-- (Safe to run again.)
--
-- An admin signs in with a password and then a 6-digit code from an
-- authenticator app on their phone (Google Authenticator, Microsoft
-- Authenticator...). The first time, the admin login page shows a QR code
-- to connect the app. This replaces the emailed code of 0003 and 0008.
--
-- Supabase marks a session "aal1" after the password and "aal2" after the
-- code from the app. is_admin() now asks for "aal2", so admin data stays
-- closed to anyone who has only the password.
--
-- Before running: in Supabase, Authentication → Multi-Factor → make sure
-- TOTP (App Authenticator) is enabled.
-- =========================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin_account()
     and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
$$;

revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;


-- ---------------------------------------------------------
-- If an admin loses their phone
-- ---------------------------------------------------------
-- Run this in the SQL Editor (change the email). At their next sign-in
-- they are shown the QR code again and connect the new phone.
--
--   delete from auth.mfa_factors
--   where user_id = (select id from auth.users where lower(email) = lower('name@ksu.edu.sa'));
