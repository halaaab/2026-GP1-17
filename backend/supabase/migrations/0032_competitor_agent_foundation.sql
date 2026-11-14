-- =========================================================
-- 0032 — Competitor Agent foundation (design: Darb_Competitor_Agent_Design, Version 4, §11 and §16)
-- Run once in Supabase: SQL Editor → paste → Run, after 0031.
-- NOT APPLIED YET: review first.
--
-- similar_startup_results  holds the final competitors (up to 3) of the new design
-- assessments              gets iss_basis and market_level
-- startups                 gets the structured profile and the validation status (corpus freshness)
-- startup_ideas            gets the embedding of the structured idea profile
--
-- Existing columns, rows and Row Level Security policies are kept.
-- Kept on purpose, different from the design:
--   similar_startup_results.startup_id stays text, because startups.startup_id is text.
--   similar_startup_results.similarities and differences stay until they leave the ERD.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1. similar_startup_results
-- ---------------------------------------------------------

-- 1a. result_id becomes a uuid (design §11). No other table points to it.
alter table public.similar_startup_results drop constraint similar_startup_results_pkey;
alter table public.similar_startup_results drop column result_id;
alter table public.similar_startup_results
  add column result_id uuid not null default gen_random_uuid() primary key;

-- 1b. source_type: 'database' is now called 'corpus' (Darb's startups table).
alter table public.similar_startup_results drop constraint similar_startup_results_source_check;
alter table public.similar_startup_results drop constraint similar_startup_results_source_type_check;
alter table public.similar_startup_results alter column source_type drop default;
update public.similar_startup_results set source_type = 'corpus' where source_type = 'database';
alter table public.similar_startup_results
  add constraint similar_startup_results_source_type_check check (source_type in ('corpus', 'web')),
  -- a corpus competitor points to a startup; a web competitor has none, but has a name and a page
  add constraint similar_startup_results_source_check check (
    (source_type = 'corpus' and startup_id is not null)
    or (source_type = 'web' and startup_id is null and competitor_name is not null and source_url is not null)
  );

-- 1c. similarity_score: a whole number 0–100 from the judge's answers (was a cosine score 0–1).
alter table public.similar_startup_results drop constraint similar_startup_results_similarity_score_check;
alter table public.similar_startup_results
  alter column similarity_score type integer using round(similarity_score * 100)::integer;
alter table public.similar_startup_results
  add constraint similar_startup_results_similarity_score_check check (similarity_score between 0 and 100);

-- 1d. rank: 1 to 3, once per assessment.
alter table public.similar_startup_results
  add constraint similar_startup_results_rank_check check (rank between 1 and 3),
  add constraint similar_startup_results_assessment_rank_key unique (assessment_id, rank);

-- 1e. New columns. description already exists (0024).
--     label and evidence_status allow null only for the rows saved before this migration.
alter table public.similar_startup_results
  add column city_region     text,
  add column label           text check (label in ('direct', 'indirect')),
  add column evidence_status text check (evidence_status in ('confirmed', 'likely')),  -- unconfirmed is never saved
  add column reason          text,                                                    -- one sentence
  add column comparison      jsonb,   -- answer + note for problem, customer, offering
  add column sources         jsonb,   -- [{ url, source_type, accessed_at }]
  add column created_at      timestamptz not null default now();


-- ---------------------------------------------------------
-- 2. assessments
-- ---------------------------------------------------------
-- The existing iss column stays empty (null) when nothing is found.
alter table public.assessments
  add column iss_basis    text check (iss_basis in ('full', 'problem_offering_only')),
  add column market_level text check (market_level in ('open', 'competitive', 'crowded'));


-- ---------------------------------------------------------
-- 3. startups (the corpus)
-- ---------------------------------------------------------
alter table public.startups
  add column profile_text      text,                        -- the structured profile, in English (design §16)
  add column name_aliases      text[] not null default '{}', -- Arabic/English spellings, for name matching (design §6)
  add column validation_status text check (validation_status in ('pass', 'fail')), -- null: not checked yet
  add column validated_at      timestamptz;                 -- a check is valid for 90 days (design §8)

comment on column public.startups.embedding is
  'Embedding of the structured profile (profile_text), not of the raw description. Design §16.';
comment on column public.startups.profile_text is
  'Structured profile (problem, customer, offering, market, keywords in Arabic and English), written in English.';


-- ---------------------------------------------------------
-- 4. startup_ideas
-- ---------------------------------------------------------
-- The embedding of the structured idea profile, computed once per idea and reused (design §3, §4, §16).
-- Same model and size as startups.embedding.
alter table public.startup_ideas
  add column embedding extensions.vector(1536);

comment on column public.startup_ideas.embedding is
  'Embedding of the structured idea profile, same model as startups.embedding. Design §16.';

commit;
