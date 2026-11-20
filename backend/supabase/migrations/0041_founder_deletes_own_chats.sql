-- =========================================================
-- 0041 — A founder can delete their own chats from History
-- Run once in Supabase: SQL Editor → paste → Run, after 0039. (Safe to run again.)
--
-- Until now no table had a DELETE rule, so a founder could not delete anything.
-- Two rules, each limited to the founder's OWN rows:
--   assessments     the chat itself (its idea must belong to the founder)
--   startup_ideas   the idea, removed when its last chat is deleted
-- The chat's messages, competitor results (and their links) and roadmap steps are
-- removed with it by the "on delete cascade" links that already exist (migration 0005 on).
--
-- No new table, attribute or relationship. Admins get no delete rule here.
-- =========================================================

-- 0005 removed every table permission from founders ("revoke all"), so they need the
-- DELETE permission as well; the rules below still limit it to their own rows.
-- (Messages and competitor results need nothing: the database removes them itself.)
grant delete on public.startup_ideas, public.assessments to authenticated;

drop policy if exists "founder deletes own assessments" on public.assessments;
create policy "founder deletes own assessments"
  on public.assessments for delete to authenticated
  using (owns_idea(idea_id));

drop policy if exists "founder deletes own ideas" on public.startup_ideas;
create policy "founder deletes own ideas"
  on public.startup_ideas for delete to authenticated
  using (founder_id = (select auth.uid()));
