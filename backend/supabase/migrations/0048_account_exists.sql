-- =========================================================
-- 0048 — "This account doesn't exist" on the login page (Member 1, 28 Nov 2026)
-- Run once in Supabase: SQL Editor → paste → Run, after 0047. (Safe to run again.)
--
-- Supabase answers "Invalid login credentials" both for a wrong password and for an email with no account (or a
-- deleted one), so the founder could not tell them apart. The login page asks this function after a failed sign-in:
-- when no account has the email, it says "This account doesn't exist" instead of "The email or password is not correct".
--
--   public.account_exists(email text) → boolean
--
-- It returns only true or false, never any data of the account. The emails are in auth.users, which the website
-- cannot read, so the function runs with its owner's rights (security definer) and looks at that one column only.
-- Decided by Hala: telling founders the account does not exist is worth more than hiding which emails are registered.
-- =========================================================

create or replace function public.account_exists(email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users u where lower(u.email) = lower(trim(account_exists.email)));
$$;

comment on function public.account_exists(text) is
  'True when an account has this email. Used by the login page to say "This account doesn''t exist". Returns no other data.';

revoke all on function public.account_exists(text) from public;
grant execute on function public.account_exists(text) to anon, authenticated;
