-- =========================================================
-- 0012 — Authority logos for regulatory requirements
-- Run once in Supabase: SQL Editor → paste → Run, after 0010 and 0011.
-- (Safe to run again.)
--
-- authority_logo is the address of the issuing authority's logo, inside the
-- frontend folder (frontend/assets/images/authorities/). The Regulatory
-- Explorer shows it on the card and the details page; a requirement with
-- no logo shows the authority's initials instead.
-- Admins choose the logo on the admin Regulatory page.
--
-- No new security rules: the table's rules from 0006 cover every column.
-- =========================================================

alter table public.regulatory_requirements
  add column if not exists authority_logo text;

update public.regulatory_requirements set authority_logo = case authority
  when 'Saudi Authority for Intellectual Property (SAIP)' then 'assets/images/authorities/saip.png'
  when 'Saudi Data & AI Authority (SDAIA)' then 'assets/images/authorities/sdaia.png'
  when 'Zakat, Tax and Customs Authority (ZATCA)' then 'assets/images/authorities/zatca.png'
  when 'Ministry of Commerce / Chambers of Commerce' then 'assets/images/authorities/chambers.png'
  when 'General Organization for Social Insurance (GOSI)' then 'assets/images/authorities/gosi.png'
  when 'Ministry of Human Resources and Social Development' then 'assets/images/authorities/hrsd.png'
  when 'Ministry of Human Resources and Social Development / Qiwa' then 'assets/images/authorities/qiwa.png'
  when 'Ministry of Industry and Mineral Resources' then 'assets/images/authorities/mim.png'
  when 'Saudi Food and Drug Authority (SFDA)' then 'assets/images/authorities/sfda.png'
  when 'Ministry of Municipalities and Housing / Balady' then 'assets/images/authorities/balady.png'
  when 'Saudi Standards, Metrology and Quality Organization (SASO)' then 'assets/images/authorities/saso.png'
  when 'Ministry of Commerce' then 'assets/images/authorities/mc.png'
  when 'Ministry of Commerce / Saudi Business Center' then 'assets/images/authorities/sbc.png'
  when 'Saudi Post (SPL)' then 'assets/images/authorities/spl.png'
  when 'Communications, Space and Technology Commission (CST)' then 'assets/images/authorities/cst.png'
  else authority_logo
end;
