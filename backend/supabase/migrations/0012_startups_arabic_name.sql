-- ---------------------------------------------------------
-- 0012 — Arabic name for startups
-- Run this once in the Supabase SQL Editor, after 0011.
-- (Safe to run again.)
--
-- EcosystemSA gives most startups an official Arabic name (Nana → نعناع).
-- The Startup Explorer and the startup details page show it when the site is
-- in Arabic, and the English name whenever the Arabic one is empty.
--
-- The logo needs no new column: the existing "logo" column (0006) holds the
-- link to the startup's logo image.
--
-- Then run  backend/supabase/seed/startups_ecosystemsa.sql
-- to bring the startups in line with the EcosystemSA directory.
-- ---------------------------------------------------------

alter table public.startups
  add column if not exists startup_name_ar text;

-- The table-level grants and admin-only rules from 0006 already cover new columns.


-- ---------------------------------------------------------
-- To undo this file (removes the Arabic names, keeps everything else):
--
--   alter table public.startups drop column if exists startup_name_ar;
-- ---------------------------------------------------------
