-- =========================================================
-- 0007 — Founders page: number of assessments per founder
-- Run once in Supabase: SQL Editor → paste → Run, after 0006 (and 0004_admin_people).
-- (Safe to run again: it replaces what an earlier run created.)
--
-- An assessment belongs to a founder through their startup idea:
--   assessments.idea_id → startup_ideas.idea_id → startup_ideas.user_id
-- The function now also returns assessments_count. A new column changes the
-- function's result, so it is dropped and created again.
-- =========================================================

drop function if exists public.admin_list_founders();

-- From JS:  supabase.rpc('admin_list_founders')
create function public.admin_list_founders()
returns table (
  user_id                 uuid,
  full_name               text,
  username                text,
  email                   text,
  user_type               text,
  project_sector          text,
  current_business_sector text,
  field_of_study          text,
  locale                  text,
  status                  text,
  created_at              timestamptz,
  assessments_count       bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can list founders';
  end if;

  return query
    select u.user_id, u.full_name, u.username, a.email::text, u.user_type,
           u.project_sector, u.current_business_sector, u.field_of_study,
           u.locale, u.status, u.created_at,
           (select count(*)
              from public.assessments ass
              join public.startup_ideas idea on idea.idea_id = ass.idea_id
             where idea.user_id = u.user_id) as assessments_count
    from public.users u
    join auth.users a on a.id = u.user_id
    order by u.created_at desc;
end;
$$;

revoke execute on function public.admin_list_founders() from public, anon;
grant  execute on function public.admin_list_founders() to authenticated;
