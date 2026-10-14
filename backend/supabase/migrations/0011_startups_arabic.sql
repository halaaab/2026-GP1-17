-- ---------------------------------------------------------
-- 0011 — Arabic description for startups
-- Run this once in the Supabase SQL Editor, after 0006.
-- (Safe to run again.)
--
-- The startups dataset is in English only. This column holds the Arabic
-- version of each startup's description. The Startup Explorer and the
-- startup details page show it when the site is in Arabic, and the English
-- description whenever the Arabic one is empty. The English column is not touched.
--
-- Names stay as the companies write them (they are brand names), and the
-- fixed lists (sector, stage, region, target market) are translated in
-- frontend/translations/ar.json.
--
-- Then run  backend/supabase/seed/startups_ar.sql
-- to fill in the Arabic descriptions of the startups in the dataset.
-- New startups get theirs from the admin Startups page.
-- ---------------------------------------------------------

alter table public.startups
  add column if not exists startup_description_ar text;

-- The table-level grants and admin-only rules from 0006 already cover new columns.


-- ---------------------------------------------------------
-- To undo this file (removes the Arabic text, keeps everything else):
--
--   alter table public.startups drop column if exists startup_description_ar;
-- ---------------------------------------------------------
