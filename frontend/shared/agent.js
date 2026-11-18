/* ==========================================================
   Agent: the ONE place that talks to the Darb agent server.

   The agent server (folder agent-server) runs the Conversational Agent, which
   hands the competitor analysis to the Competitor Agent. The website sends it
   one founder message at a time; the agent remembers the rest of the
   conversation itself (Mastra memory), by thread and founder.

     import { askDarb } from '../../../shared/agent.js';
     const reply = await askDarb({
       text: 'A booking app for home bakers in Riyadh',
       assessmentId: '...',          // the assessment this conversation belongs to
       threadId: '...',              // the agent's conversation id for it
       onText: (soFar) => { ... },   // called as the reply arrives, with the text so far
       onStatus: (step) => { ... },  // optional: what Darb is doing now ('understanding', 'searching_web', ...)
     });
     // reply = the full text of Darb's answer

   It uses the server's chat route: POST /chat (17 Nov 2026; before, Mastra's own
   /api/agents/conversationalAgent/stream). The answer comes back as a stream of small
   "data: {...}" lines (server-sent events); the pieces of text are the lines whose
   type is "text-delta". Lines starting with ":" only keep the connection alive.

   Security: no API key is ever in this file. The server checks the founder's
   Supabase login (the access token below) and takes the founder's id from it.
   ========================================================== */

import { AGENT_SERVER_URL } from './config.js';
import { supabase } from './supabase.js';

/* Thrown when Darb could not answer. kind = 'signin' (login not accepted) or 'offline' (anything else) */
export class AgentError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

export async function askDarb({ text, assessmentId, threadId, onText = () => {}, onStatus = () => {} }) {
  // the founder's login: the server checks it and knows who they are from it
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) throw new AgentError('signin', 'Not signed in');

  let response;
  try {
    // /chat sends only Darb's reply text (agent-server/src/mastra/server/chat-route.ts). Mastra's own
    // route also sent every step of the competitor analysis (about 197 KB), which phones cut off.
    response = await fetch(`${AGENT_SERVER_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        // only the new message: the agent keeps the earlier ones in its memory
        text,
        // this conversation; the founder is taken from the login on the server
        threadId,
        // the agent needs the assessment to run the competitor analysis
        assessmentId,
      }),
    });
  } catch (error) {
    // the server is not running, or the browser blocked the call (CORS)
    throw new AgentError('offline', error.message);
  }

  if (response.status === 401) throw new AgentError('signin', await response.text());
  if (!response.ok || !response.body) throw new AgentError('offline', `The agent server answered ${response.status}`);

  // Read the stream piece by piece. A piece of the stream may end in the middle
  // of a line, so the unfinished end is kept in "waiting" until the rest arrives.
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let waiting = '';
  let reply = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    waiting += decoder.decode(value, { stream: true });
    const lines = waiting.split('\n');
    waiting = lines.pop();   // the last line may not be complete yet

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;   // events are separated by empty lines
      const json = line.slice('data: '.length);
      if (json === '[DONE]') continue;

      let chunk;
      try {
        chunk = JSON.parse(json);
      } catch {
        continue;   // not a piece we understand: skip it
      }

      if (chunk.type === 'text-delta') {
        reply += chunk.payload.text;
        onText(reply);
      } else if (chunk.type === 'status') {
        onStatus(chunk.payload.step);   // what Darb is doing now, e.g. "searching_web"
      } else if (chunk.type === 'error') {
        console.error('Agent: the agent server reported an error:', chunk.payload);
        throw new AgentError('offline', 'The agent stopped with an error');
      }
    }
  }

  if (!reply.trim()) throw new AgentError('offline', 'The agent sent no text');
  return reply;
}
