-- =========================================================
-- 0025 — "maintains" is 1..*, and founders lose unused columns
-- Run once in Supabase: SQL Editor → paste → Run, after 0024.
--
-- 1. In the EER diagram, Admin maintains Startup / RegulatoryRequirement /
--    SupportOrganization with 1..* on the Admin side: every record is
--    maintained by at least one admin, and there is no upper limit.
--    0024 kept at most 4 admins per record; that limit is removed.
-- 2. The records that were imported had no admin. They are linked to every
--    admin who exists now, the team that maintains the imported data.
-- 3. users (the Founder relation) drops four old columns that nothing uses
--    and that are not in the EER diagram.
-- =========================================================


-- 1. Record every admin who adds or edits a record (same as 0024, without the limit of 4)
create or replace function public.record_maintenance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  editor uuid := (select auth.uid());
begin
  -- only admins count (imports and the SQL Editor have no signed-in admin)
  if editor is null or not exists (select 1 from public.admins where admin_id = editor) then
    return new;
  end if;

  if tg_table_name = 'startups' then
    insert into public.startup_maintenance (admin_id, startup_id)
    values (editor, new.startup_id) on conflict do nothing;
  elsif tg_table_name = 'regulatory_requirements' then
    insert into public.requirement_maintenance (admin_id, requirement_id)
    values (editor, new.requirement_id) on conflict do nothing;
  elsif tg_table_name = 'support_organisations' then
    insert into public.organization_maintenance (admin_id, support_org_id)
    values (editor, new.support_org_id) on conflict do nothing;
  end if;
  return new;
end;
$$;


-- 2. Every record gets at least one admin: imported records go to all current admins
insert into public.startup_maintenance (admin_id, startup_id)
  select a.admin_id, s.startup_id from public.admins a cross join public.startups s
  on conflict do nothing;

insert into public.requirement_maintenance (admin_id, requirement_id)
  select a.admin_id, r.requirement_id from public.admins a cross join public.regulatory_requirements r
  on conflict do nothing;

insert into public.organization_maintenance (admin_id, support_org_id)
  select a.admin_id, o.support_org_id from public.admins a cross join public.support_organisations o
  on conflict do nothing;


-- 3. Old founder columns that nothing reads or writes
alter table public.users
  drop column city,
  drop column prior_ventures_count,
  drop column years_business_experience,
  drop column current_business_years;
