-- =========================================================
-- 0015 — Delete the old Darb sector column from regulatory requirements
-- Run once in Supabase: SQL Editor → paste → Run, after 0014.
-- (Safe to run again.)
--
-- ISIC4 is now Darb's only sector taxonomy for requirements (0013 and 0014):
-- isic_sections for the explorer and admin filters, isic_divisions for the
-- assessment's roadmap and the admin overview. Nothing on the website reads
-- the old "sector" column any more, so it is removed.
--
-- Note for a new Supabase project: backend/supabase/seed/reference_data.sql
-- still fills "sector", so run that seed BEFORE this file (in the normal order:
-- 0006 → seed → … → 0015).
-- =========================================================

alter table public.regulatory_requirements
  drop column if exists sector;
