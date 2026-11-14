-- =========================================================
-- 0028 — Remove the recursive "variation of" relationship (for now)
-- Run once in Supabase: SQL Editor → paste → Run, after 0027.
--
-- The what-if tool does not need to store which assessment a variation came
-- from: it receives both assessments directly when it compares them, and all
-- versions of an idea are already grouped by the idea (StartupIdea "evaluated by").
-- The link can be added back later if the finished what-if feature needs it.
-- =========================================================

alter table public.assessments
  drop column parent_assessment_id,
  drop column variation_label;
