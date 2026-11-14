# Darb agent server

This is the server that runs Darb's AI agents. It is built with [Mastra](https://mastra.ai) and TypeScript.

## Setup

You need Node.js 22.13 or newer. Check with `node -v`.

Run these commands from the `agent-server` folder:

1. Install the packages:

   ```bash
   npm install
   ```

2. Create your own keys file from the template:

   ```bash
   cp .env.example .env
   ```

3. Open `.env` and fill in the keys. Each key has a comment explaining what it is. Get the shared keys privately from Hala, never through GitHub or a group chat.

4. Start the server:

   ```bash
   npm run dev
   ```

5. Open http://localhost:4111 to use Mastra Studio, a test page for chatting with the agents. If you can see **Conversational Agent**, you are set up.

To stop the server, press `Ctrl + C` in the terminal.

On Windows, if PowerShell says "running scripts is disabled on this system", write `npm.cmd` instead of `npm` (for example `npm.cmd run dev`). It does the same thing.

## Project rules

- Use TypeScript, with Zod schemas for every tool input and output.
- The agent decides how to search, but code decides anything that produces a number or writes to the database.
- Tools take the user id from the authenticated session, never from agent input.
- No secrets in code or commits.

## The agents

| Agent | Job |
|---|---|
| Conversational Agent | The supervisor and the only agent that talks to the founder. It decides what each message is (a new idea, a follow-up, a what-if or something else), delegates to the Competitor Agent and presents its checked result. It runs at temperature 0, so the same message gets the same decision. |
| Competitor Agent | A child agent of the Conversational Agent. Understands the idea (or asks one question when it is too vague) and returns a checked result. Discover, Identify and Validate (Member 1) are being built; until a search has run it returns the note `capability_pending`. |
| Founder Roadmap Agent | Builds the ordered roadmap of regulatory and practical steps. |

## How the agents connect

The design is in `Darb_Competitor_Agent_Design` (Version 4) and the explainer for the supervisor meeting. The Competitor
Agent is a child agent of the Conversational Agent (Mastra supervisor pattern: `agents: { competitorAgent }`). It never
talks to the founder.

```
Conversational Agent  (talks to the founder, temperature 0)
 ├── competitor-agent  → Competitor Agent   (child agent)
 │                        ├── understand_idea   (the idea profile; one question when it is too vague)
 │                        ├── judge_candidates  (ready; connected together with Discover)
 │                        └── finalize_result   (builds the Result in code and saves it)
 ├── get_competitor_result  (follow-up questions, from the saved result, never a new search)
 └── predict_survival
```

The shapes they exchange are in `src/mastra/schemas/competitor.ts`: Handoff, IdeaProfile, Candidate, JudgeOutput and Result.
During one run, the capabilities share what they found through the run state (`lib/competitor-run.ts`): the profile,
the candidates, the judge's answers and the counters. Discover and Validate add their candidates there and log a
`discover` step.

How facts stay true (`src/mastra/lib/competitor-delegation.ts`, Mastra's delegation hooks):
- Before the Competitor Agent runs, the handoff the supervisor wrote is checked against the Handoff schema
  (empty optional fields are dropped first), and the server adds `assessment_id` and `idea_id`. The model never chooses them.
- The Competitor Agent sees only the handoff, not the founder's chat.
- After it runs, only finalize_result's output is used, checked against the Result schema (or replaced by a valid
  fallback). Notes are codes; `src/mastra/lib/competitor-notes.ts` turns them, the ISS and market lines and the
  competitive opportunities into Arabic or English sentences, which the supervisor copies word for word.

Decided in code, never by a model:
- The founder's language, from their own message (`lib/founder-text.ts`).
- Stated facts only: a known fact the founder never said is dropped before the Competitor Agent sees it (`lib/founder-text.ts`).
- When the idea lacks the problem or the offering, the founder gets exactly one question, written in code (`lib/understand.ts`).
  If the supervisor forgets to pass the founder's answer on the next call, the hook adds it.
- When an analysis has no competitors to show, or asks a question, the founder sees exactly those sentences: the reply guard
  (`lib/reply-guard.ts`, a Mastra input and output processor) writes them into the stream and drops the model's own words.
- One log line per run in the shared format (`RunLog` in `schemas/competitor.ts`): ids, codes and timings, never the idea text.

`src/mastra/lib/idea-profile.ts` turns an idea or a startup description into the structured profile that is embedded.
A sector code in the wrong form is left empty instead of failing the whole profile.

## The reasoning part (Member 2)

The judge only answers questions; everything the founder sees is decided by rules in code.

- **Judge** (`lib/judge.ts`): one candidate per OpenAI call, temperature 0. It answers same, partly, different, unknown or
  conflicting for the problem, the customer and the offering, quoting the sentence it relies on, and writes one
  difference sentence. At most 25 calls per run.
- **Policy rules** (`lib/competitor-policy.ts`): a "same" without a quote that is really in the company's page becomes
  "unknown". Direct needs the same problem, the same customer and a customer the founder stated; otherwise Indirect.
  Same sector or topic only is never a competitor. Articles, the founder's own startup and references ("like Talabat")
  are never shown.
- **Ranking**: only Confirmed or Likely companies with a source and a description; Confirmed first, then the closest;
  one per company; at most three.
- **ISS**: each competitor's score from the answers (problem 50%, customer 30%, offering 20%; same = full, partly = half),
  the top three combined with the closest counting most. Likely counts slightly less.
- **Market level**: valid direct competitors: Open 0–2, Competitive 3–5, Crowded 6+.
- **Competitive opportunities**: five fixed rules per competitor, checked in order (customer different, customer partly,
  offering different or partly, all the same, anything else), each with a fixed next step.
- **Limits** (`config/limits.ts`): 5 analyses a day and 30 a month per founder (a re-run of today's assessment is free),
  and a 2-minute time limit per run.
- **What-if** (`lib/what-if.ts`): runs only after the founder answered Darb's confirmation question. It is a new assessment
  of the same idea; its link and short name are in its `confirmed_inputs` (`what_if_of`, `what_if_label`). The founder
  gets an exact before → after comparison. A what-if with nothing saved is removed again.

All the numbers that are tuned on the development set are in `config/scoring.ts` and `config/limits.ts`.

## What is saved

`lib/competitor-store.ts` saves each finished analysis (only Darb's own outputs, never page text):

| Where | What |
|---|---|
| `similar_startup_results` | up to three competitors: label, evidence status, reason, comparison, score, opportunity (migration 0036) and the judge's difference sentence (0038) |
| `result_sources` | each competitor's evidence links (url, source type, date checked) |
| `assessments` | `iss`, `iss_basis`, `market_level`, the note codes in `competitor_notes` (0038), and `analysed_at` (used for the daily and monthly limits) |

## Login and security

Every API request is checked before any agent runs (`src/mastra/server/auth.ts`):

- The website sends the founder's Supabase access token: `Authorization: Bearer <token>`.
- The server checks it with Supabase and that the account is active, then uses the user id **from the token**.
  An id the caller types is ignored, so a founder can never reach another founder's data.
- `AUTH_MODE=dev` lets Mastra Studio work without signing in, for testing. Live, use `AUTH_MODE=required`.

Mastra's own data (memory, threads, live traces) is in Supabase, in the `mastra` schema, so it survives restarts on the host.

## Scripts

| Command | What it does |
|---|---|
| `npm test` | Runs the automated tests with fake databases and fake AI (no keys, no cost, a few seconds). |
| `npm run test:coverage` | The same tests, plus how much of the code they cover. |
| `npm run test:live -- <username>` | A real chat with the real agents, OpenAI and Supabase: English, Arabic, streamed like the website, a vague idea and a what-if (15 checks, about 2 minutes, a fraction of a cent). Deletes its test data at the end. Run it before a demo. |
| `npm run classify:startups` | Gives each startup its ISIC4 section and division (only startups without one). Add `-- --dry-run --limit 20` to preview without saving. |
| `npm run test:assessment -- <username>` | Creates a test idea and assessment for that founder, and prints the request context to paste into Studio. |

## Where everything goes

| To work on | Put it in |
|---|---|
| An agent or its instructions | `src/mastra/agents/` |
| A tool's code | `src/mastra/tools/`, one file per tool |
| Tavily search | `src/mastra/tools/web-search.ts` |
| Approved websites | `src/mastra/config/approved-domains.ts` |
| Which AI model each agent uses | `src/mastra/config/models.ts` |
| Usage limits (judge calls, time, daily and monthly analyses) | `src/mastra/config/limits.ts` |
| ISS weights, market-level cut-offs, ISS words | `src/mastra/config/scoring.ts` |
| The ISIC4 sections (sector) | `src/mastra/config/sectors.ts` |
| The 85 ISIC4 divisions (sub-sector), from GASTAT's SSIC file | `src/mastra/config/isic-divisions.ts` |
| The shapes agents and tools exchange | `src/mastra/schemas/competitor.ts` |
| What one run has found so far | `src/mastra/lib/competitor-run.ts` |
| The clarification rules and questions | `src/mastra/lib/understand.ts` |
| The judge's prompt | `src/mastra/lib/judge.ts` |
| Policy rules, ranking, ISS, market level, opportunities | `src/mastra/lib/competitor-policy.ts` |
| Every sentence the founder sees from an analysis (Arabic and English) | `src/mastra/lib/competitor-notes.ts` |
| Saving and reading results, the limits | `src/mastra/lib/competitor-store.ts` |
| What-if | `src/mastra/lib/what-if.ts` |
| The Supabase connection | `src/mastra/lib/supabase.ts` |
| Registering a new agent | `src/mastra/index.ts` |
| Calling the model from the agents | `src/mastra/tools/predict-survival.ts` |
| The model's FastAPI service | `ml/src/` in the repository root |
| A new key | Your own `.env`, with its name and a comment added to `.env.example` |

## Add or remove a tool

To add a tool:

1. Write it in its own file in `src/mastra/tools/`, with Zod schemas for what goes in and comes out.
2. Add it to the `tools` list of the agent that uses it, in `src/mastra/agents/`.
3. Test it in Studio.
4. Push your own branch and open a pull request to `dev`.

To remove a tool, delete its file and its line in the agent's `tools` list.

You can change the Competitor Agent's tools without touching the supervisor, as long as `finalize_result` still returns
a valid Result.

## Arabic and English

- Agents reply in the founder's language. There is one set of instructions, written in English.
- Web search covers both languages, because a startup may appear in only one.
- Tools return numbers and fixed codes, such as `model_not_connected`, instead of sentences. The agent or the website turns them into words.
- Company names stay as the source writes them.
- Test every change in both languages.
