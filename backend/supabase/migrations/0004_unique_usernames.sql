-- ---------------------------------------------------------
-- 0004 — Unique usernames
-- Run this once in the Supabase SQL Editor, after 0003.
--
-- Until now two people could have the same username, and a founder could
-- even pick the username of an admin. After this file:
--   * a username belongs to one account only ("Hala" and "hala" count as the same)
--   * a founder cannot take an admin's username
--   * a founder's username is 3 to 20 letters, numbers or underscores,
--     checked by the database itself and not only by the sign-up page
-- ---------------------------------------------------------


-- 1. Tidy the usernames that already exist, so the new rules can be switched on.

-- founders: replace characters that are not allowed with "_" (name.surname → name_surname)
update public.users
set username = rpad(left(regexp_replace(username, '[^A-Za-z0-9_]', '_', 'g'), 20), 3, '_')
where username !~ '^[A-Za-z0-9_]{3,20}$';

-- founders: when a username is used twice (or by an admin), the older account
-- keeps it and the other one gets a short ending, for example "hala_3f9a"
update public.users u
set username = left(u.username, 15) || '_' || left(u.user_id::text, 4)
where exists (
        select 1 from public.users other
        where lower(other.username) = lower(u.username)
          and (other.created_at, other.user_id) < (u.created_at, u.user_id)
      )
   or exists (
        select 1 from public.admins a where lower(a.username) = lower(u.username)
      );

-- admins: the same, among admins
update public.admins a
set username = a.username || '_' || left(a.admin_id::text, 4)
where exists (
        select 1 from public.admins other
        where lower(other.username) = lower(a.username)
          and (other.created_at, other.admin_id) < (a.created_at, a.admin_id)
      );


-- 2. The rules

-- one account per username, ignoring capital letters
create unique index if not exists users_username_unique  on public.users  (lower(username));
create unique index if not exists admins_username_unique on public.admins (lower(username));

-- what a founder's username may look like
alter table public.users drop constraint if exists users_username_format;
alter table public.users add constraint users_username_format
  check (username ~ '^[A-Za-z0-9_]{3,20}$');


-- 3. Is this username free? Answers only yes or no, and looks at founders AND admins.
--    The sign-up page asks this before the account exists, so visitors may call it.
--    From JS:  supabase.rpc('username_is_free', { wanted: 'hala' })
create or replace function public.username_is_free(wanted text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.users  where lower(username) = lower(wanted))
     and not exists (select 1 from public.admins where lower(username) = lower(wanted));
$$;

revoke execute on function public.username_is_free(text) from public;
grant  execute on function public.username_is_free(text) to anon, authenticated;


-- 4. A founder can never take an admin's username, also not by editing the profile later.
--    (Between founders, the unique index in step 2 already does this.)
create or replace function public.block_admin_usernames()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.admins where lower(username) = lower(new.username)) then
    -- 23505 is the database's code for "this value is already used"
    raise exception 'This username is already used' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists users_block_admin_usernames on public.users;
create trigger users_block_admin_usernames
  before insert or update of username on public.users
  for each row execute function public.block_admin_usernames();


-- 5. Sign-up: the row in users is created from what the sign-up page sent.
--    The username is cleaned first, and if somebody took it a moment ago the
--    account still gets created, with a short ending added to the username.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted text;
begin
  if new.raw_user_meta_data ? 'user_type' then
    wanted := coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1));
    wanted := rpad(left(regexp_replace(wanted, '[^A-Za-z0-9_]', '_', 'g'), 20), 3, '_');

    if not public.username_is_free(wanted) then
      wanted := left(wanted, 15) || '_' || left(new.id::text, 4);
    end if;

    insert into public.users (user_id, username, full_name, user_type, locale)
    values (
      new.id,
      wanted,
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
      new.raw_user_meta_data ->> 'user_type',
      case when new.raw_user_meta_data ->> 'locale' = 'en' then 'en' else 'ar' end
    );
  end if;
  return new;
end;
$$;
