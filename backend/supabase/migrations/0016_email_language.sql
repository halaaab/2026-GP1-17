-- =========================================================
-- 0016 — The reset-password email in the language of the page
-- Run once in Supabase: SQL Editor → paste → Run, after 0015.
-- (Safe to run again.)
--
-- Supabase writes its emails in the language saved on the account
-- (user_metadata.locale, used by email-templates/reset-password.html).
-- Someone who forgot their password is not signed in, so the website cannot
-- change that language itself. The forgot-password page calls this function
-- just before asking for the email, with the page's language, so the email
-- starts in the language the person is reading.
--
-- It only ever writes 'en' or 'ar' into that one setting, and says nothing
-- back, so it cannot be used to find out whether an email has an account.
--
-- From JS:
--   await supabase.rpc('set_email_language', { target_email: email, language: 'en' });
-- =========================================================

create or replace function public.set_email_language(target_email text, language text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if language not in ('en', 'ar') then
    return;
  end if;

  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('locale', language)
  where lower(email) = lower(trim(target_email));
end;
$$;

revoke execute on function public.set_email_language(text, text) from public;
grant  execute on function public.set_email_language(text, text) to anon, authenticated;
