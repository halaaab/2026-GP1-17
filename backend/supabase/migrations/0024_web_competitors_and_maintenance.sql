-- =========================================================
-- 0024 — Web competitors, and which admin maintains which record
-- Run once in Supabase: SQL Editor → paste → Run, after 0023.
--
-- Makes the database match the EER diagram and relational schema:
--
-- Part A. SimilarStartupResult "referenced in" Startup is 0..1.
--   A competitor found in Darb's own startups table points to it (startup_id).
--   A competitor found on the web has no Startup, so it keeps its own
--   name, description, website and source page instead.
--
-- Part B. Admin "maintains" Startup / RegulatoryRequirement / SupportOrganization
--   is many-to-many (0..4 admins per record, 0..* records per admin), so each
--   gets its own relation: startup_maintenance, requirement_maintenance,
--   organization_maintenance. A row is added by the database itself whenever
--   an admin adds or edits a record, so the admin pages do not have to.
--   The old created_by_admin_id columns are replaced by these tables.
-- =========================================================


-- ---------------------------------------------------------
-- Part A. similar_startup_results can hold web competitors
-- ---------------------------------------------------------

alter table public.similar_startup_results
  alter column startup_id drop not null,
  add column source_type     text not null default 'database'
                               check (source_type in ('database', 'web')),
  add column competitor_name text,
  add column description     text,
  add column website         text,
  add column source_url      text,     -- the page the web competitor was found and checked on
  add column similarities    text,
  add column differences     text;

-- A database competitor points to a startup; a web competitor has none, but has a name and a page
alter table public.similar_startup_results
  add constraint similar_startup_results_source_check check (
    (source_type = 'database' and startup_id is not null)
    or (source_type = 'web' and startup_id is null and competitor_name is not null and source_url is not null)
  );


-- ---------------------------------------------------------
-- Part B. The three maintenance relations
-- ---------------------------------------------------------

create table public.startup_maintenance (
  admin_id   uuid not null references public.admins (admin_id) on delete cascade,
  startup_id text not null references public.startups (startup_id) on delete cascade,
  primary key (admin_id, startup_id)
);

create table public.requirement_maintenance (
  admin_id       uuid not null references public.admins (admin_id) on delete cascade,
  requirement_id text not null references public.regulatory_requirements (requirement_id) on delete cascade,
  primary key (admin_id, requirement_id)
);

create table public.organization_maintenance (
  admin_id       uuid not null references public.admins (admin_id) on delete cascade,
  support_org_id uuid not null references public.support_organisations (support_org_id) on delete cascade,
  primary key (admin_id, support_org_id)
);

-- Who created a record so far becomes its first maintainer
insert into public.startup_maintenance (admin_id, startup_id)
  select created_by_admin_id, startup_id from public.startups where created_by_admin_id is not null;
insert into public.requirement_maintenance (admin_id, requirement_id)
  select created_by_admin_id, requirement_id from public.regulatory_requirements where created_by_admin_id is not null;
insert into public.organization_maintenance (admin_id, support_org_id)
  select created_by_admin_id, support_org_id from public.support_organisations where created_by_admin_id is not null;

-- Security: only admins can read these lists. Nobody writes them from the website:
-- the trigger below does it.
alter table public.startup_maintenance      enable row level security;
alter table public.requirement_maintenance  enable row level security;
alter table public.organization_maintenance enable row level security;

revoke all on public.startup_maintenance, public.requirement_maintenance, public.organization_maintenance from anon, authenticated;
grant select on public.startup_maintenance, public.requirement_maintenance, public.organization_maintenance to authenticated;

create policy "admins read" on public.startup_maintenance      for select to authenticated using (public.is_admin());
create policy "admins read" on public.requirement_maintenance  for select to authenticated using (public.is_admin());
create policy "admins read" on public.organization_maintenance for select to authenticated using (public.is_admin());


-- When an admin adds or edits a startup, requirement or support organisation,
-- remember that they maintain it. A record keeps at most 4 maintainers (0..4):
-- once it has 4, later editors are not added.
create function public.record_maintenance()
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
    if (select count(*) from public.startup_maintenance where startup_id = new.startup_id) < 4 then
      insert into public.startup_maintenance (admin_id, startup_id)
      values (editor, new.startup_id) on conflict do nothing;
    end if;
  elsif tg_table_name = 'regulatory_requirements' then
    if (select count(*) from public.requirement_maintenance where requirement_id = new.requirement_id) < 4 then
      insert into public.requirement_maintenance (admin_id, requirement_id)
      values (editor, new.requirement_id) on conflict do nothing;
    end if;
  elsif tg_table_name = 'support_organisations' then
    if (select count(*) from public.organization_maintenance where support_org_id = new.support_org_id) < 4 then
      insert into public.organization_maintenance (admin_id, support_org_id)
      values (editor, new.support_org_id) on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

create trigger startups_record_maintenance
  after insert or update on public.startups
  for each row execute function public.record_maintenance();
create trigger regulatory_requirements_record_maintenance
  after insert or update on public.regulatory_requirements
  for each row execute function public.record_maintenance();
create trigger support_organisations_record_maintenance
  after insert or update on public.support_organisations
  for each row execute function public.record_maintenance();


-- The maintenance tables replace the old "created by" columns
alter table public.startups                drop column created_by_admin_id;
alter table public.regulatory_requirements drop column created_by_admin_id;
alter table public.support_organisations   drop column created_by_admin_id;
