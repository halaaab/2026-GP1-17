-- =========================================================
-- 0037 — An idea keeps its profile, so the same idea always gives the same result (Member 1, Task 2)
-- Run once in Supabase: SQL Editor → paste → Run, after 0036. (Safe to run again.)
--
-- The design (§4, §12): an idea's profile is made once and reused, so searching the same idea twice
-- gives the same competitors. The search needs two things from the profile:
--   startup_ideas.embedding     its vector (already there, from 0032), for the search by meaning
--   startup_ideas.profile_text  its readable profile with the keywords (new), for the search by keywords
-- Same column, same format as startups.profile_text (Task 1).
--
-- One attribute only: no new table or relation. Only the agent server writes it; founders already
-- read their own ideas (existing policy), so no policy changes.
-- =========================================================

alter table public.startup_ideas
  add column if not exists profile_text text;

comment on column public.startup_ideas.profile_text is
  'Structured profile of the idea (problem, customer, offering, market, keywords in Arabic and English), in English. '
  'Made once and reused; startup_ideas.embedding is the vector of this text. Design §4, §12, §16.';
