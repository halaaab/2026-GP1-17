-- ---------------------------------------------------------
-- 0008 — Arabic text for incubators and accelerators
-- Run this once in the Supabase SQL Editor, after 0007.
--
-- The dataset has the programs in English only. These columns hold the
-- Arabic version of each text field. The founder pages show them when the
-- site is in Arabic, and the English text whenever an Arabic field is empty.
-- The English columns are not touched.
--
-- Then run  backend/supabase/seed/support_organisations_ar.sql
-- to fill in the Arabic text of the 19 programs in the dataset.
-- ---------------------------------------------------------

alter table public.support_organisations
  add column if not exists name_ar               text,
  add column if not exists sector_ar             text,
  add column if not exists location_ar           text,
  add column if not exists description_ar        text,
  add column if not exists target_stage_ar       text,
  add column if not exists program_duration_ar   text,
  add column if not exists services_support_ar   text,
  add column if not exists funding_investment_ar text,
  add column if not exists eligibility_ar        text;

-- The table-level grants and admin-only rules from 0006 already cover new columns.


-- ---------------------------------------------------------
-- To undo this file (removes the Arabic text, keeps everything else):
--
--   alter table public.support_organisations
--     drop column if exists name_ar,
--     drop column if exists sector_ar,
--     drop column if exists location_ar,
--     drop column if exists description_ar,
--     drop column if exists target_stage_ar,
--     drop column if exists program_duration_ar,
--     drop column if exists services_support_ar,
--     drop column if exists funding_investment_ar,
--     drop column if exists eligibility_ar;
-- ---------------------------------------------------------
