-- =========================================================
-- 0043 — Release 1 data model in first and third normal form
-- Run once in Supabase: SQL Editor → paste → Run, after 0042.
--
-- 1NF (one value in each cell): lists written inside one text cell become relations,
--     one row per value, like the other multivalued attributes:
--       startups.sector                          → startup_sectors
--       startups.tags                            → startup_tags
--       support_organizations.sector, sector_ar  → organization_sectors
--       support_organizations.services_support(_ar) → organization_services
--     display_order keeps the order the website shows them in.
-- 3NF (no attribute depends on another non-key attribute): removed, and worked out when shown:
--       assessments.band, assessments.risk_level        (decided by fis_score)
--       startups.isic_section, startup_ideas.isic_section (decided by the division)
--       market_indicators.economic_activity_name_en/_ar  (decided by the activity code)
-- Also: the launch location is kept once (startup_ideas.city, region): the empty copies on
-- assessments are removed; and a what-if no longer stores a link to the assessment it changes.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1. startup_sectors and startup_tags
-- ---------------------------------------------------------
create table public.startup_sectors (
  startup_id    text not null references public.startups (startup_id) on delete cascade on update cascade,
  sector        text not null check (length(trim(sector)) > 0),
  display_order integer not null check (display_order >= 1),
  primary key (startup_id, sector)
);
create table public.startup_tags (
  startup_id    text not null references public.startups (startup_id) on delete cascade on update cascade,
  tag           text not null check (length(trim(tag)) > 0),
  display_order integer not null check (display_order >= 1),
  primary key (startup_id, tag)
);

-- sectors are separated by ";" (a sector name can contain a comma), tags by ","
insert into public.startup_sectors (startup_id, sector, display_order)
  select startup_id, value, min(n)::integer
  from (select startup_id, trim(s) value, n from public.startups, regexp_split_to_table(sector, ';') with ordinality as t(s, n)) x
  where value <> '' group by startup_id, value;
insert into public.startup_tags (startup_id, tag, display_order)
  select startup_id, value, min(n)::integer
  from (select startup_id, trim(s) value, n from public.startups, regexp_split_to_table(tags, ',') with ordinality as t(s, n)) x
  where value <> '' group by startup_id, value;

alter table public.startups drop column sector, drop column tags;


-- ---------------------------------------------------------
-- 2. organization_sectors and organization_services (English with its Arabic)
-- ---------------------------------------------------------
-- two programs whose English and Arabic sector lists did not have the same parts
update public.support_organizations set sector = 'All sectors'
  where name = 'TAQADAM Accelerator' and sector = 'All sectors / Industry-agnostic';
update public.support_organizations set sector = 'Biotechnology, All industries, Life Sciences & Health Innovation'
  where name = 'gener8tor Saudi Arabia Accelerator';

create table public.organization_sectors (
  support_org_id uuid not null references public.support_organizations (support_org_id) on delete cascade,
  sector         text not null check (length(trim(sector)) > 0),
  sector_ar      text,
  display_order  integer not null check (display_order >= 1),
  primary key (support_org_id, sector)
);
create table public.organization_services (
  support_org_id uuid not null references public.support_organizations (support_org_id) on delete cascade,
  service        text not null check (length(trim(service)) > 0),
  service_ar     text,
  display_order  integer not null check (display_order >= 1),
  primary key (support_org_id, service)
);

-- sectors: parts separated by "," ";" or "/" (Arabic "،" "؛"), English and Arabic paired by position
insert into public.organization_sectors (support_org_id, sector, sector_ar, display_order)
  select o.support_org_id, trim(en.v), nullif(trim(ar.v), ''), en.n::integer
  from public.support_organizations o
  cross join lateral regexp_split_to_table(o.sector, '[,;/]') with ordinality as en(v, n)
  left join lateral regexp_split_to_table(coalesce(o.sector_ar, ''), '[,;/،؛]') with ordinality as ar(v, n) on ar.n = en.n
  where trim(en.v) <> ''
  on conflict do nothing;

-- services: split on ";" when the cell has one, otherwise on "," outside brackets (as the website did)
insert into public.organization_services (support_org_id, service, service_ar, display_order)
  select o.support_org_id,
         regexp_replace(regexp_replace(trim(en.v), '^and\s+', '', 'i'), '\.$', ''),
         nullif(regexp_replace(trim(ar.v), '\.$', ''), ''),
         en.n::integer
  from public.support_organizations o
  cross join lateral regexp_split_to_table(o.services_support,
       case when o.services_support ~ ';' then ';' else ',(?![^(]*\))' end) with ordinality as en(v, n)
  left join lateral regexp_split_to_table(coalesce(o.services_support_ar, ''),
       case when o.services_support_ar ~ '[;؛]' then '[;؛]' else '[,،](?![^(]*\))' end) with ordinality as ar(v, n) on ar.n = en.n
  where trim(en.v) <> ''
  on conflict do nothing;

alter table public.support_organizations
  drop column sector, drop column sector_ar, drop column services_support, drop column services_support_ar;


-- the four list relations: everyone reads, only admins change (like startups and support_organizations)
do $$
declare t text;
begin
  foreach t in array array['startup_sectors', 'startup_tags', 'organization_sectors', 'organization_services'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "everyone reads %s" on public.%I for select using (true)', t, t);
    execute format('create policy "admins add %s" on public.%I for insert with check ((select public.is_admin()))', t, t);
    execute format('create policy "admins delete %s" on public.%I for delete using ((select public.is_admin()))', t, t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, delete on public.%I to authenticated', t);
  end loop;
end;
$$;


-- ---------------------------------------------------------
-- 3. Attributes decided by another attribute (3NF)
-- ---------------------------------------------------------
alter table public.assessments drop column band, drop column risk_level;
alter table public.startups drop column isic_section;
alter table public.startup_ideas drop column isic_section;
alter table public.market_indicators drop column economic_activity_name_en, drop column economic_activity_name_ar;


-- ---------------------------------------------------------
-- 4. One launch location, and no hidden link between assessments
-- ---------------------------------------------------------
alter table public.assessments drop column city, drop column region;

update public.assessments
set confirmed_inputs = confirmed_inputs - 'what_if_of'
where confirmed_inputs ? 'what_if_of';

commit;
