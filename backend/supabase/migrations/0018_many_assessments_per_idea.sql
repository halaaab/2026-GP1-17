-- =========================================================
-- 0018 — One idea can have many assessments
-- Run once in Supabase: SQL Editor → paste → Run, after 0017.
-- (Safe to run again.)
--
-- 0005 allowed one assessment for each idea. A founder should be able to assess
-- the same idea again after changing it, and keep the earlier results.
-- Removing the unique rule also removes its index, so a normal index replaces it
-- to keep looking up an idea's assessments fast.
-- No data changes: existing assessments stay as they are.
-- =========================================================

alter table public.assessments drop constraint if exists assessments_idea_id_key;

create index if not exists assessments_idea on public.assessments (idea_id);
