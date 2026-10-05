-- ---------------------------------------------------------
-- 0002 — Onboarding fields
-- Run this once in the Supabase SQL Editor, after 0001.
-- It lets the sign-up page save the new onboarding answers.
-- ---------------------------------------------------------

-- 1. A fifth category: "other"
alter table public.users drop constraint if exists users_user_type_check;
alter table public.users add constraint users_user_type_check
  check (user_type in ('student', 'entrepreneur', 'business_owner', 'investor', 'other'));

-- 2. Academic level can now also be "other"
alter table public.users drop constraint if exists users_education_level_check;
alter table public.users add constraint users_education_level_check
  check (education_level in ('high_school', 'diploma', 'bachelor', 'master', 'phd', 'other'));

-- 3. New answers
--    When someone picks "Other" in a dropdown and types their own answer,
--    the typed words are saved in the same column instead of the word "other".
alter table public.users
  add column if not exists has_prior_venture  boolean,  -- student: took part in a venture before?
  add column if not exists project_sector     text,     -- student / entrepreneur
  add column if not exists project_stage      text,     -- student / entrepreneur
  add column if not exists business_age       text,     -- business owner: lt1, 1_3, 4_5, gt5
  add column if not exists business_size      text,     -- business owner: micro, small, medium, large
  add column if not exists investor_type      text,     -- investor
  add column if not exists status_description text;     -- "other" category: their own words

--    Columns that already existed and are reused:
--      country_code            two-letter country code, for example SA
--      region                  Saudi region, for example riyadh (empty outside Saudi Arabia)
--      field_of_study          student
--      education_level         student
--      current_business_sector business owner
--      organisation_name       investor: the investment entity

-- 4. Let a founder fill in and edit the new columns on their OWN row
--    (the row-level rules from 0001 still decide which row).
grant insert (has_prior_venture, project_sector, project_stage, business_age, business_size, investor_type, status_description)
  on public.users to authenticated;
grant update (has_prior_venture, project_sector, project_stage, business_age, business_size, investor_type, status_description)
  on public.users to authenticated;
