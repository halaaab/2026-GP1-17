-- =========================================================
-- 0040 — The founder's idea in their own language, shown above the competitor comparison
-- Run once in Supabase: SQL Editor → paste → Run, after 0039. (Safe to run again.)
--
-- The comparison says, for each competitor, whether it solves the same problem, for the same customer, with the
-- same product. The founder needs to see what Darb understood as THEIR problem, customer and product to read it.
-- startup_ideas.profile_text (0037) has them, but in English and with search keywords, for the search only.
--
--   startup_ideas.idea_summary  { "problem": "...", "customer": "...", "offering": "...", "market": "..." }
--                               short sentences in the founder's language; a part Darb does not know is null.
--
-- Written by the agent server in the same call that names the conversation (lib/idea-title.ts), beside the search,
-- so the founder never waits for it. One attribute only: no new table or relation. Founders already read their own
-- ideas (existing policy), so no policy changes.
-- =========================================================

alter table public.startup_ideas
  add column if not exists idea_summary jsonb;

comment on column public.startup_ideas.idea_summary is
  'The idea as Darb understood it, in the founder''s language: problem, customer, offering and market as short '
  'sentences (null when unknown). Shown above the competitor comparison. Written by the agent server.';
