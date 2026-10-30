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
 ├── delegate-competitor-analysis → Competitor Agent
 │                                   ├── web-search
 │                                   ├── similarity-search
 │                                   ├── extract-and-verify-profile
 │                                   └── build-comparison-matrix
 └── predict-survival → ML service
```

The two tools of the Conversational Agent are connected. The Competitor Agent's four tools are not built yet, and `predict-survival` returns `model_not_connected` until the ML service is ready.

## Where everything goes

| To work on | Put it in |
|---|---|
| An agent or its instructions | `src/mastra/agents/` |
| A tool's code | `src/mastra/tools/`, one file per tool |
| Tavily search | `src/mastra/tools/web-search.ts` |
| Approved websites | `src/mastra/config/approved-domains.ts` |
| Which AI model each agent uses | `src/mastra/config/models.ts` |
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

The Conversational Agent only knows its two tools. You can change the Competitor Agent's tools without touching it, as long as `delegate-competitor-analysis` keeps the same output.

## Arabic and English

- Agents reply in the founder's language. There is one set of instructions, written in English.
- Web search covers both languages, because a startup may appear in only one.
- Tools return numbers and fixed codes, such as `model_not_connected`, instead of sentences. The agent or the website turns them into words.
- Company names stay as the source writes them.
- Test every change in both languages.
