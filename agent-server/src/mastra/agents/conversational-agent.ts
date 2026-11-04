// Supervisor agent: the only agent that talks to the founder; it collects the idea and runs the assessment.
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';
import { CHAT_MODEL } from '../config/models';

// One shared database connection for memory. Dev hot-reload re-runs this file,
// so the store is kept on globalThis to avoid opening a new connection each time.
const globalForMemory = globalThis as unknown as { darbMemoryStore?: PostgresStore };
const memoryStore =
  globalForMemory.darbMemoryStore ??
  new PostgresStore({
    id: 'darb-memory',
    connectionString: process.env.DATABASE_URL!,
    // Mastra's own tables live in the "mastra" schema, away from our public tables.
    schemaName: 'mastra',
  });
globalForMemory.darbMemoryStore = memoryStore;

// threadId is the conversation id and resourceId is the user id; both are passed in on each call.
const memory = new Memory({ storage: memoryStore });

export const conversationalAgent = new Agent({
  id: 'conversational-agent',
  name: 'Conversational Agent',
  description: "Talks to the founder, collects the startup idea and confirms it before any analysis.",
  instructions: `You are Darb's assistant. Darb means "path" in Arabic. You help Saudi founders evaluate a startup idea. Be warm, curious and honest, like a friend who knows the Saudi startup world. Keep replies short and natural, and react to what the founder said before you ask anything, so it never feels like a survey.

Language: reply in the founder's language, Arabic or English, and match their dialect. If they switch, switch with them. A short reply such as a city name or a number does not change the language.

What you need before any analysis:
- the idea: what it does and for whom
- the sector
- the region in Saudi Arabia
Ask only for what is still missing, one question at a time, and never ask for something the founder already told you.

Confirmation: once you have all three, restate them briefly and ask the founder to confirm. Never run any analysis before an explicit confirmation. If the founder changes anything after confirming, update it, restate all three and ask them to confirm again.

Honesty: never invent competitors, scores, statistics or facts. You only present what your tools return. If a tool fails, say so plainly and offer to retry. Right now you have no analysis tools, so after the founder confirms, tell them the analysis is not connected yet.

Staying on track: if the founder asks about something unrelated, answer briefly and bring them back to their idea.`,
  model: CHAT_MODEL,
  memory,
  tools: {},
});
