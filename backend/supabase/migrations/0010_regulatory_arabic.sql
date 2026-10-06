-- =========================================================
-- 0010 — Regulatory requirements in Arabic
-- Run once in Supabase: SQL Editor → paste → Run, after 0006_reference_data.
-- (Safe to run again.)
--
-- regulatory_requirements had only an Arabic name (name_ar). These columns
-- hold the Arabic text of the other fields a founder reads, so the Regulatory
-- Explorer can show the whole requirement in Arabic. When an Arabic value is
-- empty, the pages show the English one.
--
-- Fixed lists (sector, business stage, mandatory, regulatory status) are not
-- columns: their Arabic words are in frontend/translations/ar.json.
--
-- To fill the new columns for the 44 existing requirements, run
--   backend/supabase/seed/regulatory_requirements_ar.sql
-- New requirements get their Arabic text from the admin Regulatory page.
--
-- No new security rules: the table's rules from 0006 cover every column
-- (everyone reads, admins add / edit / delete).
-- =========================================================

alter table public.regulatory_requirements
  add column if not exists authority_ar                text,
  add column if not exists category_ar                 text,
  add column if not exists applies_when_ar             text,
  add column if not exists what_darb_should_surface_ar text,
  add column if not exists fees_thresholds_ar          text;
