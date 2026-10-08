-- =========================================================
-- 0004 — Admin console: Founders and Admins pages
-- Run once in Supabase: SQL Editor → paste → Run, after 0003.
-- (Safe to run again: it replaces what an earlier run created.)
--
-- Emails and last sign-in times live in auth.users, which the website
-- cannot read. These functions hand them to admins only, together with
-- the rows the two pages show. Every function checks is_admin(), so it
-- also needs the emailed code from the admin login (0003).
-- =========================================================


-- 1. Founders page: every founder with their email.
--    From JS:  supabase.rpc('admin_list_founders')
--    An older version may already exist with other columns; "create or replace"
--    cannot change the columns, so it is dropped first.
drop function if exists public.admin_list_founders();
create function public.admin_list_founders()
returns table (
  user_id                 uuid,
  full_name               text,
  username                text,
  email                   text,
  user_type               text,
  project_sector          text,
  current_business_sector text,
  field_of_study          text,
  locale                  text,
  status                  text,
  created_at              timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can list founders';
  end if;

  return query
    select u.user_id, u.full_name, u.username, a.email::text, u.user_type,
           u.project_sector, u.current_business_sector, u.field_of_study,
           u.locale, u.status, u.created_at
    from public.users u
    join auth.users a on a.id = u.user_id
    order by u.created_at desc;
end;
$$;

revoke execute on function public.admin_list_founders() from public, anon;
grant  execute on function public.admin_list_founders() to authenticated;


-- 2. Admins page: every admin with their email and last sign-in.
--    From JS:  supabase.rpc('admin_list_admins')
drop function if exists public.admin_list_admins();
create function public.admin_list_admins()
returns table (
  admin_id        uuid,
  full_name       text,
  username        text,
  email           text,
  created_at      timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can list admins';
  end if;

  return query
    select ad.admin_id, ad.full_name, ad.username, a.email::text, ad.created_at, a.last_sign_in_at
    from public.admins ad
    join auth.users a on a.id = ad.admin_id
    order by ad.created_at;
end;
$$;

revoke execute on function public.admin_list_admins() from public, anon;
grant  execute on function public.admin_list_admins() to authenticated;


-- 3. Founders page → "Delete account". Admins only, founders only.
--    Deleting the login account also deletes the users row (on delete cascade).
--    Admin accounts are never deleted here: the Darb team removes them.
--    From JS:  supabase.rpc('admin_delete_founder', { target_user_id: id })
create or replace function public.admin_delete_founder(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete founder accounts';
  end if;
  if not exists (select 1 from public.users where user_id = target_user_id) then
    raise exception 'No founder account found';
  end if;

  delete from auth.users where id = target_user_id;
end;
$$;

revoke execute on function public.admin_delete_founder(uuid) from public, anon;
grant  execute on function public.admin_delete_founder(uuid) to authenticated;
