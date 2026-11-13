-- =========================================================
-- 0027 — assessments.market_record_id becomes a real foreign key
-- Run once in Supabase: SQL Editor → paste → Run, after 0026.
--
-- The design says "Assessment is matched to 0..1 MarketIndicator", so
-- market_record_id must reference market_indicators (record_id).
-- In the database it was a bigint with no foreign key, while record_id
-- is text (for example 56_2023). No assessment uses it yet (all empty),
-- so the type can change safely.
-- =========================================================

alter table public.assessments
  alter column market_record_id type text using market_record_id::text,
  add constraint assessments_market_record_id_fkey
    foreign key (market_record_id) references public.market_indicators (record_id)
    on delete set null;
