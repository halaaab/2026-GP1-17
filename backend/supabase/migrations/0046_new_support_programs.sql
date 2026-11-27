-- =========================================================
-- 0046 — 19 more incubators and accelerators in the explorer (18 → 37)
-- Applied to Supabase on, after 0045.
--
-- The programs come from the EcosystemSA directory and were checked on 21– against
-- each program's official page, saudi-accelerators.com and news (the checked spreadsheet and the
-- Dataset Description are kept with the team's documents). Only the 19 marked "Add" are here.
-- Each row's corrections from the check are applied (names, durations, funding terms); a field
-- the official source does not state is left empty. Descriptions are Darb's own words.
-- Sectors are ISIC4 section letters or 'All sectors', as in 0045. No services are listed yet.
-- Every new program is maintained by all current admins, like the imported records in 0025.
-- Running it a second time changes nothing (a program with the same name is skipped).
-- =========================================================

begin;

-- 1. The programs
create temporary table new_programs (
  name text, name_ar text, type text, location text, location_ar text, description text, description_ar text, target_stage text, target_stage_ar text, program_duration text, program_duration_ar text, funding_investment text, funding_investment_ar text, eligibility text, eligibility_ar text, website text
) on commit drop;
insert into new_programs values
  ('Antler (MENAP)', 'أنتلر (منطقة الشرق الأوسط وشمال أفريقيا وباكستان)', 'Accelerator', 'Riyadh, Saudi Arabia', 'الرياض، المملكة العربية السعودية', 'Investor residency by the venture capital firm Antler that helps founders build and fund a company from the pre-seed stage.', 'برنامج إقامة من شركة رأس المال الجريء أنتلر يساعد المؤسسين على بناء شركاتهم وتمويلها من مرحلة ما قبل البذرة.', 'Pre-Seed', 'ما قبل البذرة', '10 weeks (residency every fall)', '10 أسابيع (برنامج إقامة كل خريف)', 'USD 180,000 for 11% (SAFE)', '180,000 دولار أمريكي مقابل 11% (اتفاقية SAFE)', null, null, 'https://www.antler.co/residency/menap'),
  ('Exel by Merak', 'إكسل من ميراك', 'Accelerator', 'Riyadh, Saudi Arabia', 'الرياض، المملكة العربية السعودية', 'Gaming accelerator of Merak Capital for early game studios.', 'مسرّعة ألعاب تابعة لشركة ميراك كابيتال لاستوديوهات الألعاب الناشئة.', 'Pre-Seed / Seed', 'ما قبل البذرة / البذرة', '16 weeks (2-week virtual bootcamp + 14 weeks in Riyadh)', '16 أسبوعًا (معسكر افتراضي لمدة أسبوعين + 14 أسبوعًا في الرياض)', 'Up to USD 150,000 cash + USD 150,000 in-kind', 'حتى 150,000 دولار أمريكي نقدًا + 150,000 دولار أمريكي دعمًا عينيًا', null, null, 'https://exelbymerak.com/program-gaming-accelerator'),
  ('Founder Institute (Riyadh)', 'معهد المؤسسين (الرياض)', 'Accelerator', 'Riyadh, Saudi Arabia', 'الرياض، المملكة العربية السعودية', 'Pre-seed program that helps founders turn an idea into a company, with a chapter in Riyadh.', 'برنامج لمرحلة ما قبل البذرة يساعد المؤسسين على تحويل الفكرة إلى شركة، وله فرع في الرياض.', 'Pre-Seed', 'ما قبل البذرة', 'About 10 weeks', 'نحو 10 أسابيع', 'Entrance fee and a 2.5% warrant', 'رسوم التحاق وحصة 2.5% بصيغة warrant', null, null, 'https://fi.co/riyadh'),
  ('Google for Startups Accelerator: MENA-T', 'مسرّعة جوجل للشركات الناشئة: الشرق الأوسط وشمال أفريقيا وتركيا', 'Accelerator', 'MENA region (hybrid)', 'منطقة الشرق الأوسط وشمال أفريقيا (هجين)', 'Google''s regional accelerator for AI and technology startups, with mentoring from Google experts.', 'مسرّعة جوجل الإقليمية للشركات الناشئة في الذكاء الاصطناعي والتقنية، مع إرشاد من خبراء جوجل.', 'Seed / Series A', 'البذرة / الجولة A', '10 weeks', '10 أسابيع', 'Equity-free', 'بدون حصة ملكية', null, null, 'https://startup.google.com/programs/accelerator/middle-east-north-africa-turkey/'),
  ('InspireU (by stc)', 'إنسباير يو من stc', 'Accelerator', 'Riyadh, Saudi Arabia', 'الرياض، المملكة العربية السعودية', 'Corporate accelerator run by stc for digital startups.', 'مسرّعة أعمال تديرها stc للشركات الناشئة الرقمية.', 'Pre-Seed / Seed', 'ما قبل البذرة / البذرة', '3 months (General) or 6 months (Advanced)', '3 أشهر (المسار العام) أو 6 أشهر (المسار المتقدم)', null, null, null, null, 'https://www.stc.com/en/inspire-u.html'),
  ('Misk Accelerator', 'مسرّعة مسك', 'Accelerator', 'Riyadh, Saudi Arabia (hybrid)', 'الرياض، المملكة العربية السعودية (هجين)', 'Misk Foundation accelerator that has supported 213 startups across 11 cohorts.', 'مسرّعة مؤسسة مسك، دعمت 213 شركة ناشئة عبر 11 دفعة.', 'Seed', 'البذرة', '3 months', '3 أشهر', 'Equity-free, no fees', 'بدون حصة ملكية وبدون رسوم', 'Tech startups after MVP with early traction, operating or scaling in Saudi Arabia', 'شركات ناشئة تقنية تجاوزت المنتج الأولي ولديها نمو مبكر، تعمل أو تتوسع في المملكة', 'https://hub.misk.org.sa/programs/entrepreneurship/misk-accelerator/'),
  ('Misk LaunchPad', 'مسك لانشباد', 'Accelerator', 'Riyadh, Saudi Arabia (hybrid)', 'الرياض، المملكة العربية السعودية (هجين)', 'Pre-acceleration program by Misk for founders at the idea stage.', 'برنامج ما قبل التسريع من مسك للمؤسسين في مرحلة الفكرة.', 'Pre-Seed / Idea', 'ما قبل البذرة / الفكرة', '10 weeks', '10 أسابيع', 'Free, fully sponsored by Misk', 'مجاني وبرعاية كاملة من مسك', null, null, 'https://hub.misk.org.sa/programs/entrepreneurship/misk-launchpad/'),
  ('Cybersecurity Accelerator (NCA)', 'مسرّعة الأمن السيبراني (الهيئة الوطنية للأمن السيبراني)', 'Accelerator', 'Riyadh, Saudi Arabia', 'الرياض، المملكة العربية السعودية', 'Accelerator of the National Cybersecurity Authority for cybersecurity startups.', 'مسرّعة الهيئة الوطنية للأمن السيبراني للشركات الناشئة في الأمن السيبراني.', null, null, '12 weeks', '12 أسبوعًا', null, null, null, null, 'https://nca.gov.sa/en/cybersecurity-accelerator'),
  ('SparkLabs KSU', 'سبارك لابز جامعة الملك سعود', 'Accelerator', 'Riyadh, Saudi Arabia', 'الرياض، المملكة العربية السعودية', 'Accelerator and venture fund of SparkLabs with Riyadh Valley Company at King Saud University.', 'مسرّعة وصندوق استثماري من سبارك لابز بالشراكة مع شركة وادي الرياض في جامعة الملك سعود.', 'Seed', 'البذرة', '4 months', '4 أشهر', 'USD 150,000 for up to 7%', '150,000 دولار أمريكي مقابل حصة تصل إلى 7%', null, null, null),
  ('Tech Champions (by CODE)', 'أبطال التقنية (من مركز ريادة الأعمال الرقمية)', 'Incubator', 'Riyadh, Saudi Arabia (also Jeddah)', 'الرياض، المملكة العربية السعودية (وجدة أيضًا)', 'Incubation program of MCIT''s Center of Digital Entrepreneurship (CODE); its fifth edition focused on fintech.', 'برنامج احتضان من مركز ريادة الأعمال الرقمية التابع لوزارة الاتصالات وتقنية المعلومات، ركزت نسخته الخامسة على التقنية المالية.', 'Pre-Seed / Seed', 'ما قبل البذرة / البذرة', '4 months', '4 أشهر', 'Equity-free', 'بدون حصة ملكية', null, null, null),
  ('UBT Accelerator', 'مسرّعة جامعة الأعمال والتكنولوجيا', 'Accelerator', 'Jeddah, Saudi Arabia', 'جدة، المملكة العربية السعودية', 'University of Business and Technology accelerator, part of Monsha''at''s University Startup Accelerator Program.', 'مسرّعة جامعة الأعمال والتكنولوجيا، ضمن برنامج مسرّعات الشركات الناشئة الجامعية من منشآت.', null, null, '6 months', '6 أشهر', null, null, 'University students, staff and fresh graduates', 'طلاب الجامعة ومنسوبوها والخريجون الجدد', null),
  ('Imam Cloud (Imam Muhammad ibn Saud Islamic University)', 'سحابة الإمام (جامعة الإمام محمد بن سعود الإسلامية)', 'Incubator', 'Riyadh, Saudi Arabia', 'الرياض، المملكة العربية السعودية', 'University business incubator of Imam Muhammad ibn Saud Islamic University.', 'حاضنة أعمال جامعية تابعة لجامعة الإمام محمد بن سعود الإسلامية.', null, null, null, null, null, null, 'Mostly university graduates', 'خريجو الجامعات في الغالب', null),
  ('Al-Baha University Business Incubator', 'حاضنة الأعمال بجامعة الباحة', 'Incubator', 'Al Baha, Saudi Arabia', 'الباحة، المملكة العربية السعودية', 'Al-Baha University business incubator, run with Monsha''at.', 'حاضنة أعمال جامعة الباحة، تعمل بالشراكة مع منشآت.', null, null, null, null, null, null, 'Saudi nationals aged 18–55; university graduates and researchers', 'مواطنون سعوديون بين 18 و55 عامًا؛ خريجو الجامعات والباحثون', null),
  ('CODE – Center of Digital Entrepreneurship', 'مركز ريادة الأعمال الرقمية (CODE)', 'Incubator', 'Riyadh, Saudi Arabia (7 centres across the Kingdom)', 'الرياض، المملكة العربية السعودية (7 مراكز في أنحاء المملكة)', 'MCIT''s digital entrepreneurship center, running incubation and acceleration programs such as Tech Founders and Code AI Catalyst.', 'مركز ريادة الأعمال الرقمية التابع لوزارة الاتصالات وتقنية المعلومات، يقدم برامج احتضان وتسريع مثل Tech Founders وCode AI Catalyst.', null, null, null, null, null, null, null, null, 'https://mcit.gov.sa/code'),
  ('Dhahran Techno Valley (DTV)', 'وادي الظهران للتقنية', 'Incubator', 'Dhahran, Saudi Arabia', 'الظهران، المملكة العربية السعودية', 'KFUPM science park and venture builder that turns research and ideas into market-ready companies.', 'حديقة علمية وبانية مشاريع تابعة لجامعة الملك فهد للبترول والمعادن، تحوّل الأبحاث والأفكار إلى شركات جاهزة للسوق.', null, null, null, null, null, null, null, null, 'https://dtv.sa/'),
  ('Khuta Center for Business Incubators and Accelerators (King Saud University)', 'مركز خطى لحاضنات ومسرّعات الأعمال (جامعة الملك سعود)', 'Incubator', 'Riyadh, Saudi Arabia', 'الرياض، المملكة العربية السعودية', 'Incubators and accelerators of the Entrepreneurship Institute at King Saud University.', 'حاضنات ومسرّعات معهد ريادة الأعمال في جامعة الملك سعود.', null, null, 'Up to 36 months of incubation', 'احتضان حتى 36 شهرًا', null, null, 'University graduates and researchers', 'خريجو الجامعات والباحثون', 'https://ei.ksu.edu.sa/en'),
  ('EWAx (MEWA)', 'إيواكس (وزارة البيئة والمياه والزراعة)', 'Incubator', 'Riyadh, Saudi Arabia', 'الرياض، المملكة العربية السعودية', 'Entrepreneurship platform of the Ministry of Environment, Water and Agriculture, with incubation and acceleration tracks.', 'منصة ريادة الأعمال التابعة لوزارة البيئة والمياه والزراعة، تضم مسارات احتضان وتسريع.', null, null, null, null, null, null, null, null, 'https://ewax.mewa.gov.sa/en'),
  ('PNU Innovation and Entrepreneurship Center', 'مركز الابتكار وريادة الأعمال بجامعة الأميرة نورة', 'Incubator', 'Riyadh, Saudi Arabia', 'الرياض، المملكة العربية السعودية', 'Princess Nourah University center running an incubator and a university accelerator with Monsha''at.', 'مركز في جامعة الأميرة نورة يدير حاضنة ومسرّعة جامعية بالشراكة مع منشآت.', null, null, '6 months + a 12-month growth phase', '6 أشهر + مرحلة نمو لمدة 12 شهرًا', 'Grants and investment', 'منح واستثمار', 'Students, graduates, staff and faculty of any Saudi university', 'طلاب وخريجو ومنسوبو وأعضاء هيئة التدريس في أي جامعة سعودية', 'https://pnu.edu.sa/en/Centers/InnovationAndEntrepreneurship/'),
  ('Wa''ed Ventures (Aramco)', 'واعد فنتشرز (أرامكو)', 'Incubator', 'Dhahran, Saudi Arabia', 'الظهران، المملكة العربية السعودية', 'Aramco''s venture capital arm, with a 12-month incubation program for startups.', 'ذراع رأس المال الجريء لأرامكو، ولديها برنامج احتضان لمدة 12 شهرًا للشركات الناشئة.', null, null, '12-month incubation program', 'برنامج احتضان لمدة 12 شهرًا', 'Equity-based (USD 500 million fund)', 'مقابل حصة ملكية (صندوق بقيمة 500 مليون دولار أمريكي)', null, null, 'https://www.aramco.com/en/what-we-do/commercial-ecosystems/waed-ventures');

insert into public.support_organizations (name, name_ar, type, location, location_ar, description, description_ar, target_stage, target_stage_ar, program_duration, program_duration_ar, funding_investment, funding_investment_ar, eligibility, eligibility_ar, website)
select n.name, n.name_ar, n.type, n.location, n.location_ar, n.description, n.description_ar, n.target_stage, n.target_stage_ar, n.program_duration, n.program_duration_ar, n.funding_investment, n.funding_investment_ar, n.eligibility, n.eligibility_ar, n.website
from new_programs n
where not exists (select 1 from public.support_organizations o where o.name = n.name);

-- 2. Their sectors: ISIC4 section letters with the same Arabic names as 0045
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

create temporary table new_program_sections (program_name text, code text, display_order int) on commit drop;
insert into new_program_sections values
  ('Antler (MENAP)', 'All sectors', 1),
  ('Exel by Merak', 'J', 1),
  ('Founder Institute (Riyadh)', 'All sectors', 1),
  ('Google for Startups Accelerator: MENA-T', 'J', 1),
  ('InspireU (by stc)', 'J', 1),
  ('Misk Accelerator', 'J', 1),
  ('Misk LaunchPad', 'J', 1),
  ('Cybersecurity Accelerator (NCA)', 'J', 1),
  ('SparkLabs KSU', 'J', 1),
  ('SparkLabs KSU', 'K', 2),
  ('SparkLabs KSU', 'D', 3),
  ('Tech Champions (by CODE)', 'K', 1),
  ('Tech Champions (by CODE)', 'J', 2),
  ('UBT Accelerator', 'All sectors', 1),
  ('Imam Cloud (Imam Muhammad ibn Saud Islamic University)', 'All sectors', 1),
  ('Al-Baha University Business Incubator', 'A', 1),
  ('Al-Baha University Business Incubator', 'P', 2),
  ('Al-Baha University Business Incubator', 'J', 3),
  ('Al-Baha University Business Incubator', 'I', 4),
  ('CODE – Center of Digital Entrepreneurship', 'J', 1),
  ('Dhahran Techno Valley (DTV)', 'M', 1),
  ('Dhahran Techno Valley (DTV)', 'D', 2),
  ('Dhahran Techno Valley (DTV)', 'C', 3),
  ('Khuta Center for Business Incubators and Accelerators (King Saud University)', 'All sectors', 1),
  ('EWAx (MEWA)', 'A', 1),
  ('EWAx (MEWA)', 'E', 2),
  ('PNU Innovation and Entrepreneurship Center', 'All sectors', 1),
  ('Wa''ed Ventures (Aramco)', 'J', 1),
  ('Wa''ed Ventures (Aramco)', 'K', 2),
  ('Wa''ed Ventures (Aramco)', 'D', 3),
  ('Wa''ed Ventures (Aramco)', 'C', 4),
  ('Wa''ed Ventures (Aramco)', 'A', 5),
  ('Wa''ed Ventures (Aramco)', 'P', 6),
  ('Wa''ed Ventures (Aramco)', 'Q', 7),
  ('Wa''ed Ventures (Aramco)', 'M', 8);

insert into public.organization_sectors (support_org_id, sector, sector_ar, display_order)
select o.support_org_id, s.code, n.name_ar, s.display_order
from new_program_sections s
join public.support_organizations o on o.name = s.program_name
join isic_names n on n.code = s.code
on conflict do nothing;

-- 3. Every record has at least one admin who maintains it (0025)
insert into public.organization_maintenance (admin_id, support_org_id)
select a.user_id, o.support_org_id
from public.admins a
cross join public.support_organizations o
join new_programs n on n.name = o.name
on conflict do nothing;

commit;
