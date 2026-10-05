-- ---------------------------------------------------------
-- 1. Tables (columns exactly as in the data dictionary)
-- ---------------------------------------------------------

create table public.users (
  user_id                   uuid primary key references auth.users (id) on delete cascade,
  username                  text not null,
  full_name                 text not null,
  phone                     text,
  user_type                 text not null
                              check (user_type in ('student', 'entrepreneur', 'business_owner', 'investor')),
  locale                    text not null default 'ar' check (locale in ('ar', 'en')),
  country_code              text not null default 'SA',
  region                    text,
  city                      text,
  education_level           text
                              check (education_level in ('high_school', 'diploma', 'bachelor', 'master', 'phd')),
  field_of_study            text,
  prior_ventures_count      integer check (prior_ventures_count >= 0),
  years_business_experience integer check (years_business_experience >= 0),
  current_business_sector   text,
  current_business_years    integer check (current_business_years >= 0),
  organisation_name         text,
  status                    text not null default 'active' check (status in ('active', 'deactivated')),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz
);

create table public.admins (
  admin_id   uuid primary key references auth.users (id) on delete cascade,
  username   text not null,
  full_name  text not null,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Turn on Row Level Security: from now on, NOTHING can be read or
-- changed from the website unless a policy below allows it.
alter table public.users  enable row level security;
alter table public.admins enable row level security;

-- "Automatically expose new tables" is OFF in this project, so the website
-- gets NO access unless granted here. Logged-in accounts may read
-- (RLS below decides WHICH rows); visitors who are not logged in get nothing.
revoke all on public.users  from anon, authenticated;
revoke all on public.admins from anon, authenticated;
grant select on public.users  to authenticated;
grant select on public.admins to authenticated;


-- ---------------------------------------------------------
-- 2. Keep updated_at current automatically
-- ---------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger admins_set_updated_at
  before update on public.admins
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------
-- 3. Sign-up → create the founder's row in users
-- ---------------------------------------------------------
-- The sign-up page sends full_name, username, user_type and locale.
-- Accounts created by the Darb team in the dashboard do not send
-- user_type, so they get no users row (they become admins, step 6).

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.raw_user_meta_data ? 'user_type' then
    insert into public.users (user_id, username, full_name, user_type, locale)
    values (
      new.id,
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1)),
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
      new.raw_user_meta_data ->> 'user_type',
      case when new.raw_user_meta_data ->> 'locale' = 'en' then 'en' else 'ar' end
    );
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------
-- 4. Helpers used by the security rules (now and in later tables)
-- ---------------------------------------------------------

-- Is the logged-in account an admin?
create function public.is_admin()
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

-- Is the logged-in account an ACTIVE founder? (use in policies of later tables)
create function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users where user_id = (select auth.uid()) and status = 'active'
  );
$$;


revoke execute on function public.is_admin()       from public, anon;
revoke execute on function public.is_active_user() from public, anon;
grant  execute on function public.is_admin()       to authenticated;
grant  execute on function public.is_active_user() to authenticated;


-- ---------------------------------------------------------
-- 5. Security rules (RLS policies)
-- ---------------------------------------------------------

-- users: a founder sees only their own row; admins see everyone
create policy "founder reads own row, admins read all"
  on public.users for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- users: a logged-in account with no row yet (Google sign-up) creates its OWN
-- row once, on the complete-profile page. Admins cannot, and status is not in
-- the column list, so it always starts as 'active'.
create policy "founder creates own row"
  on public.users for insert to authenticated
  with check (user_id = (select auth.uid()) and not public.is_admin());

grant insert (
  user_id, username, full_name, phone, user_type, locale, country_code, region, city,
  education_level, field_of_study, prior_ventures_count, years_business_experience,
  current_business_sector, current_business_years, organisation_name
) on public.users to authenticated;

-- users: a founder edits only their own row
create policy "founder updates own row"
  on public.users for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ...and only these columns. status (active / deactivated) is NOT in the list,
-- so a founder can never re-activate themselves.
revoke update on public.users from authenticated;
grant update (
  username, full_name, phone, user_type, locale, country_code, region, city,
  education_level, field_of_study, prior_ventures_count, years_business_experience,
  current_business_sector, current_business_years, organisation_name
) on public.users to authenticated;

-- admins: only admins can see the admins list
create policy "admins read admins"
  on public.admins for select to authenticated
  using (public.is_admin());

-- admins: an admin edits only their own row (name, username, phone)
create policy "admin updates own row"
  on public.admins for update to authenticated
  using (admin_id = (select auth.uid()))
  with check (admin_id = (select auth.uid()));

revoke update on public.admins from authenticated;
grant update (username, full_name, phone) on public.admins to authenticated;

-- admins has no insert or delete policy: admins are created only by
-- make_admin() in the SQL Editor. users has no delete policy: a founder's row
-- is removed only together with the account (delete_my_account).


-- ---------------------------------------------------------
-- 6. Actions (functions the website or the team can call)
-- ---------------------------------------------------------

-- 6a. Make an account an admin. SQL Editor ONLY (not callable from the website).
--     The account must already exist (Authentication → Users → Add user).
--     Example:  select public.make_admin('name@ksu.edu.sa', 'Full Name', 'username');
create function public.make_admin(target_email text, admin_full_name text, admin_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
begin
  select id into target_id from auth.users where lower(email) = lower(target_email);
  if target_id is null then
    raise exception 'No account found with email %', target_email;
  end if;

  insert into public.admins (admin_id, username, full_name)
  values (target_id, admin_username, admin_full_name)
  on conflict (admin_id) do nothing;

  -- an account is either a founder or an admin, never both
  delete from public.users where user_id = target_id;
end;
$$;

revoke execute on function public.make_admin(text, text, text) from public, anon, authenticated;


-- 6b. Activate / deactivate a founder. Admins only (Founder management page).
--     From JS:  supabase.rpc('set_user_status', { target_user_id: id, new_status: 'deactivated' })
create function public.set_user_status(target_user_id uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change account status';
  end if;
  if new_status not in ('active', 'deactivated') then
    raise exception 'Status must be active or deactivated';
  end if;

  update public.users set status = new_status where user_id = target_user_id;
end;
$$;

revoke execute on function public.set_user_status(uuid, text) from public, anon;
grant execute on function public.set_user_status(uuid, text) to authenticated;


-- 6c. A founder deletes their own account (Profile page → delete-account pop-up).
--     Deleting the login account also deletes the users row (on delete cascade).
--     From JS:  supabase.rpc('delete_my_account')
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not logged in';
  end if;
  if public.is_admin() then
    raise exception 'Admin accounts are removed by the Darb team';
  end if;

  delete from auth.users where id = (select auth.uid());
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;