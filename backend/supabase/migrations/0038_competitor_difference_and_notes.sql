-- =========================================================
-- 0038 — The judge's difference sentence and the analysis notes (decided as columns)
-- Run once in Supabase: SQL Editor → paste → Run, after 0037.
-- Safe to run again: each column is added only if it is missing.
--
-- Two attributes on existing tables, no new table or relation:
--   similar_startup_results.difference  one sentence on how the founder's idea differs from this competitor,
-- written by the judge from the evidence. Null when none.
--   assessments.competitor_notes        the note codes of the last competitor analysis, such as
--                                       'customer_unknown' or 'web_search_failed' (PBI 35). The website turns
--                                       them into Arabic or English sentences.
-- Only the agent server writes them; founders already read their own assessments and results.
-- =========================================================

alter table public.similar_startup_results
  add column if not exists difference text;

alter table public.assessments
  add column if not exists competitor_notes text[] not null default '{}';

comment on column public.similar_startup_results.difference is
  'The judge''s one sentence on how the idea differs from this competitor, in the founder''s language.';
comment on column public.assessments.competitor_notes is
  'Note codes of the last competitor analysis (agent-server schemas/competitor.ts NOTE_CODES).';
