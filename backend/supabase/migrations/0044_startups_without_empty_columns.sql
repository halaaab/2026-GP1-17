-- =========================================================
-- 0044 — Startups lose two attributes that were never filled
-- Run once in Supabase: SQL Editor → paste → Run, after 0043.
--
--   startups.target_market      empty for every startup: the dataset has no customer segment
--   startups.products_services  empty for every startup: the dataset has no product list
-- Both could also hold several values in one cell (B2B; B2C …), which first normal form does not allow.
-- The admin startup form and the startup details page no longer show them.
-- =========================================================

alter table public.startups
  drop column target_market,
  drop column products_services;
