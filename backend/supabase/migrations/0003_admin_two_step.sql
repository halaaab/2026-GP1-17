-- =========================================================
-- Two-step sign-in for admins
-- Run once in Supabase: SQL Editor → paste → Run.
-- (Safe to run again: it replaces what an earlier run created.)
--
-- An admin signs in with a password and then a 6-digit code that Darb sends
-- to their email. The website already asks for the code; this file makes the
-- DATABASE ask for it too, so admin data stays closed to anyone who has only
-- the password.
--
-- Supabase writes into every session HOW the person signed in:
-- "password" after the password, "otp" after a code from an email.
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


-- 2. is_admin() now also needs the emailed code.
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
     and exists (
       select 1
       from jsonb_array_elements(coalesce((select auth.jwt()) -> 'amr', '[]'::jsonb)) as sign_in
       where sign_in ->> 'method' in ('otp', 'magiclink')
     );
$$;


-- 3. Two places must keep blocking admin accounts even before the code is entered,
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
