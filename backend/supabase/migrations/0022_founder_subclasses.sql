-- =========================================================
-- 0022 — Founder subclasses
-- Run once in Supabase: SQL Editor → paste → Run, after 0021.
--
-- The EER diagram:
--   User  → { Founder, Admin }                                     {Mandatory, Or}
--   Founder → { Student, Entrepreneur, BusinessOwner, Investor }   {Optional, Or}
--
-- How it is stored:
--   * User has no table of its own: founders live in public.users (the name is
--     kept so nothing else breaks) and admins in public.admins.
--   * Each founder subclass gets its own table with only its own answers, and
--     its user_id is both its primary key and a foreign key to users.
--     So no row is full of empty columns.
--   * Optional: a founder with no row in any subclass table is "just a founder".
--   * Or: a founder can have a row in at most ONE subclass table (step 3).
--   * The founder's type is not stored: the view founder_profiles (step 6)
--     works it out from the subclass table the founder is in.
--   * The "other" category is removed. Those founders become just founders.
-- =========================================================


-- ---------------------------------------------------------
-- 1. The four subclass tables
-- ---------------------------------------------------------

create table public.students (
  user_id           uuid primary key references public.users (user_id) on delete cascade,
  education_level   text,
  field_of_study    text,
  has_prior_venture boolean,
  project_sector    text,
  project_stage     text
);

create table public.entrepreneurs (
  user_id        uuid primary key references public.users (user_id) on delete cascade,
  project_sector text,
  project_stage  text
);

create table public.business_owners (
  user_id                 uuid primary key references public.users (user_id) on delete cascade,
  current_business_sector text,
  business_age            text,   -- lt1, 1_3, 4_5, gt5
  business_size           text    -- micro, small, medium, large
);

create table public.investors (
  user_id           uuid primary key references public.users (user_id) on delete cascade,
  organisation_name text,
  investor_type     text
);


-- ---------------------------------------------------------
-- 2. Move the answers that already exist into the new tables
-- ---------------------------------------------------------

insert into public.students (user_id, education_level, field_of_study, has_prior_venture, project_sector, project_stage)
  select user_id, education_level, field_of_study, has_prior_venture, project_sector, project_stage
  from public.users where user_type = 'student';

insert into public.entrepreneurs (user_id, project_sector, project_stage)
  select user_id, project_sector, project_stage
  from public.users where user_type = 'entrepreneur';

insert into public.business_owners (user_id, current_business_sector, business_age, business_size)
  select user_id, current_business_sector, business_age, business_size
  from public.users where user_type = 'business_owner';

insert into public.investors (user_id, organisation_name, investor_type)
  select user_id, organisation_name, investor_type
  from public.users where user_type = 'investor';

-- founders with user_type 'other' get no subclass row: they are just founders now


-- ---------------------------------------------------------
-- 3. "Or": a founder belongs to at most one subclass
-- ---------------------------------------------------------

-- The founder's type, worked out from the subclass table they are in (null = just a founder)
create function public.founder_type(target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.students        where user_id = target_user_id) then 'student'
    when exists (select 1 from public.entrepreneurs   where user_id = target_user_id) then 'entrepreneur'
    when exists (select 1 from public.business_owners where user_id = target_user_id) then 'business_owner'
    when exists (select 1 from public.investors       where user_id = target_user_id) then 'investor'
  end;
$$;

revoke execute on function public.founder_type(uuid) from public, anon;
grant  execute on function public.founder_type(uuid) to authenticated;

-- Runs before a row is added to any subclass table
create function public.block_second_subclass()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.founder_type(new.user_id) is not null then
    raise exception 'A founder can belong to only one type' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger students_one_type        before insert on public.students        for each row execute function public.block_second_subclass();
create trigger entrepreneurs_one_type   before insert on public.entrepreneurs   for each row execute function public.block_second_subclass();
create trigger business_owners_one_type before insert on public.business_owners for each row execute function public.block_second_subclass();
create trigger investors_one_type       before insert on public.investors       for each row execute function public.block_second_subclass();


-- ---------------------------------------------------------
-- 4. Security rules for the subclass tables
--    The same as users: a founder reads, adds and edits only their own row;
--    admins read every row. Changing type goes through set_founder_type (step 5).
-- ---------------------------------------------------------

do $$
declare
  subclass text;
begin
  foreach subclass in array array['students', 'entrepreneurs', 'business_owners', 'investors'] loop
    execute format('alter table public.%I enable row level security', subclass);
    execute format('revoke all on public.%I from anon, authenticated', subclass);
    execute format('grant select, insert, update on public.%I to authenticated', subclass);

    execute format($p$create policy "founder reads own row, admins read all" on public.%I
                     for select to authenticated
                     using (user_id = (select auth.uid()) or public.is_admin())$p$, subclass);

    execute format($p$create policy "founder creates own row" on public.%I
                     for insert to authenticated
                     with check (user_id = (select auth.uid()) and not public.is_admin_account())$p$, subclass);

    execute format($p$create policy "founder updates own row" on public.%I
                     for update to authenticated
                     using (user_id = (select auth.uid()))
                     with check (user_id = (select auth.uid()))$p$, subclass);
  end loop;
end;
$$;


-- ---------------------------------------------------------
-- 5. Change a founder's type: leave the old subclass, join the new one.
--    new_type is student, entrepreneur, business_owner, investor, or null (just a founder).
--    The answers of the old type are removed, because they belong to that type.
--    A founder may change their own type; an admin may change anyone's.
--    From JS:  supabase.rpc('set_founder_type', { target_user_id: id, new_type: 'student' })
-- ---------------------------------------------------------

create function public.set_founder_type(target_user_id uuid, new_type text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_user_id <> (select auth.uid()) and not public.is_admin() then
    raise exception 'You can only change your own type';
  end if;
  if new_type is not null and new_type not in ('student', 'entrepreneur', 'business_owner', 'investor') then
    raise exception 'Unknown founder type' using errcode = '23514';
  end if;
  if not exists (select 1 from public.users where user_id = target_user_id) then
    raise exception 'No founder account found';
  end if;

  -- nothing to do when the type stays the same (keeps the answers)
  if new_type is not distinct from public.founder_type(target_user_id) then
    return;
  end if;

  delete from public.students        where user_id = target_user_id;
  delete from public.entrepreneurs   where user_id = target_user_id;
  delete from public.business_owners where user_id = target_user_id;
  delete from public.investors       where user_id = target_user_id;

  case new_type
    when 'student'        then insert into public.students        (user_id) values (target_user_id);
    when 'entrepreneur'   then insert into public.entrepreneurs   (user_id) values (target_user_id);
    when 'business_owner' then insert into public.business_owners (user_id) values (target_user_id);
    when 'investor'       then insert into public.investors       (user_id) values (target_user_id);
    else null;   -- just a founder
  end case;
end;
$$;

revoke execute on function public.set_founder_type(uuid, text) from public, anon;
grant  execute on function public.set_founder_type(uuid, text) to authenticated;


-- ---------------------------------------------------------
-- 6. One place to READ a founder with their type and answers.
--    security_invoker = the security rules of the tables still apply,
--    so a founder sees only their own row and admins see everyone.
--    From JS:  supabase.from('founder_profiles').select('*')
-- ---------------------------------------------------------

create view public.founder_profiles
with (security_invoker = true)
as
select u.user_id, u.username, u.full_name, u.phone, u.locale, u.country_code, u.region,
       u.status, u.created_at, u.updated_at,
       case
         when s.user_id  is not null then 'student'
         when e.user_id  is not null then 'entrepreneur'
         when b.user_id  is not null then 'business_owner'
         when i.user_id  is not null then 'investor'
       end as user_type,                                   -- null = just a founder
       s.education_level, s.field_of_study, s.has_prior_venture,
       coalesce(s.project_sector, e.project_sector) as project_sector,
       coalesce(s.project_stage,  e.project_stage)  as project_stage,
       b.current_business_sector, b.business_age, b.business_size,
       i.organisation_name, i.investor_type
from public.users u
left join public.students        s on s.user_id = u.user_id
left join public.entrepreneurs   e on e.user_id = u.user_id
left join public.business_owners b on b.user_id = u.user_id
left join public.investors       i on i.user_id = u.user_id;

revoke all on public.founder_profiles from anon, authenticated;
grant select on public.founder_profiles to authenticated;


-- ---------------------------------------------------------
-- 7. Sign-up: create the users row, and the subclass row for the chosen type.
--    The sign-up page sends user_type: one of the four types, or 'none'.
--    (Same as 0004_unique_usernames, plus the subclass row.)
-- ---------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted text;
  chosen text := new.raw_user_meta_data ->> 'user_type';
begin
  if new.raw_user_meta_data ? 'user_type' then
    wanted := coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1));
    wanted := rpad(left(regexp_replace(wanted, '[^A-Za-z0-9_]', '_', 'g'), 20), 3, '_');

    if not public.username_is_free(wanted) then
      wanted := left(wanted, 15) || '_' || left(new.id::text, 4);
    end if;

    insert into public.users (user_id, username, full_name, locale)
    values (
      new.id,
      wanted,
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
      case when new.raw_user_meta_data ->> 'locale' = 'en' then 'en' else 'ar' end
    );

    case chosen
      when 'student'        then insert into public.students        (user_id) values (new.id);
      when 'entrepreneur'   then insert into public.entrepreneurs   (user_id) values (new.id);
      when 'business_owner' then insert into public.business_owners (user_id) values (new.id);
      when 'investor'       then insert into public.investors       (user_id) values (new.id);
      else null;   -- 'none': just a founder
    end case;
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------
-- 8. Founders page: an admin edits a founder (replaces 0009).
--    new_user_type may be null (just a founder).
-- ---------------------------------------------------------

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
      locale    = new_locale,
      status    = new_status
  where user_id = target_user_id;

  if not found then
    raise exception 'No founder account found';
  end if;

  perform public.set_founder_type(target_user_id, nullif(new_user_type, ''));
end;
$$;


-- ---------------------------------------------------------
-- 9. Founders page list (replaces 0017): read from founder_profiles.
--    status_description is gone with the "other" category.
-- ---------------------------------------------------------

drop function if exists public.admin_list_founders();

create function public.admin_list_founders()
returns table (
  user_id                 uuid,
  full_name               text,
  username                text,
  email                   text,
  user_type               text,
  region                  text,
  field_of_study          text,
  education_level         text,
  has_prior_venture       boolean,
  project_sector          text,
  project_stage           text,
  current_business_sector text,
  business_age            text,
  business_size           text,
  investor_type           text,
  locale                  text,
  status                  text,
  created_at              timestamptz,
  assessments_count       bigint,
  has_idea                boolean,
  finished_assessment     boolean,
  came_back               boolean
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
    select f.user_id, f.full_name, f.username, a.email::text, f.user_type, f.region,
           f.field_of_study, f.education_level, f.has_prior_venture,
           f.project_sector, f.project_stage,
           f.current_business_sector, f.business_age, f.business_size,
           f.investor_type,
           f.locale, f.status, f.created_at,
           (select count(*)
              from public.assessments ass
              join public.startup_ideas idea on idea.idea_id = ass.idea_id
             where idea.user_id = f.user_id) as assessments_count,
           exists (select 1 from public.startup_ideas idea
                    where idea.user_id = f.user_id) as has_idea,
           exists (select 1
                     from public.assessments ass
                     join public.startup_ideas idea on idea.idea_id = ass.idea_id
                    where idea.user_id = f.user_id
                      and ass.completed_at is not null) as finished_assessment,
           (a.last_sign_in_at >= f.created_at + interval '1 day'
            or exists (select 1 from public.startup_ideas idea
                        where idea.user_id = f.user_id
                          and idea.created_at >= f.created_at + interval '1 day')
           ) is true as came_back
    from public.founder_profiles f
    join auth.users a on a.id = f.user_id
    order by f.created_at desc;
end;
$$;

revoke execute on function public.admin_list_founders() from public, anon;
grant  execute on function public.admin_list_founders() to authenticated;


-- ---------------------------------------------------------
-- 10. users keeps only what every founder has.
--     The subclass answers now live in their own tables (step 1).
-- ---------------------------------------------------------

alter table public.users
  drop column user_type,
  drop column education_level,
  drop column field_of_study,
  drop column has_prior_venture,
  drop column project_sector,
  drop column project_stage,
  drop column current_business_sector,
  drop column business_age,
  drop column business_size,
  drop column organisation_name,
  drop column investor_type,
  drop column status_description;
