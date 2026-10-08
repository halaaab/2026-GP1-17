-- =========================================================
-- 0009 — Founders page: an admin edits a founder's details
-- Run once in Supabase: SQL Editor → paste → Run, after 0008.
-- (Safe to run again: it replaces what an earlier run created.)
--
-- A founder may only edit their OWN row (0001), so admins edit through this
-- function. It changes what the Founders page side panel shows: name,
-- username, user type, language and status. The email is the founder's
-- login and is not changed here.
--
-- The database rules still apply:
--   a username that is already used (by a founder or an admin) → error 23505
--   a username in the wrong format, or an unknown type           → error 23514
-- From JS:
--   supabase.rpc('admin_update_founder', {
--     target_user_id, new_full_name, new_username, new_user_type, new_locale, new_status })
-- =========================================================

create or replace function public.admin_update_founder(
  target_user_id uuid,
  new_full_name  text,
  new_username   text,
  new_user_type  text,
  new_locale     text,
  new_status     text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can edit founder accounts';
  end if;
  if nullif(trim(new_full_name), '') is null then
    raise exception 'The name cannot be empty' using errcode = '23514';
  end if;

  update public.users
  set full_name = trim(new_full_name),
      username  = trim(new_username),
      user_type = new_user_type,
      locale    = new_locale,
      status    = new_status
  where user_id = target_user_id;

  if not found then
    raise exception 'No founder account found';
  end if;
end;
$$;

revoke execute on function public.admin_update_founder(uuid, text, text, text, text, text) from public, anon;
grant  execute on function public.admin_update_founder(uuid, text, text, text, text, text) to authenticated;
