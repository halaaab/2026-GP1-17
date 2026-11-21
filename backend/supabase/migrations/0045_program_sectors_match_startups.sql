-- =========================================================
-- 0045 — The incubators and accelerators use the same sectors as the startups: the ISIC4 sections
-- Run once in Supabase: SQL Editor → paste → Run, after 0044, and only after the team has
-- checked the table below against each program's own website.
--
-- Both explorers filter by the 20 ISIC4 sections of GASTAT's National Classification of
-- Economic Activities (SSIC): A to U, without T. The startups get theirs from isic_division;
-- the programs keep theirs in organization_sectors, one row per section letter ('J'), or the
-- one value 'All sectors' for a program open to every sector.
--
-- Each program's sections come from the sector words the program published (the old rows,
-- shown in the comment of each line), matched to the official ISIC4 section they belong to:
--   Technology, software, AI, IoT, Web3, gaming, telecom → J  Information and communication
--   Fintech                                              → K  Financial and insurance activities
--   PropTech, real estate technology                     → L  Real estate activities
--   Logistics                                            → H  Transportation and storage
--   Health and medical                                   → Q  Human health and social work activities
--   Education                                            → P  Education
--   Creative and cultural content                        → R  Arts, entertainment and recreation
--   Deep technology (research and development)           → M  Professional, scientific and technical activities
--   All sectors, multiple sectors, all industries        → All sectors
-- sector_ar is the section's plain Arabic name, the same words as the website (reg.isic.* in ar.json).
-- Running it a second time changes nothing.
-- =========================================================

begin;

-- 1. The plain names of the sections, in Arabic, for sector_ar
create temporary table isic_names (code text primary key, name_ar text) on commit drop;
insert into isic_names values
  ('A', 'الزراعة وصيد الأسماك'), ('B', 'التعدين والمحاجر'), ('C', 'الصناعة والتصنيع'),
  ('D', 'الكهرباء والطاقة'), ('E', 'المياه والنفايات وإعادة التدوير'), ('F', 'البناء والتشييد'),
  ('G', 'التجزئة والجملة والتجارة الإلكترونية'), ('H', 'النقل والتوصيل والتخزين'),
  ('I', 'الفنادق والمطاعم والمقاهي'), ('J', 'التقنية والبرمجيات والاتصالات'),
  ('K', 'المالية والتقنية المالية والتأمين'), ('L', 'العقار'),
  ('M', 'الخدمات المهنية والعلمية والاستشارية'), ('N', 'خدمات دعم الأعمال والسفر والتأجير'),
  ('O', 'الحكومة والدفاع'), ('P', 'التعليم والتدريب'), ('Q', 'الصحة والرعاية الاجتماعية'),
  ('R', 'الفنون والترفيه والرياضة'), ('S', 'الخدمات الشخصية الأخرى'), ('U', 'المنظمات الدولية'),
  ('All sectors', 'جميع القطاعات');

-- 2. Each program's sections, in order (matched by the program's name)
create temporary table program_sections (program_name text, code text, display_order int) on commit drop;
insert into program_sections values
  ('AlMashtal Creative Incubator', 'R', 1),                      -- Creative & Cultural
  ('Attliq Accelerator', 'J', 1),                                -- Technology
  ('Beyond Square Accelerator', 'H', 1),                         -- Logistics
  ('Beyond Square Accelerator', 'J', 2),                         -- ICT & Gaming; GeoAI
  ('Beyond Square Incubator', 'H', 1),                           -- Logistics
  ('Beyond Square Incubator', 'J', 2),                           -- ICT & Gaming; GeoAI
  ('CODE Gate', 'J', 1),                                         -- Technology; Digital Technologies
  ('E3', 'J', 1),                                                -- AI&FinTech (AI)
  ('E3', 'K', 2),                                                -- AI&FinTech (fintech)
  ('Falak Flagship Acceleration Program', 'All sectors', 1),     -- All sectors
  ('Founders Lab', 'All sectors', 1),                            -- Multiple Sectors
  ('gener8tor Saudi Arabia Accelerator', 'All sectors', 1),      -- All industries (also Biotechnology; Life Sciences & Health Innovation)
  ('Holol Business Incubator', 'All sectors', 1),                -- Multiple Sectors
  ('OnePage – Business Engine Incubator', 'J', 1),               -- Information Technology; AI; IoT; Robotics; Drones; Mixed & Augmented Reality; apps
  ('OnePage – Business Engine Incubator', 'Q', 2),               -- Health & Medical
  ('OnePage – Business Engine Incubator', 'P', 3),               -- Smart Education
  ('Outlier Ventures – Riyadh Base Camp', 'J', 1),               -- Web3; Blockchain
  ('Sanabil Accelerator by 500 Global', 'J', 1),                 -- Technology
  ('Sanabil Accelerator by Orbit', 'J', 1),                      -- Technology
  ('Startup Wise Guys– Future Built Assets Accelerator', 'L', 1),-- PropTech; Real Estate Technology
  ('TAQADAM Accelerator', 'All sectors', 1),                     -- All sectors
  ('The Garage Incubator', 'J', 1),                              -- Technology
  ('The Garage Incubator', 'M', 2),                              -- Deep Technology
  ('TikTok x Blossom SME Empowerment Program', 'J', 1);          -- Artificial Intelligence (AI)

-- 3. Every program in the database must be in the table above, or nothing changes
do $$
declare missing text;
begin
  select string_agg(o.name, ', ') into missing
  from public.support_organizations o
  where not exists (select 1 from program_sections p where p.program_name = o.name);
  if missing is not null then
    raise exception 'These programs have no sections in 0045 yet: %', missing;
  end if;
end $$;

-- 4. The old sector rows are replaced by the sections
delete from public.organization_sectors;

insert into public.organization_sectors (support_org_id, sector, sector_ar, display_order)
select o.support_org_id, p.code, n.name_ar, p.display_order
from program_sections p
join public.support_organizations o on o.name = p.program_name
join isic_names n on n.code = p.code;

-- 5. From now on a program's sector is always an ISIC4 section letter, or 'All sectors'
alter table public.organization_sectors drop constraint if exists organization_sectors_sector_in_list;
alter table public.organization_sectors add constraint organization_sectors_sector_in_list
  check (sector in ('A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','U','All sectors'));

commit;
