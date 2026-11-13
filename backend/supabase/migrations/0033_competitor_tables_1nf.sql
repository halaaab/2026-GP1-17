-- =========================================================
-- 0033 — Competitor Agent tables follow the design (1NF), after 0032
-- Run once in Supabase: SQL Editor → paste → Run, after 0032.
--
--   startups.name_aliases (a list)        → the relation startup_name_aliases
--   similar_startup_results.sources (a list) → the relation result_sources
--   similar_startup_results: the 6 test rows saved before 0032 are deleted,
--   similarities and differences are dropped (comparison and reason replace them),
--   and label and evidence_status become required.
--
-- Not done here: startups.embed_text is dropped once the corpus is embedded again
-- from profile_text (decision of 2026-11-11).
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1. startup_name_aliases: other spellings of a startup's name (multivalued attribute name_aliases)
-- ---------------------------------------------------------
create table public.startup_name_aliases (
  startup_id text not null references public.startups (startup_id) on delete cascade on update cascade,
  alias      text not null check (length(trim(alias)) > 0),   -- an Arabic or English spelling
  primary key (startup_id, alias)
);

insert into public.startup_name_aliases (startup_id, alias)
  select distinct startup_id, trim(a) from public.startups, unnest(name_aliases) a where trim(a) <> '';

alter table public.startups drop column name_aliases;

-- same access as startups: everyone reads, only admins change
alter table public.startup_name_aliases enable row level security;
create policy "everyone reads startup aliases" on public.startup_name_aliases for select using (true);
create policy "admins add startup aliases"     on public.startup_name_aliases for insert with check ((select public.is_admin()));
create policy "admins delete startup aliases"  on public.startup_name_aliases for delete using ((select public.is_admin()));
revoke all on public.startup_name_aliases from anon, authenticated;
grant select on public.startup_name_aliases to anon, authenticated;
grant insert, delete on public.startup_name_aliases to authenticated;


-- ---------------------------------------------------------
-- 2. similar_startup_results: remove the old test rows and the old columns
-- ---------------------------------------------------------
delete from public.similar_startup_results where label is null or evidence_status is null;

alter table public.similar_startup_results
  drop column similarities,
  drop column differences,
  alter column label set not null,
  alter column evidence_status set not null;


-- ---------------------------------------------------------
-- 3. result_sources: the pages that support a competitor (multivalued composite attribute sources)
-- ---------------------------------------------------------
create table public.result_sources (
  result_id   uuid not null references public.similar_startup_results (result_id) on delete cascade,
  url         text not null check (url ~ '^https?://'),
  source_type text not null check (source_type in ('official_site', 'app_store', 'ecosystem', 'news', 'government')),
  accessed_at timestamptz not null,
  primary key (result_id, url)
);

insert into public.result_sources (result_id, url, source_type, accessed_at)
  select r.result_id, s ->> 'url', s ->> 'source_type', (s ->> 'accessed_at')::timestamptz
  from public.similar_startup_results r, jsonb_array_elements(coalesce(r.sources, '[]'::jsonb)) s
  on conflict do nothing;

alter table public.similar_startup_results drop column sources;

-- same access as the results: a founder reads the sources of their own assessments;
-- only the agent server (service role) writes them
alter table public.result_sources enable row level security;
create policy "founder reads own result sources" on public.result_sources for select
  using (exists (select 1 from public.similar_startup_results r
                 where r.result_id = result_sources.result_id and public.owns_assessment(r.assessment_id)));
revoke all on public.result_sources from anon, authenticated;
grant select on public.result_sources to authenticated;

commit;
