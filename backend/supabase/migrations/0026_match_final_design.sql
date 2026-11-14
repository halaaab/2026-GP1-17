-- =========================================================
-- 0026 — Make the database match the final EER diagram and relational schema
-- Run once in Supabase: SQL Editor → paste → Run, after 0025.
--
-- The rule used for every table:
--   * a column the design has but the database lacks is ADDED. Some stay empty
--     until the sprint that fills them (sprints 3 to 5).
--   * a column the database has, that no code reads or writes and the design
--     does not have, is DROPPED.
--   * a column the code needs stays, and the design was updated to show it.
--
-- Backups of everything that had data and is dropped here:
--   datasets/backups/market_indicators_before_0026.csv   (all 58 columns, 111 rows)
--   datasets/backups/startups_excluded_before_0026.csv   (70 rows)
-- The other dropped columns were empty.
-- =========================================================


-- ---------------------------------------------------------
-- startup_ideas
-- ---------------------------------------------------------
alter table public.startup_ideas
  add column activity_code text,     -- economic_activity: ISIC activity code   (filled in a later sprint)
  add column isic_section  text,     -- economic_activity: ISIC section letter  (filled in a later sprint)
  drop column products_services,     -- empty, not used
  drop column legal_entity_type,     -- empty, not used (the legal form is asked in the assessment)
  drop column product_type;          -- empty, not used


-- ---------------------------------------------------------
-- assessments: venture_details and model_version from the design
-- ---------------------------------------------------------
alter table public.assessments
  add column city          text,     -- venture_details  (filled in a later sprint)
  add column region        text,
  add column legal_form    text,
  add column capital       numeric check (capital >= 0),
  add column sells_online  boolean,
  add column model_version text,     -- survival_result: which ML model scored it
  drop column survival_percentile;   -- empty, not used


-- ---------------------------------------------------------
-- messages
-- ---------------------------------------------------------
alter table public.messages
  drop column tool_calls,            -- empty, not used
  drop column extracted_attributes;  -- empty, not used


-- ---------------------------------------------------------
-- market_indicators: the design's attributes, plus the four the market panel shows
-- ---------------------------------------------------------
alter table public.market_indicators rename column enterprises_micro  to micro;
alter table public.market_indicators rename column enterprises_small  to small;
alter table public.market_indicators rename column enterprises_medium to medium;
alter table public.market_indicators rename column enterprises_large  to large;
alter table public.market_indicators rename column enterprises_total  to total_enterprises;

alter table public.market_indicators
  add column quarter integer check (quarter between 1 and 4),   -- reference_period (the data is yearly for now)
  add column region  text,                                       -- location (the data is national for now)
  add column city    text,
  drop column isic_level,
  drop column darb_sector,
  drop column collected_on,
  drop column new_enterprises_micro,
  drop column new_enterprises_small,
  drop column new_enterprises_medium,
  drop column new_enterprises_large,
  drop column enterprises_growth_micro_pct,
  drop column enterprises_growth_small_pct,
  drop column enterprises_growth_medium_pct,
  drop column enterprises_growth_large_pct,
  drop column fast_growing_enterprises_total,
  drop column fast_growing_small,
  drop column fast_growing_medium,
  drop column fast_growing_large,
  drop column share_micro_pct,       -- derived: the page now works it out from micro .. large
  drop column share_small_pct,
  drop column share_medium_pct,
  drop column share_large_pct,
  drop column female_owned_enterprises,
  drop column female_owned_pct,
  drop column employees_micro,
  drop column employees_small,
  drop column employees_medium,
  drop column employees_large,
  drop column employees_male,
  drop column employees_female,
  drop column saudi_employee_pct,
  drop column saudi_male_pct,
  drop column saudi_female_pct,
  drop column pos_transaction_value_sar,
  drop column pos_transaction_count,
  drop column gdp_growth_pct,
  drop column inflation_pct,
  drop column saudi_unemployment_pct,
  drop column macro_reference_period,
  drop column employees_per_enterprise,
  drop column new_enterprise_rate_pct,
  drop column employees_growth_pct,
  drop column pos_avg_ticket_sar,
  drop column pos_value_growth_pct,
  drop column size_count_check,
  drop column record_status,
  drop column notes;
-- kept: record_id, economic_activity_code, economic_activity_name_en, economic_activity_name_ar,
--       year, source_url, total_enterprises, micro, small, medium, large,
--       new_enterprises_total, employees_total, enterprises_growth_pct, quarter, region, city


-- ---------------------------------------------------------
-- startups_excluded: a holding table from the data import, not part of the design
-- and not used by any code (its 70 rows are in the backup file above)
-- ---------------------------------------------------------
drop table public.startups_excluded;


-- ---------------------------------------------------------
-- regulatory_requirements: the design's shorter name
-- ---------------------------------------------------------
alter table public.regulatory_requirements rename column what_darb_should_surface    to what_darb_surface;
alter table public.regulatory_requirements rename column what_darb_should_surface_ar to what_darb_surface_ar;

-- founder_trigger_fields and notes are not in the design
-- (their 44 rows are in datasets/backups/regulatory_trigger_fields_notes_before_0026.csv)
alter table public.regulatory_requirements
  drop column founder_trigger_fields,
  drop column notes;


-- ---------------------------------------------------------
-- assessments: formal names
--   variation_label  = the short name of a what-if variation of an earlier assessment
--   confirmed_inputs = the venture inputs the founder confirmed for this assessment
-- ---------------------------------------------------------
alter table public.assessments rename column scenario_label  to variation_label;
alter table public.assessments rename column scenario_inputs to confirmed_inputs;
