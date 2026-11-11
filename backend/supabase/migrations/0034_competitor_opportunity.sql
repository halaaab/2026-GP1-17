-- =========================================================
-- 0034 — Each competitor's competitive opportunity (explainer §6)
-- Run once in Supabase: SQL Editor → paste → Run, after 0033.
-- (Safe to run again.)
--
-- One new attribute on similar_startup_results, no new table or relation:
--   opportunity  which of the fixed rules matched: proven_difference, possible_customer_difference,
--                possible_difference, no_clear_difference or not_enough_evidence. The website shows
--                its fixed message and next step in Arabic or English.
-- The judge's one-sentence difference goes in the existing differences column (0024).
-- Only the agent server writes them. Founders already read their own results (0006).
-- =========================================================

alter table public.similar_startup_results
  add column if not exists opportunity text
    check (opportunity in ('proven_difference', 'possible_customer_difference', 'possible_difference', 'no_clear_difference', 'not_enough_evidence'));

comment on column public.similar_startup_results.opportunity is
  'Competitive opportunity from fixed rules on the judge''s answers (explainer §6). Null for rows saved before 0034.';
comment on column public.similar_startup_results.differences is
  'The judge''s one sentence on how the idea differs from this competitor (explainer §6), in the founder''s language.';
