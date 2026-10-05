-- ---------------------------------------------------------
-- 0005 — Ideas, assessments and messages
-- Run this once in the Supabase SQL Editor, after 0004.
--
-- Saves the founder's conversations with Darb, so the History page shows
-- them on every device. Columns follow the data dictionary (StartupIdea,
-- Assessment, Message). regulatory_readiness is left out: the current report
-- no longer has it.
--
-- Left for later, because they need tables that do not exist yet:
--   startup_ideas.embedding          (comes with the idea similarity engine)
--   assessments.market_record_id     (needs the market indicators table)
--   similar_startup_results          (needs the startups table)
--   roadmap_steps                    (needs the regulatory requirements table)
--   assessment_reports
-- ---------------------------------------------------------


-- ---------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------

-- One row for each idea a founder describes
create table public.startup_ideas (
  idea_id           uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users (user_id) on delete cascade,
  idea_name         text not null,
  idea_description  text,
  sector            text,
  target_market     text,
  products_services text,
  region            text,
  city              text,
  legal_entity_type text,
  product_type      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);

-- One assessment for each idea (the conversation and its result)
create table public.assessments (
  assessment_id        uuid primary key default gen_random_uuid(),
  idea_id              uuid not null unique references public.startup_ideas (idea_id) on delete cascade,
  thread_id            text,        -- the agent framework's conversation id, to resume later
  language             text not null check (language in ('ar', 'en')),
  status               text not null default 'in_progress' check (status in ('in_progress', 'complete')),
  model_input          jsonb,       -- the answers sent to the survival model
  market_record_id     bigint,      -- becomes a link to the market indicators table later
  survival_percentile  integer check (survival_percentile between 0 and 100),
  sector_viability     integer check (sector_viability    between 0 and 100),
  fis_score            integer check (fis_score           between 0 and 100),   -- 100 x the model's survival probability
  band                 text check (band in ('lower', 'moderate', 'higher')),
  explanation          jsonb,       -- what moved the score, from the explainability engine
  risk_level           text check (risk_level in ('low', 'moderate', 'high')),
  roadmap_generated_at timestamptz,
  started_at           timestamptz not null default now(),
  completed_at         timestamptz
);

-- Every message of the conversation, in order
create table public.messages (
  message_id           bigint generated always as identity primary key,
  assessment_id        uuid not null references public.assessments (assessment_id) on delete cascade,
  sender_role          text not null check (sender_role in ('user', 'agent')),
  agent_name           text,        -- which agent wrote it (Conversational or Roadmap)
  content              jsonb not null,
  tool_calls           jsonb,
  extracted_attributes jsonb,
  created_at           timestamptz not null default now()
);

create index messages_assessment on public.messages (assessment_id, message_id);
create index startup_ideas_user  on public.startup_ideas (user_id);

create trigger startup_ideas_set_updated_at
  before update on public.startup_ideas
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------
-- 2. Security rules
--    A founder sees and changes only their own ideas, assessments and
--    messages. Admins can read ideas and assessments (for the dashboard),
--    but not the messages.
-- ---------------------------------------------------------

alter table public.startup_ideas enable row level security;
alter table public.assessments   enable row level security;
alter table public.messages      enable row level security;

revoke all on public.startup_ideas from anon, authenticated;
revoke all on public.assessments   from anon, authenticated;
revoke all on public.messages      from anon, authenticated;

-- Does this idea belong to the logged-in founder?
create function public.owns_idea(target_idea_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.startup_ideas
    where idea_id = target_idea_id and user_id = (select auth.uid())
  );
$$;

-- Does this assessment belong to the logged-in founder?
create function public.owns_assessment(target_assessment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assessments a
    join public.startup_ideas i on i.idea_id = a.idea_id
    where a.assessment_id = target_assessment_id and i.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.owns_idea(uuid)       from public, anon;
revoke execute on function public.owns_assessment(uuid) from public, anon;
grant  execute on function public.owns_idea(uuid)       to authenticated;
grant  execute on function public.owns_assessment(uuid) to authenticated;

-- ideas
grant select on public.startup_ideas to authenticated;
grant insert (idea_id, user_id, idea_name, idea_description, sector, target_market, products_services, region, city, legal_entity_type, product_type)
  on public.startup_ideas to authenticated;
grant update (idea_name, idea_description, sector, target_market, products_services, region, city, legal_entity_type, product_type)
  on public.startup_ideas to authenticated;

create policy "founder reads own ideas, admins read all"
  on public.startup_ideas for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy "active founder adds own ideas"
  on public.startup_ideas for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_active_user());

create policy "founder updates own ideas"
  on public.startup_ideas for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- assessments
grant select on public.assessments to authenticated;
grant insert (assessment_id, idea_id, language, status, model_input)
  on public.assessments to authenticated;
grant update (language, status, model_input)
  on public.assessments to authenticated;

create policy "founder reads own assessments, admins read all"
  on public.assessments for select to authenticated
  using (public.owns_idea(idea_id) or public.is_admin());

create policy "founder starts own assessments"
  on public.assessments for insert to authenticated
  with check (public.owns_idea(idea_id));

create policy "founder updates own assessments"
  on public.assessments for update to authenticated
  using (public.owns_idea(idea_id))
  with check (public.owns_idea(idea_id));

-- messages: a founder reads and adds messages of their own conversations.
-- Nobody edits or deletes a message.
grant select on public.messages to authenticated;
grant insert (assessment_id, sender_role, agent_name, content)
  on public.messages to authenticated;

create policy "founder reads own messages"
  on public.messages for select to authenticated
  using (public.owns_assessment(assessment_id));

create policy "founder adds own messages"
  on public.messages for insert to authenticated
  with check (public.owns_assessment(assessment_id));


-- ---------------------------------------------------------
-- 3. TEMPORARY, until the agents and the ML service are connected
-- ---------------------------------------------------------
-- Today the website shows a SAMPLE result, and the team chose to save it so
-- History looks complete. That means a founder's browser may write these
-- result columns. A real score must never be writable by the founder.
--
-- >>> When the ML service starts writing results, run this to close it:
--
--   revoke insert (fis_score, band, risk_level, explanation, roadmap_generated_at, completed_at)
--     on public.assessments from authenticated;
--   revoke update (fis_score, band, risk_level, explanation, roadmap_generated_at, completed_at)
--     on public.assessments from authenticated;
--
-- (The backend uses the service key, which is not limited by these rules.)

grant insert (fis_score, band, risk_level, explanation, roadmap_generated_at, completed_at)
  on public.assessments to authenticated;
grant update (fis_score, band, risk_level, explanation, roadmap_generated_at, completed_at)
  on public.assessments to authenticated;
