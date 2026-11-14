-- =========================================================
-- 0019 — What-if scenarios
-- Run once in Supabase: SQL Editor → paste → Run, after 0018.
-- (Safe to run again.)
--
-- A founder can ask "what if I targeted Jeddah?" after an assessment.
-- Each what-if is a new assessment of the same idea, so the original results stay as they are.
--   parent_assessment_id  the assessment this what-if was changed from (null for the original)
--   scenario_label        a short name for the change, e.g. "Jeddah instead of Riyadh"
--   scenario_inputs       the inputs this what-if used: idea_text, sector, region,
--                         and later capital_sar and sells_online for the survival model
--   iss                   the Idea Similarity Score, saved by finalize_competitors
-- Only the agent server writes these columns: founders get no new insert or update rights,
-- and they can already read their own assessments.
-- No data changes: existing assessments become originals with no parent.
-- =========================================================

alter table public.assessments
  add column if not exists parent_assessment_id uuid references public.assessments (assessment_id) on delete set null,
  add column if not exists scenario_label       text,
  add column if not exists scenario_inputs      jsonb,
  add column if not exists iss                  numeric(4,1) check (iss between 0 and 100);

create index if not exists assessments_parent on public.assessments (parent_assessment_id);
