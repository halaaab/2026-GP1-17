-- =========================================================
-- 0014 — ISIC4 becomes Darb's only sector taxonomy for regulatory requirements
-- Run once in Supabase: SQL Editor → paste → Run, after 0013.
-- (Safe to run again.)
--
-- The survival model and the market indicators already use ISIC4, so the
-- requirements use it too:
--
--   isic_sections   the ISIC4 sections (A … U, or 'ALL') — the explorer and admin
--                   filters (added in 0013, corrected here for GEN-015 … GEN-022)
--   isic_divisions  the ISIC4 divisions (2 digits, or 'ALL') — the assessment's
--                   roadmap. A requirement is in a founder's roadmap when its
--                   divisions include one of the idea's divisions, or are 'ALL'.
--                   The idea's divisions are the ones the market indicators link
--                   to its sector: AI 58, 62, 63 · food 10, 11, 56 · fashion 13, 14, 15
--                   · furniture 31 (shared/regulatory.js).
--
-- Codes follow GASTAT's Saudi Standard Industrial Classification (SSIC,
-- September 2026), which is ISIC Rev.4.
--
-- The old Darb sector column is made optional here, so the website keeps working
-- while it is retired; 0015 deletes it.
-- =========================================================

alter table public.regulatory_requirements
  add column if not exists isic_divisions text[];

alter table public.regulatory_requirements
  alter column sector drop not null;

update public.regulatory_requirements as r
set isic_sections = v.sections,
    isic_divisions = v.divisions
from (values
  -- every business: their own conditions (sells online, imports, exports, hires …)
  -- decide whether they apply, not the sector
  ('GEN-001', array['ALL'], array['ALL']), ('GEN-002', array['ALL'], array['ALL']),
  ('GEN-003', array['ALL'], array['ALL']), ('GEN-004', array['ALL'], array['ALL']),
  ('GEN-005', array['ALL'], array['ALL']), ('GEN-006', array['ALL'], array['ALL']),
  ('GEN-007', array['ALL'], array['ALL']), ('GEN-008', array['ALL'], array['ALL']),
  ('GEN-009', array['ALL'], array['ALL']), ('GEN-010', array['ALL'], array['ALL']),
  ('GEN-011', array['ALL'], array['ALL']), ('GEN-012', array['ALL'], array['ALL']),
  ('GEN-013', array['ALL'], array['ALL']), ('GEN-014', array['ALL'], array['ALL']),
  ('GEN-015', array['ALL'], array['ALL']), ('GEN-016', array['ALL'], array['ALL']),
  ('GEN-017', array['ALL'], array['ALL']), ('GEN-018', array['ALL'], array['ALL']),
  ('GEN-019', array['ALL'], array['ALL']), ('GEN-020', array['ALL'], array['ALL']),
  ('GEN-022', array['ALL'], array['ALL']), ('GEN-023', array['ALL'], array['ALL']),

  -- industrial licence: every manufacturing division (section C)
  ('GEN-021', array['C'], array['10','11','12','13','14','15','16','17','18','19','20','21',
                                 '22','23','24','25','26','27','28','29','30','31','32','33']),

  -- technology services (58 publishing incl. software, 62 programming, 63 information services)
  ('AI-001', array['J'], array['62', '63']),
  ('AI-002', array['J'], array['63']),
  ('AI-003', array['J'], array['58', '63']),
  ('AI-004', array['J'], array['58', '63']),

  -- food (10 food products, 11 beverages, 46 wholesale, 47 retail, 52 warehousing, 56 food service)
  ('FOOD-001', array['C', 'G', 'I'], array['10', '11', '47', '56']),
  ('FOOD-002', array['C'],           array['10', '11']),
  ('FOOD-003', array['G', 'H'],      array['46', '52']),
  ('FOOD-004', array['C', 'G'],      array['10', '11', '46']),
  ('FOOD-005', array['C', 'G'],      array['10', '11', '46', '47']),
  ('FOOD-006', array['G'],           array['46']),
  ('FOOD-007', array['G'],           array['47']),
  ('FOOD-008', array['I'],           array['56']),

  -- fashion (13 textiles, 14 wearing apparel, 15 leather and footwear)
  ('FASH-001', array['C', 'G'], array['13', '14', '46', '47']),
  ('FASH-002', array['C', 'G'], array['13', '14', '46', '47']),
  ('FASH-003', array['C', 'G'], array['15', '46', '47']),
  ('FASH-004', array['C', 'G'], array['15', '46', '47']),
  ('FASH-005', array['G'],      array['47']),
  ('FASH-006', array['G'],      array['47']),

  -- furniture (31 furniture; FURN-002 covers the textile parts of furniture, so it stays
  -- with furniture makers and sellers, not textile makers)
  ('FURN-002', array['C', 'G'], array['31', '46', '47']),
  ('FURN-003', array['G'],      array['47']),
  ('FURN-004', array['C', 'G'], array['31', '46', '47'])
) as v(requirement_id, sections, divisions)
where r.requirement_id = v.requirement_id;
