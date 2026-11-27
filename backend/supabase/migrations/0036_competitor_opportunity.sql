-- =========================================================
-- 0036 — Each competitor's competitive opportunity
-- Run once in Supabase: SQL Editor → paste → Run, after 0035.
-- Safe to run again: the column is added only if it is missing.
--
-- One new attribute on similar_startup_results, no new table or relation.
-- The design's four results:
--   proven_difference     the customer is different
--   possible_difference   the customer, or the offering, is only partly the same (or the offering differs).
--                         Which next step applies comes from the saved comparison: a "partly" customer
--                         means interview customers; otherwise validate the differentiator.
--   no_clear_difference   problem, customer and offering are all the same
--   not_enough_evidence   anything else (unknown or conflicting)
-- Only the agent server writes it; founders already read their own results.
-- =========================================================

alter table public.similar_startup_results
  add column if not exists opportunity text
    check (opportunity in ('proven_difference', 'possible_difference', 'no_clear_difference', 'not_enough_evidence'));

comment on column public.similar_startup_results.opportunity is
  'Competitive opportunity: one of the four fixed results on the judge''s answers.';
