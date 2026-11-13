-- =========================================================
-- 0021 — ISIC4 sector and sub-sector for each startup
-- Run once in Supabase: SQL Editor → paste → Run, after 0020.
-- (Safe to run again.)
--
-- The startups' own sector labels ("Financial Services & Fintech; Technology") do not match
-- ISIC4, which the founders' ideas, the regulations, the market indicators and the survival
-- model all use. Each startup gets the same two codes a founder chooses in the chat:
--   isic_section   the ISIC4 section letter, A to U
--   isic_division  the ISIC4 division inside it, 2 digits (GASTAT's SSIC, Sep 2026)
-- The agent server fills them (npm run classify:startups) and checks every code against the
-- SSIC list. The old sector column stays as it is: the Startups Explorer still shows it.
-- No security changes: the table's rules from 0006 cover every column.
-- =========================================================

alter table public.startups
  add column if not exists isic_section  text check (isic_section ~ '^[A-U]$'),
  add column if not exists isic_division text check (isic_division ~ '^[0-9]{2}$');

create index if not exists startups_isic on public.startups (isic_section, isic_division);
