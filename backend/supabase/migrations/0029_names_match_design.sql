-- =========================================================
-- 0029 — The database uses the names of the EER diagram and relational schema
-- Run once in Supabase: SQL Editor → paste → Run, after 0028.
-- (Run 0023 before it if it was never run: it gives back the usernames cut to 3 letters.)
--
--   users                    → founders
--   startup_ideas.user_id    → startup_ideas.founder_id
--   admins.admin_id          → admins.user_id
--   support_organisations    → support_organizations
--   regulatory_requirements.isic_sections / isic_divisions (lists)
--                            → the relations requirement_isic_sections and
--                              requirement_isic_divisions (one row per value, 1NF)
--
-- Renaming keeps every row, foreign key, policy, trigger and the founder_profiles
-- view working: PostgreSQL follows them by id, not by name. Only the functions,
-- whose code mentions the old names as text, are written again below.
-- The maintenance tables keep their admin_id column, as in the schema.
-- =========================================================


-- ---------------------------------------------------------
-- 1. Tables and columns
-- ---------------------------------------------------------
alter table public.users                 rename to founders;
alter table public.startup_ideas         rename column user_id  to founder_id;
alter table public.admins                rename column admin_id to user_id;
alter table public.support_organisations rename to support_organizations;

-- the names of keys, checks, indexes and triggers follow the new names too
alter table public.founders rename constraint users_pkey            to founders_pkey;
alter table public.founders rename constraint users_user_id_fkey    to founders_user_id_fkey;
alter table public.founders rename constraint users_locale_check    to founders_locale_check;
alter table public.founders rename constraint users_status_check    to founders_status_check;
alter table public.founders rename constraint users_username_format to founders_username_format;
alter index public.users_username_unique rename to founders_username_unique;
alter table public.startup_ideas rename constraint startup_ideas_user_id_fkey to startup_ideas_founder_id_fkey;
alter table public.admins rename constraint admins_admin_id_fkey to admins_user_id_fkey;
alter table public.support_organizations rename constraint support_organisations_pkey to support_organizations_pkey;

alter trigger users_set_updated_at          on public.founders rename to founders_set_updated_at;
alter trigger users_block_admin_usernames   on public.founders rename to founders_block_admin_usernames;
alter trigger support_organisations_set_updated_at     on public.support_organizations rename to support_organizations_set_updated_at;
alter trigger support_organisations_record_maintenance on public.support_organizations rename to support_organizations_record_maintenance;


-- ---------------------------------------------------------
-- 2. The ISIC lists become their own relations
-- ---------------------------------------------------------
create table public.requirement_isic_sections (
  requirement_id text not null references public.regulatory_requirements (requirement_id)
                           on delete cascade on update cascade,
  isic_section   text not null check (isic_section ~ '^([A-U]|ALL)$'),   -- a section letter, or ALL for every business
  primary key (requirement_id, isic_section)
);

create table public.requirement_isic_divisions (
  requirement_id text not null references public.regulatory_requirements (requirement_id)
                           on delete cascade on update cascade,
  isic_division  text not null check (isic_division ~ '^([0-9]{2}|ALL)$'), -- a 2-digit division, or ALL
  primary key (requirement_id, isic_division)
);

insert into public.requirement_isic_sections (requirement_id, isic_section)
  select distinct requirement_id, trim(s) from public.regulatory_requirements, unnest(isic_sections) s;
insert into public.requirement_isic_divisions (requirement_id, isic_division)
  select distinct requirement_id, trim(d) from public.regulatory_requirements, unnest(isic_divisions) d;

alter table public.regulatory_requirements
  drop column isic_sections,
  drop column isic_divisions;

-- same access as the requirements: everyone reads, only admins change
alter table public.requirement_isic_sections  enable row level security;
alter table public.requirement_isic_divisions enable row level security;

create policy "everyone reads requirement sections"   on public.requirement_isic_sections  for select using (true);
create policy "admins add requirement sections"       on public.requirement_isic_sections  for insert with check ((select public.is_admin()));
create policy "admins delete requirement sections"    on public.requirement_isic_sections  for delete using ((select public.is_admin()));
create policy "everyone reads requirement divisions"  on public.requirement_isic_divisions for select using (true);
create policy "admins add requirement divisions"      on public.requirement_isic_divisions for insert with check ((select public.is_admin()));
create policy "admins delete requirement divisions"   on public.requirement_isic_divisions for delete using ((select public.is_admin()));


-- ---------------------------------------------------------
-- 3. Functions whose code used the old names (same behaviour, new names)
-- ---------------------------------------------------------

create or replace function public.admin_delete_founder(target_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete founder accounts';
  end if;
  if not exists (select 1 from public.founders where user_id = target_user_id) then
    raise exception 'No founder account found';
  end if;

  delete from auth.users where id = target_user_id;
end;
$$;

-- the result keeps the name admin_id, which the Admin Management page reads
create or replace function public.admin_list_admins()
returns table(admin_id uuid, full_name text, username text, email text, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can list admins';
  end if;

  return query
    select ad.user_id, ad.full_name, ad.username, a.email::text, ad.created_at, a.last_sign_in_at
    from public.admins ad
    join auth.users a on a.id = ad.user_id
    order by ad.created_at;
end;
$$;

create or replace function public.admin_list_founders()
returns table(user_id uuid, full_name text, username text, email text, user_type text, region text,
              field_of_study text, education_level text, has_prior_venture boolean, project_sector text,
              project_stage text, current_business_sector text, business_age text, business_size text,
              investor_type text, locale text, status text, created_at timestamptz, assessments_count bigint,
              has_idea boolean, finished_assessment boolean, came_back boolean)
language plpgsql stable security definer set search_path = '' as $$
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
             where idea.founder_id = f.user_id) as assessments_count,
           exists (select 1 from public.startup_ideas idea
                    where idea.founder_id = f.user_id) as has_idea,
           exists (select 1
                     from public.assessments ass
                     join public.startup_ideas idea on idea.idea_id = ass.idea_id
                    where idea.founder_id = f.user_id
                      and ass.completed_at is not null) as finished_assessment,
           (a.last_sign_in_at >= f.created_at + interval '1 day'
            or exists (select 1 from public.startup_ideas idea
                        where idea.founder_id = f.user_id
                          and idea.created_at >= f.created_at + interval '1 day')
           ) is true as came_back
    from public.founder_profiles f
    join auth.users a on a.id = f.user_id
    order by f.created_at desc;
end;
$$;

create or replace function public.admin_update_founder(target_user_id uuid, new_full_name text, new_username text,
                                                       new_user_type text, new_locale text, new_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can edit founder accounts';
  end if;
  if nullif(trim(new_full_name), '') is null then
    raise exception 'The name cannot be empty' using errcode = '23514';
  end if;

  update public.founders
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

-- sign-up (with the username fix of 0023: only names shorter than 3 letters are padded)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  wanted text;
  chosen text := new.raw_user_meta_data ->> 'user_type';
begin
  if new.raw_user_meta_data ? 'user_type' then
    wanted := coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1));
    wanted := left(regexp_replace(wanted, '[^A-Za-z0-9_]', '_', 'g'), 20);
    if length(wanted) < 3 then
      wanted := rpad(wanted, 3, '_');
    end if;

    if not public.username_is_free(wanted) then
      wanted := left(wanted, 15) || '_' || left(new.id::text, 4);
    end if;

    insert into public.founders (user_id, username, full_name, locale)
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

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.founders where user_id = (select auth.uid()) and status = 'active'
  );
$$;

create or replace function public.is_admin_account()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admins where user_id = (select auth.uid())
  );
$$;

create or replace function public.make_admin(target_email text, admin_full_name text, admin_username text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target_id uuid;
begin
  select id into target_id from auth.users where lower(email) = lower(target_email);
  if target_id is null then
    raise exception 'No account found with email %', target_email;
  end if;

  insert into public.admins (user_id, username, full_name)
  values (target_id, admin_username, admin_full_name)
  on conflict (user_id) do nothing;

  -- an account is either a founder or an admin, never both
  delete from public.founders where user_id = target_id;
end;
$$;

create or replace function public.owns_assessment(target_assessment_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.assessments a
    join public.startup_ideas i on i.idea_id = a.idea_id
    where a.assessment_id = target_assessment_id and i.founder_id = (select auth.uid())
  );
$$;

create or replace function public.owns_idea(target_idea_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.startup_ideas
    where idea_id = target_idea_id and founder_id = (select auth.uid())
  );
$$;

create or replace function public.record_maintenance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  editor uuid := (select auth.uid());
begin
  -- only admins count (imports and the SQL Editor have no signed-in admin)
  if editor is null or not exists (select 1 from public.admins where user_id = editor) then
    return new;
  end if;

  if tg_table_name = 'startups' then
    insert into public.startup_maintenance (admin_id, startup_id)
    values (editor, new.startup_id) on conflict do nothing;
  elsif tg_table_name = 'regulatory_requirements' then
    insert into public.requirement_maintenance (admin_id, requirement_id)
    values (editor, new.requirement_id) on conflict do nothing;
  elsif tg_table_name = 'support_organizations' then
    insert into public.organization_maintenance (admin_id, support_org_id)
    values (editor, new.support_org_id) on conflict do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.set_founder_type(target_user_id uuid, new_type text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if target_user_id <> (select auth.uid()) and not public.is_admin() then
    raise exception 'You can only change your own type';
  end if;
  if new_type is not null and new_type not in ('student', 'entrepreneur', 'business_owner', 'investor') then
    raise exception 'Unknown founder type' using errcode = '23514';
  end if;
  if not exists (select 1 from public.founders where user_id = target_user_id) then
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

create or replace function public.set_user_status(target_user_id uuid, new_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change account status';
  end if;
  if new_status not in ('active', 'deactivated') then
    raise exception 'Status must be active or deactivated';
  end if;

  update public.founders set status = new_status where user_id = target_user_id;
end;
$$;

create or replace function public.username_is_free(wanted text)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.founders where lower(username) = lower(wanted))
     and not exists (select 1 from public.admins   where lower(username) = lower(wanted));
$$;
