-- =========================================================
-- Two-step sign-in for admins
-- Run once in Supabase: SQL Editor → paste → Run.
--
-- An admin signs in with a password and then a 6-digit code from an
-- authenticator app. The website already asks for the code; this file makes
-- the DATABASE ask for it too, so admin data stays closed to anyone who has
-- only the password.
--
-- Supabase marks a session "aal1" after the password and "aal2" after the code.
-- =========================================================


-- 1. Is the logged-in account an admin account? (password alone is enough)
--    The admin login page uses this to know it should ask for the code.
create or replace function public.is_admin_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins where admin_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_admin_account() from public, anon;
grant  execute on function public.is_admin_account() to authenticated;


-- 2. is_admin() now also needs the code step.
--    Every security rule that uses is_admin() (now and in later tables)
--    gets the stronger check automatically.
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


-- 3. Two places must keep blocking admin accounts even before the code step,
--    so they use is_admin_account() instead.

-- an admin account can never create a founder row for itself
drop policy "founder creates own row" on public.users;
create policy "founder creates own row"
  on public.users for insert to authenticated
  with check (user_id = (select auth.uid()) and not public.is_admin_account());

-- an admin account can never delete itself from the website
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not logged in';
  end if;
  if public.is_admin_account() then
    raise exception 'Admin accounts are removed by the Darb team';
  end if;

  delete from auth.users where id = (select auth.uid());
end;
$$;


-- ---------------------------------------------------------
-- If an admin loses their phone
-- ---------------------------------------------------------
-- Run this in the SQL Editor (change the email). At their next sign-in
-- they are shown the QR code again and connect the new phone.
--
--   delete from auth.mfa_factors
--   where user_id = (select id from auth.users where lower(email) = lower('name@ksu.edu.sa'));
