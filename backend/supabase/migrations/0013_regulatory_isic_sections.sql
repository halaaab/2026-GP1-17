-- =========================================================
-- 0013 — ISIC4 sections for regulatory requirements
-- Run once in Supabase: SQL Editor → paste → Run, after 0012.
-- (Safe to run again.)
--
-- The Regulatory Explorer's sector filter uses the 20 sections of ISIC Rev.4,
-- as published by GASTAT in the Saudi Standard Industrial Classification
-- (SSIC, "التصنيف الوطني للأنشطة الاقتصادية", September 2026 edition).
--
-- isic_sections holds the international section letters a requirement is for:
--   'A' … 'U'   (A agriculture, C manufacturing, G wholesale and retail trade,
--                H transportation and storage, I accommodation and food,
--                J information and communication, …)
--   'ALL'       the requirement applies to every business, whatever its activity
-- The Arabic letters (أ، ب، ج …) and the names of the sections are in the
-- translation files (reg.isic.<letter>).
--
-- The Darb sector column (sector) stays as it is: the assessment and the
-- roadmap still use it.
--
-- No new security rules: the table's rules from 0006 cover every column.
-- =========================================================

alter table public.regulatory_requirements
  add column if not exists isic_sections text[];

update public.regulatory_requirements as r
set isic_sections = v.sections
from (values
  -- every business
  ('GEN-001', array['ALL']), ('GEN-002', array['ALL']), ('GEN-003', array['ALL']),
  ('GEN-004', array['ALL']), ('GEN-005', array['ALL']), ('GEN-006', array['ALL']),
  ('GEN-007', array['ALL']), ('GEN-008', array['ALL']), ('GEN-009', array['ALL']),
  ('GEN-010', array['ALL']), ('GEN-011', array['ALL']), ('GEN-012', array['ALL']),
  ('GEN-013', array['ALL']), ('GEN-014', array['ALL']), ('GEN-023', array['ALL']),

  -- online stores and selling online
  ('GEN-015', array['G']),
  ('GEN-016', array['G', 'J']),

  -- making or trading physical goods: customs, conformity, industry, export
  ('GEN-017', array['C', 'G']), ('GEN-018', array['C', 'G']), ('GEN-019', array['C', 'G']),
  ('GEN-020', array['C', 'G']), ('GEN-021', array['C']),      ('GEN-022', array['C', 'G']),

  -- technology services
  ('AI-001', array['J']), ('AI-002', array['J']), ('AI-003', array['J']), ('AI-004', array['J']),

  -- product rules for manufacturers and sellers
  ('FASH-001', array['C', 'G']), ('FASH-002', array['C', 'G']),
  ('FASH-003', array['C', 'G']), ('FASH-004', array['C', 'G']),
  ('FURN-002', array['C', 'G']), ('FURN-004', array['C', 'G']),

  -- Saudization of shops
  ('FASH-005', array['G']), ('FASH-006', array['G']), ('FOOD-007', array['G']), ('FURN-003', array['G']),

  -- food
  ('FOOD-001', array['C', 'G', 'I']),   -- workers' health certificate: food factories, shops, restaurants
  ('FOOD-002', array['C']),             -- food factory licence
  ('FOOD-003', array['G', 'H']),        -- food warehouse / distribution centre
  ('FOOD-004', array['C', 'G']),        -- food registration (producers, importers)
  ('FOOD-005', array['C', 'G']),        -- food labelling
  ('FOOD-006', array['G']),             -- food import clearance
  ('FOOD-008', array['I'])              -- restaurants and cafés
) as v(requirement_id, sections)
where r.requirement_id = v.requirement_id;
