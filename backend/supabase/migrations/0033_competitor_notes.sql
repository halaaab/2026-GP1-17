-- =========================================================
-- 0033 — The competitor analysis notes, saved with the assessment
-- Run once in Supabase: SQL Editor → paste → Run, after 0032.
-- (Safe to run again.)
--
-- Why: the Competitor Analysis screen, History, the report and the PDF show the
-- analysis' notes (customer unknown, market level, web search failed...; PBI 35),
-- not only the chat. They are codes, such as 'customer_unknown'; the website turns
-- them into Arabic or English sentences. Only the agent server writes this column.
-- Founders already read their own assessments, so no new security rules.
-- =========================================================

alter table public.assessments
  add column if not exists competitor_notes text[] not null default '{}';

comment on column public.assessments.competitor_notes is
  'Note codes of the last competitor analysis (agent-server schemas/competitor.ts NOTE_CODES). Design §11.';
