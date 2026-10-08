-- ---------------------------------------------------------
-- 0006 — Reference data tables
-- Run this once in the Supabase SQL Editor, after 0005.
--
-- The tables behind the three explorers and the assessment's Similar,
-- Market and Roadmap tabs. The columns follow the Excel files in datasets/:
--   startups                 datasets/idea-similarity          (sheet "Startups")
--   regulatory_requirements  datasets/regulatory-requirements  (sheet "Regulatory Master")
--   market_indicators        datasets/market-indicators        (sheet "Collection Template")
--   support_organisations    datasets/incubators-accelerators  (sheet "Data")
--
-- This file only creates the empty tables. To fill them:
--   1. run  backend/supabase/seed/reference_data.sql  in the SQL Editor
--   2. run  backend/supabase/seed/startups.sql  in the SQL Editor
--      (the 1,128 startups of startups.csv, with the sectors tidied for the filters)
-- ---------------------------------------------------------


-- ---------------------------------------------------------
-- 1. Startups (Startup Explorer and the Idea Similarity Engine)
-- ---------------------------------------------------------
create table public.startups (
  startup_id              text primary key,          -- ST_001, ST_002 ...
  startup_name            text not null,
  startup_description     text,
  sector                  text,
  target_market           text,                      -- B2B, B2C, B2G ...
  products_services       text,
  stage                   text,                      -- Seed, Series A ...
  region                  text,
  tags                    text,
  website                 text,
  ecosystemsa_profile_url text,
  logo                    text,
  description_source      text,
  country                 text,
  created_by_admin_id     uuid references public.admins (admin_id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz
);
-- The "embedding" column for semantic search is added with the similarity engine.


-- ---------------------------------------------------------
-- 2. Regulatory requirements (Regulatory Explorer and the Roadmap Agent)
-- ---------------------------------------------------------
create table public.regulatory_requirements (
  requirement_id           text primary key,         -- GEN-001, FOOD-004 ...
  sector                   text not null,            -- "All", or one or more sectors separated by ";"
  name_en                  text not null,
  name_ar                  text,
  authority                text,
  category                 text,
  applies_when             text,
  founder_trigger_fields   text,                     -- the founder answers that decide if it applies, separated by ";"
  business_stage           text,
  regulatory_status        text,                     -- Active or Announced
  mandatory                text,                     -- Required, Conditional, Optional, Required when in scope
  what_darb_should_surface text,                     -- what Darb tells the founder
  fees_thresholds          text,
  official_source_url      text,
  service_url              text,                     -- where the founder applies
  last_verified            date,
  notes                    text,
  created_by_admin_id      uuid references public.admins (admin_id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz
);


-- ---------------------------------------------------------
-- 3. Market indicators (Saudi Market Insights and the Survival Model)
--    One row for each economic activity (ISIC Rev.4 code) and year.
--    A blank value means the Atlas did not show one; it is never stored as 0.
-- ---------------------------------------------------------
create table public.market_indicators (
  record_id                      text primary key,
  economic_activity_code         text not null,
  economic_activity_name_en      text not null,
  economic_activity_name_ar      text,
  isic_level                     integer,
  darb_sector                    text not null,
  year                           integer not null,
  source_url                     text,
  collected_on                   date,
  enterprises_total              bigint,
  enterprises_micro              bigint,
  enterprises_small              bigint,
  enterprises_medium             bigint,
  enterprises_large              bigint,
  new_enterprises_total          bigint,
  new_enterprises_micro          bigint,
  new_enterprises_small          bigint,
  new_enterprises_medium         bigint,
  new_enterprises_large          bigint,
  enterprises_growth_pct         numeric,
  enterprises_growth_micro_pct   numeric,
  enterprises_growth_small_pct   numeric,
  enterprises_growth_medium_pct  numeric,
  enterprises_growth_large_pct   numeric,
  fast_growing_enterprises_total bigint,
  fast_growing_small             integer,
  fast_growing_medium            integer,
  fast_growing_large             integer,
  share_micro_pct                numeric,
  share_small_pct                numeric,
  share_medium_pct               numeric,
  share_large_pct                numeric,
  female_owned_enterprises       bigint,
  female_owned_pct               numeric,
  employees_total                bigint,
  employees_micro                bigint,
  employees_small                bigint,
  employees_medium               bigint,
  employees_large                bigint,
  employees_male                 bigint,
  employees_female               bigint,
  saudi_employee_pct             numeric,
  saudi_male_pct                 numeric,
  saudi_female_pct               numeric,
  pos_transaction_value_sar      numeric,
  pos_transaction_count          bigint,
  gdp_growth_pct                 numeric,
  inflation_pct                  numeric,
  saudi_unemployment_pct         numeric,
  macro_reference_period         text,
  employees_per_enterprise       numeric,
  new_enterprise_rate_pct        numeric,
  employees_growth_pct           numeric,
  pos_avg_ticket_sar             numeric,
  pos_value_growth_pct           numeric,
  size_count_check               text,
  record_status                  text,
  notes                          text
);

create index market_indicators_sector on public.market_indicators (darb_sector, year);


-- ---------------------------------------------------------
-- 4. Incubators and accelerators (Incubators & Accelerators Explorer)
-- ---------------------------------------------------------
create table public.support_organisations (
  support_org_id      uuid primary key default gen_random_uuid(),
  name                text not null,
  type                text,                          -- Incubator, Accelerator ...
  sector              text,
  location            text,
  description         text,
  target_stage        text,
  program_duration    text,
  services_support    text,
  funding_investment  text,
  eligibility         text,
  website             text,
  created_by_admin_id uuid references public.admins (admin_id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz
);


-- ---------------------------------------------------------
-- 5. Results of an assessment (written by the agents, later)
-- ---------------------------------------------------------

-- The startups the similarity engine returned for an assessment
create table public.similar_startup_results (
  result_id        bigint generated always as identity primary key,
  assessment_id    uuid not null references public.assessments (assessment_id) on delete cascade,
  startup_id       text not null references public.startups (startup_id) on delete cascade,
  similarity_score numeric not null check (similarity_score between 0 and 1),
  rank             integer not null
);

-- The ordered steps of an assessment's roadmap, from the Roadmap Agent
create table public.roadmap_steps (
  step_id         bigint generated always as identity primary key,
  assessment_id   uuid not null references public.assessments (assessment_id) on delete cascade,
  requirement_id  text not null references public.regulatory_requirements (requirement_id) on delete cascade,
  sequence_order  integer not null,
  applies_because text,
  is_satisfied    boolean not null default false
);

create trigger startups_set_updated_at
  before update on public.startups
  for each row execute function public.set_updated_at();
create trigger regulatory_requirements_set_updated_at
  before update on public.regulatory_requirements
  for each row execute function public.set_updated_at();
create trigger support_organisations_set_updated_at
  before update on public.support_organisations
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------
-- 6. Security rules
--    Reading: the three explorers are open to everyone, also before signing in.
--             Market indicators are for signed-in accounts.
--    Changing: admins only (the admin console's management pages).
-- ---------------------------------------------------------

alter table public.startups                enable row level security;
alter table public.regulatory_requirements enable row level security;
alter table public.market_indicators       enable row level security;
alter table public.support_organisations   enable row level security;
alter table public.similar_startup_results enable row level security;
alter table public.roadmap_steps           enable row level security;

revoke all on public.startups, public.regulatory_requirements, public.market_indicators,
              public.support_organisations, public.similar_startup_results, public.roadmap_steps
  from anon, authenticated;

-- reading
grant select on public.startups, public.regulatory_requirements, public.support_organisations to anon, authenticated;
grant select on public.market_indicators, public.similar_startup_results, public.roadmap_steps to authenticated;

create policy "everyone reads startups"     on public.startups                for select to anon, authenticated using (true);
create policy "everyone reads requirements" on public.regulatory_requirements for select to anon, authenticated using (true);
create policy "everyone reads support orgs" on public.support_organisations   for select to anon, authenticated using (true);
create policy "accounts read market data"   on public.market_indicators       for select to authenticated using (true);

create policy "founder reads own similar startups"
  on public.similar_startup_results for select to authenticated
  using (public.owns_assessment(assessment_id));
create policy "founder reads own roadmap steps"
  on public.roadmap_steps for select to authenticated
  using (public.owns_assessment(assessment_id));

-- changing: admins add, edit and delete startups, requirements and organisations
grant insert, update, delete on public.startups, public.regulatory_requirements, public.support_organisations to authenticated;

create policy "admins add startups"    on public.startups for insert to authenticated with check (public.is_admin());
create policy "admins edit startups"   on public.startups for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete startups" on public.startups for delete to authenticated using (public.is_admin());

create policy "admins add requirements"    on public.regulatory_requirements for insert to authenticated with check (public.is_admin());
create policy "admins edit requirements"   on public.regulatory_requirements for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete requirements" on public.regulatory_requirements for delete to authenticated using (public.is_admin());

create policy "admins add support orgs"    on public.support_organisations for insert to authenticated with check (public.is_admin());
create policy "admins edit support orgs"   on public.support_organisations for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete support orgs" on public.support_organisations for delete to authenticated using (public.is_admin());

-- Market indicators, similar-startup results and roadmap steps are not changed
-- from the website: they are loaded from the datasets or written by the agents.
