-- =========================================================
-- 0039 — A stored check keeps Confirmed or Likely (Member 1, Tasks 8, 9 and 11)
-- Run once in Supabase: SQL Editor → paste → Run, after 0038. (Safe to run again.)
--
-- startups.validation_status says only pass / fail / null, so a stored pass is always shown as Likely,
-- even when the company was Confirmed (1pass: CR matched by its legal name). The new attribute keeps
-- which one it was:
--   evidence_status  'confirmed' or 'likely' when validation_status = 'pass'; null otherwise
-- Startups saved before this keep null and are shown as Likely until their next check.
--
-- One attribute only: no new table or relation. Only the agent server writes it, so no policy changes.
-- =========================================================

alter table public.startups
  add column if not exists evidence_status text
    check (evidence_status in ('confirmed', 'likely'));

comment on column public.startups.evidence_status is
  'Confirmed or Likely from the last check that passed (validation_status = pass); null otherwise.';
