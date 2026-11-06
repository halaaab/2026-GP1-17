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

## Project rules

- Use TypeScript, with Zod schemas for every tool input and output.
- The agent decides how to search, but code decides anything that produces a number or writes to the database.
- Tools take the user id from the authenticated session, never from agent input.
- No secrets in code or commits.

## The agents

| Agent | Job |
|---|---|
| Conversational Agent | The supervisor and the only agent that talks to the founder. It runs the assessment and delegates to the other two. |
| Competitor Agent | Finds similar startups and computes the Idea Similarity Score. |
| Founder Roadmap Agent | Builds the ordered roadmap of regulatory and practical steps. |

## How the agents connect

```
Conversational Agent
 ├── delegate_competitor_analysis → Competitor Agent
 │                                   ├── similarity_search
 │                                   └── finalize_competitors (top 3, ISS, saves the result)
 │                                   (the result also carries the comparison matrix, built in code)
 ├── get_competitor_details   (follow-up questions, from the database)
 └── run_what_if              (creates a changed version, analyses it, returns the exact before → after)
```

The website starts each conversation with `userId` and `assessmentId` in the request context.
`web_search`, `extract-and-verify-profile` and `predict-survival` are not connected yet.

How numbers stay true: similarity_search records every startup it really returns. finalize_competitors accepts only those,
with the search's own name, description and score, and delegate_competitor_analysis returns only finalize_competitors' result,
never the Competitor Agent's own text.

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
| `npm run test:live -- <username>` | A real chat with the real agents, OpenAI, Tavily and Supabase, checked against the database (16 checks, about 2 minutes, a few cents). Deletes its test data at the end. Run it before a demo. |
| `npm run classify:startups` | Gives each startup its ISIC4 section and division (only startups without one). Add `-- --dry-run --limit 20` to preview without saving. |
| `npm run embed:startups` | Embeds every startup that has no embedding yet. Safe to run again. |
| `npm run test:assessment -- <username>` | Creates a test idea and assessment for that founder, and prints the request context to paste into Studio. |

## Where everything goes

| To work on | Put it in |
|---|---|
| An agent or its instructions | `src/mastra/agents/` |
| A tool's code | `src/mastra/tools/`, one file per tool |
| Tavily search | `src/mastra/tools/web-search.ts` |
| Approved websites | `src/mastra/config/approved-domains.ts` |
| Which AI model each agent uses | `src/mastra/config/models.ts` |
| Usage limits (steps, results, daily analyses) | `src/mastra/config/limits.ts` |
| The ISIC4 sections (sector) founders choose from | `src/mastra/config/sectors.ts` |
| The 85 ISIC4 divisions (sub-sector), from GASTAT's SSIC file | `src/mastra/config/isic-divisions.ts` |
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

You can change the Competitor Agent's tools without touching it, as long as `delegate-competitor-analysis` keeps the same output.

## Arabic and English

- Agents reply in the founder's language. There is one set of instructions, written in English.
- Web search covers both languages, because a startup may appear in only one.
- Tools return numbers and fixed codes, such as `model_not_connected`, instead of sentences. The agent or the website turns them into words.
- Company names stay as the source writes them.
- Test every change in both languages.
