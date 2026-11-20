-- =========================================================
-- 0042 — Release 1 data model: the database matches the final EER diagram
-- Run once in Supabase: SQL Editor → paste → Run, after 0041.
--
--   1. startups.embed_text is removed: every startup is now embedded from profile_text,
--      and no code reads embed_text.
--   2. startups.validation_status and startups.evidence_status become one attribute:
--      validation_status = confirmed / likely / fail (null: not checked yet).
--      evidence_status only repeated "which kind of pass" (0039).
--   3. startup_name_aliases is removed: the Competitor Agent keeps a company's other
--      spellings only while it runs, and never saved any (the table is empty).
--   4. assessments.competitor_notes (a list) becomes the relation assessment_competitor_notes,
--      one row per note code: a multivalued attribute is mapped to its own relation (1NF),
--      like requirement_isic_sections and result_sources.
-- =========================================================

begin;

-- 1. embed_text
alter table public.startups drop column embed_text;


-- 2. one attribute for the result of a startup's check
alter table public.startups drop constraint startups_validation_status_check;

-- a stored pass becomes the kind of pass it was; a pass saved before 0039 has no kind and is shown as Likely
update public.startups
set validation_status = coalesce(evidence_status, 'likely')
where validation_status = 'pass';

alter table public.startups
  add constraint startups_validation_status_check check (validation_status in ('confirmed', 'likely', 'fail'));

alter table public.startups drop column evidence_status;

comment on column public.startups.validation_status is
  'Result of the last check that the startup still operates: confirmed, likely or fail; null until it is checked.';


-- 3. startup_name_aliases
drop table public.startup_name_aliases;


-- 4. assessment_competitor_notes (the multivalued attribute competitor_notes)
create table public.assessment_competitor_notes (
  assessment_id uuid not null references public.assessments (assessment_id) on delete cascade,
  note_code     text not null check (note_code in (
    'capability_pending', 'none_found', 'fewer_than_three', 'only_indirect', 'customer_unknown',
    'web_search_failed', 'judge_call_failed', 'web_changed', 'temporarily_unavailable',
    'analysis_incomplete', 'daily_limit_reached', 'monthly_limit_reached', 'time_limit_reached')),
  primary key (assessment_id, note_code)
);

insert into public.assessment_competitor_notes (assessment_id, note_code)
  select distinct assessment_id, note from public.assessments, unnest(competitor_notes) note;

alter table public.assessments drop column competitor_notes;

-- same access as the assessment: the founder reads their own, admins read all; only the agent server writes
alter table public.assessment_competitor_notes enable row level security;
create policy "founder reads own competitor notes, admins read all"
  on public.assessment_competitor_notes for select
  using (public.owns_assessment(assessment_id) or public.is_admin());
revoke all on public.assessment_competitor_notes from anon, authenticated;
grant select on public.assessment_competitor_notes to authenticated;

commit;
