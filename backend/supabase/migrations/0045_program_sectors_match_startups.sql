-- =========================================================
-- 0045 — The incubators and accelerators use the same sectors as the startups
-- Run once in Supabase: SQL Editor → paste → Run, after 0044.
--
-- organization_sectors held the words each program wrote ("GeoAI", "PropTech", "Web3" ...).
-- Each one becomes a sector of the startups' list (SECTORS in frontend/shared/startups.js),
-- so the Startup Explorer and the Incubators & Accelerators Explorer filter by the same sectors.
--   - "All sectors", "Multiple Sectors" and "All industries" become one value: 'All sectors'
--   - a word that means two sectors gets two rows ("ICT & Gaming" → Technology & Telecommunications, Gaming)
--   - two words that become the same sector in one program are kept once
--   - display_order is numbered again from 1, in the program's old order
--   - sector_ar gets the same Arabic as the Startup Explorer (startup.sector.* in translations/ar.json)
-- Then a CHECK makes sure a new sector is always one of the list or 'All sectors'.
-- If a program still has a word that is not in the mapping below, the CHECK fails and
-- nothing is changed: add that word to the mapping and run it again.
-- Running it a second time changes nothing (every sector already maps to itself).
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1. The sectors after the change, kept for a moment in a temporary table
-- ---------------------------------------------------------
create temporary table new_organization_sectors on commit drop as
with mapping (old_sector, new_sector, part) as (
  values
    -- open to every sector
    ('All sectors',                        'All sectors',                     1),
    ('Multiple Sectors',                   'All sectors',                     1),
    ('All industries',                     'All sectors',                     1),
    -- technology
    ('Technology',                         'Technology',                      1),
    ('Information Technology',             'Technology',                      1),
    ('Digital Technologies',               'Technology',                      1),
    ('IoT',                                'Technology',                      1),
    ('Web3',                               'Technology',                      1),
    ('Blockchain',                         'Technology',                      1),
    ('Mixed & Augmented Reality',          'Technology',                      1),
    ('ICT & Gaming',                       'Technology & Telecommunications', 1),
    ('ICT & Gaming',                       'Gaming',                          2),
    -- AI and deep tech
    ('GeoAI',                              'AI & Deep Tech',                  1),
    ('Robotics',                           'AI & Deep Tech',                  1),
    ('Deep Technology',                    'AI & Deep Tech',                  1),
    ('Artificial Intelligence (AI)',       'AI & Deep Tech',                  1),
    ('AI',                                 'AI & Deep Tech',                  1),
    ('AI&FinTech',                         'AI & Deep Tech',                  1),
    ('AI&FinTech',                         'Financial Services & Fintech',    2),
    -- the other sectors
    ('Logistics',                          'Transportation & Logistics',      1),
    ('Smart Education',                    'Education, Research & Talent',    1),
    ('PropTech',                           'Real Estate',                     1),
    ('Real Estate Technology',             'Real Estate',                     1),
    ('Drones',                             'Aerospace & Defense',             1),
    ('Creative & Cultural',                'Creative Industries & Media',     1),
    ('Life Sciences & Health Innovation',  'Health & Life Sciences',          1),
    ('Biotechnology',                      'Health & Life Sciences',          1),
    ('Health & Medical',                   'Health & Life Sciences',          1),
    ('Commercial & Lifestyle Applications','Consumer Services',               1)
),
-- the Arabic of each sector: the same words as label('sector', ...) on the website
arabic (sector, sector_ar) as (
  values
    ('All sectors',                     'جميع القطاعات'),
    ('Technology',                      'التقنية'),
    ('Technology & Telecommunications', 'التقنية والاتصالات'),
    ('AI & Deep Tech',                  'الذكاء الاصطناعي والتقنيات العميقة'),
    ('Cybersecurity',                   'الأمن السيبراني'),
    ('Financial Services & Fintech',    'الخدمات المالية والتقنية المالية'),
    ('Education, Research & Talent',    'التعليم والبحث والمواهب'),
    ('Health & Life Sciences',          'الصحة وعلوم الحياة'),
    ('Real Estate',                     'العقار'),
    ('Construction & Infrastructure',   'البناء والبنية التحتية'),
    ('Food & Beverages',                'الأغذية والمشروبات'),
    ('Agriculture & Food',              'الزراعة والغذاء'),
    ('Retail & E-commerce',             'التجزئة والتجارة الإلكترونية'),
    ('Transportation & Logistics',      'النقل والخدمات اللوجستية'),
    ('Manufacturing',                   'التصنيع'),
    ('Travel, Tourism & Hospitality',   'السفر والسياحة والضيافة'),
    ('HR & Recruitment',                'الموارد البشرية والتوظيف'),
    ('Professional Services',           'الخدمات المهنية'),
    ('Consumer Services',               'خدمات المستهلك'),
    ('Sports & Entertainment',          'الرياضة والترفيه'),
    ('Gaming',                          'الألعاب'),
    ('Creative Industries & Media',     'الصناعات الإبداعية والإعلام'),
    ('Marketing & Advertising',         'التسويق والإعلان'),
    ('Energy & Sustainability',         'الطاقة والاستدامة'),
    ('Aerospace & Defense',             'الطيران والفضاء والدفاع'),
    ('Government & Public Sector',      'الحكومة والقطاع العام'),
    ('Fashion',                         'الأزياء')
),
-- each old row becomes one or two new ones (a word not in the mapping stays as it is)
mapped as (
  select s.support_org_id,
         coalesce(m.new_sector, trim(s.sector)) as sector,
         s.sector_ar,
         s.display_order,
         coalesce(m.part, 1) as part
  from public.organization_sectors s
  left join mapping m on m.old_sector = trim(s.sector)
),
-- the same sector twice in one program is kept once, where it first appeared
merged as (
  select support_org_id, sector, min(sector_ar) as old_sector_ar,
         min(display_order * 10 + part) as first_place
  from mapped
  group by support_org_id, sector
)
select merged.support_org_id,
       merged.sector,
       coalesce(arabic.sector_ar, merged.old_sector_ar) as sector_ar,
       row_number() over (partition by merged.support_org_id order by merged.first_place)::integer as display_order
from merged
left join arabic on arabic.sector = merged.sector;

-- ---------------------------------------------------------
-- 2. The old rows are replaced by the new ones
-- ---------------------------------------------------------
delete from public.organization_sectors;

insert into public.organization_sectors (support_org_id, sector, sector_ar, display_order)
  select support_org_id, sector, sector_ar, display_order
  from new_organization_sectors
  on conflict do nothing;

-- ---------------------------------------------------------
-- 3. From now on a sector must be one of the startups' sectors, or 'All sectors'
--    (the same list as SECTORS in frontend/shared/startups.js)
-- ---------------------------------------------------------
alter table public.organization_sectors drop constraint if exists organization_sectors_sector_in_list;
alter table public.organization_sectors add constraint organization_sectors_sector_in_list check (sector in (
  'All sectors',
  'Technology', 'Technology & Telecommunications', 'AI & Deep Tech', 'Cybersecurity',
  'Financial Services & Fintech', 'Education, Research & Talent', 'Health & Life Sciences',
  'Real Estate', 'Construction & Infrastructure', 'Food & Beverages', 'Agriculture & Food',
  'Retail & E-commerce', 'Transportation & Logistics', 'Manufacturing', 'Travel, Tourism & Hospitality',
  'HR & Recruitment', 'Professional Services', 'Consumer Services', 'Sports & Entertainment', 'Gaming',
  'Creative Industries & Media', 'Marketing & Advertising', 'Energy & Sustainability',
  'Aerospace & Defense', 'Government & Public Sector', 'Fashion'
));

commit;
