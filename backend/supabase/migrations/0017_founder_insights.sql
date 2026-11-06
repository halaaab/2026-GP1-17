-- =========================================================
-- 0017 — Founders page: the Insights tab and type-specific details
-- Run once in Supabase: SQL Editor → paste → Run, after 0016.
-- (Safe to run again: it replaces what an earlier run created.)
--
-- The sign-up answers for each user type were saved but never shown to admins.
-- The function now also returns them, plus how far each founder has got:
--   has_idea             described at least one startup idea
--   finished_assessment  has at least one completed assessment
--   came_back            signed in or started something a day or more after joining
-- New columns change the function's result, so it is dropped and created again.
-- No table changes: founders see nothing different.
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
  region                  text,
  field_of_study          text,
  education_level         text,
  has_prior_venture       boolean,
  project_sector          text,
  project_stage           text,
  current_business_sector text,
  business_age            text,
  business_size           text,
  investor_type           text,
  status_description      text,
  locale                  text,
  status                  text,
  created_at              timestamptz,
  assessments_count       bigint,
  has_idea                boolean,
  finished_assessment     boolean,
  came_back               boolean
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
    select u.user_id, u.full_name, u.username, a.email::text, u.user_type, u.region,
           u.field_of_study, u.education_level, u.has_prior_venture,
           u.project_sector, u.project_stage,
           u.current_business_sector, u.business_age, u.business_size,
           u.investor_type, u.status_description,
           u.locale, u.status, u.created_at,
           (select count(*)
              from public.assessments ass
              join public.startup_ideas idea on idea.idea_id = ass.idea_id
             where idea.user_id = u.user_id) as assessments_count,
           exists (select 1 from public.startup_ideas idea
                    where idea.user_id = u.user_id) as has_idea,
           exists (select 1
                     from public.assessments ass
                     join public.startup_ideas idea on idea.idea_id = ass.idea_id
                    where idea.user_id = u.user_id
                      and ass.completed_at is not null) as finished_assessment,
           (a.last_sign_in_at >= u.created_at + interval '1 day'
            or exists (select 1 from public.startup_ideas idea
                        where idea.user_id = u.user_id
                          and idea.created_at >= u.created_at + interval '1 day')
           ) is true as came_back
    from public.users u
    join auth.users a on a.id = u.user_id
    order by u.created_at desc;
end;
$$;

revoke execute on function public.admin_list_founders() from public, anon;
grant  execute on function public.admin_list_founders() to authenticated;
