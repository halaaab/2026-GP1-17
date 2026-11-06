-- =========================================================
-- 0020 — When each competitor analysis ran
-- Run once in Supabase: SQL Editor → paste → Run, after 0019.
-- (Safe to run again.)
--
-- Why: each founder may run at most MAX_ANALYSES_PER_DAY competitor analyses a day
-- (agent-server/src/mastra/config/limits.ts). To count today's analyses, the agent
-- server needs to know when each one ran, and no column recorded that.
-- finalize_competitors saves the time here on every analysis it finishes.
-- Only the agent server writes this column. No data changes.
-- =========================================================

alter table public.assessments
  add column if not exists analysed_at timestamptz;

create index if not exists assessments_analysed_at on public.assessments (analysed_at);
