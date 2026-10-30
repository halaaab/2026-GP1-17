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

5. Open http://localhost:4111 to use Mastra Studio, a test page for chatting with the agents.

6. Choose **Agent** and send `Hello, what can you do?`. If it answers, you are set up.

To stop the server, press `Ctrl + C` in the terminal.

## Be careful with the example agent

The agent called **Agent** came with the Mastra template. It is only here to check that the setup works, and it will be removed before we build Darb's agents.

It can run commands on your computer and create schedules that keep using paid OpenAI credit. Skip its suggested prompts, and decline any request to run a command or change a file.

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

## Folders

| Folder | What goes in it |
|---|---|
| `src/mastra/agents/` | The AI agents |
| `src/mastra/tools/` | The actions an agent can take |
| `src/mastra/config/` | Settings, such as the approved websites and the models |
| `src/mastra/lib/` | Shared helpers, such as the Supabase connection |
