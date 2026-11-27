-- =========================================================
-- 0035 — Search Darb's startup list by meaning
-- Run once in Supabase: SQL Editor → paste → Run, after 0034.
--
-- search_startups_by_profile(query_embedding) compares one idea's vector with every startup's
-- profile vector (made in Task 1) and returns each startup's closeness (cosine similarity, 0 to 1).
-- The agent server ranks the result by meaning and by keywords, and keeps the 15 closest.
--   * only startups with a profile (Task 1) are compared
--   * startups that failed the validity re-check (Task 9) are left out, so closed companies never appear
--   * only the server (secret key) may call it
--
-- It replaces match_startups (0006 era): the earlier design's cosine-only search, no longer used by the code.
-- No table or row is changed.
-- =========================================================

drop function if exists public.match_startups(extensions.vector, integer, double precision);

create or replace function public.search_startups_by_profile(query_embedding extensions.vector(1536))
returns table (
  startup_id              text,
  startup_name            text,
  startup_name_ar         text,
  startup_description     text,
  profile_text            text,
  website                 text,
  ecosystemsa_profile_url text,
  similarity              double precision
)
language sql
stable
set search_path = public, extensions
as $$
  select s.startup_id, s.startup_name, s.startup_name_ar, s.startup_description, s.profile_text,
         s.website, s.ecosystemsa_profile_url,
         1 - (s.embedding <=> query_embedding) as similarity
  from public.startups s
  where s.embedding is not null
    and s.profile_text is not null
    and (s.validation_status is null or s.validation_status <> 'fail')
  order by s.embedding <=> query_embedding;
$$;

revoke all on function public.search_startups_by_profile(extensions.vector) from public, anon, authenticated;
grant execute on function public.search_startups_by_profile(extensions.vector) to service_role;
