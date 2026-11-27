// The website's chat route: POST /chat.
// Mastra's own route (/api/agents/conversationalAgent/stream) sends the website everything the agents do, including
// the Competitor Agent's whole run: about 197 KB for one analysis, in 126 pieces of up to 36 KB, over 30 seconds,
// for a reply of one sentence. On a phone (5G, Safari) that long, heavy answer was cut and the founder saw
// "Darb could not reach its assistant", although the server had answered.
// This route runs the same Conversational Agent, with the same login check, and sends only what the website uses:
//   data: {"type":"text-delta","payload":{"text":"..."}}   the reply, piece by piece
//   data: {"type":"error","payload":{"message":"..."}}      the agent stopped with an error
// data: {"type":"status","payload":{"step":"..."}} what Darb is doing now (lib/progress.ts)
//   data: [DONE]                                            the end
// A conversation that opens with only a greeting ("hi", "السلام عليكم") is answered at once from code (lib/greeting.ts).
// and a short ": still working" line every 5 seconds, so a phone or a proxy never sees a silent connection.
// The format is the one the website already reads (frontend/shared/agent.js), so only the address changed there.
import { registerApiRoute } from '@mastra/core/server';
import type { RequestContext } from '@mastra/core/request-context';
import { greetingIn, greetingReply } from '../lib/greeting';
import { listenToProgress } from '../lib/progress';
import { REPLY_RULES_KEY, type ReplyRules } from '../lib/reply-guard';

export const KEEP_ALIVE_MS = 5_000;

type Body = { text?: unknown; threadId?: unknown; assessmentId?: unknown };

// True when the agent has no saved messages for this conversation yet (one quick read). If it cannot tell,
// the message goes to the agent as usual.
async function isNewConversation(agent: { getMemory?: () => unknown }, threadId: string): Promise<boolean> {
  try {
    const memory = (await agent.getMemory?.()) as { getThreadById?: (args: { threadId: string }) => Promise<unknown> } | undefined;
    if (!memory?.getThreadById) return false;
    return !(await memory.getThreadById({ threadId }));
  } catch {
    return false;
  }
}

export const chatRoute = registerApiRoute('/chat', {
  method: 'POST',
  handler: async (c) => {
    const requestContext = c.get('requestContext') as RequestContext;
    // Set by the login check (server/auth.ts) from the founder's token; never taken from the body.
    const userId = requestContext.get('userId') as string | undefined;
    if (!userId) return c.json({ error: 'Please sign in to use Darb.' }, 401);

    const body = (await c.req.json().catch(() => ({}))) as Body;
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const threadId = typeof body.threadId === 'string' ? body.threadId : '';
    const assessmentId = typeof body.assessmentId === 'string' ? body.assessmentId : '';
    if (!text || !threadId || !assessmentId) return c.json({ error: 'text, threadId and assessmentId are needed.' }, 400);
    requestContext.set('assessmentId', assessmentId);

    const agent = c.get('mastra').getAgent('conversationalAgent');
    const encoder = new TextEncoder();
    const line = (data: unknown) => encoder.encode(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`);
    const headers = { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' };

    // A conversation that opens with only a greeting gets Darb's welcome at once, from code (lib/greeting.ts).
    const greeting = greetingIn(text);
    if (greeting && (await isNewConversation(agent, threadId))) {
      const reply = line({ type: 'text-delta', payload: { text: greetingReply(greeting) } });
      return new Response(new Blob([reply, line('[DONE]')]).stream(), { headers });
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let open = true;
        const send = (bytes: Uint8Array) => {
          if (!open) return;
          try {
            controller.enqueue(bytes);
          } catch {
            open = false; // the founder left: the run still finishes, so the analysis is saved
          }
        };
        const keepAlive = setInterval(() => send(encoder.encode(': still working\n\n')), KEEP_ALIVE_MS);
        const stopListening = listenToProgress(assessmentId, (step) => send(line({ type: 'status', payload: { step } })));
        try {
          const output = await agent.stream(text, { requestContext, memory: { thread: threadId, resource: userId } });
          // The model's words are held until it is clear whether it calls a tool:
          // before delegating it sometimes wrote "Please hold on…" or praised the idea, and that text
          // reached the founder glued to the result sentence. Text written before a tool call is dropped; the answer
          // after it (written by code for an analysis) is sent at once; a reply without any tool is sent at the end.
          let pending = '';
          let afterTool = false;
          const sendText = (t: string) => send(line({ type: 'text-delta', payload: { text: t } }));
          // When code writes the whole reply (an analysis's result, or its one question), it is known as soon as the
          // Competitor Agent returns: the founder gets it and the end at once, instead of after the model's last step
          // and its memory update (13 s later on one measured analysis). The run goes on to the end, so the agent's
          // memory still saves the same reply (lib/reply-guard.ts writes it there).
          const finishEarly = () => {
            const rules = requestContext.get(REPLY_RULES_KEY) as ReplyRules | undefined;
            if (!rules?.codeWritesReply || !rules.sentences.length) return;
            sendText(rules.sentences.join('\n'));
            send(line('[DONE]'));
            clearInterval(keepAlive);
            stopListening();
            if (open) controller.close();
            open = false;
          };
          for await (const chunk of output.fullStream as AsyncIterable<{ type: string; payload?: { text?: string; error?: unknown; toolName?: string } }>) {
            if (chunk.type === 'tool-result' && chunk.payload?.toolName === 'agent-competitorAgent') {
              finishEarly();
            } else if (chunk.type === 'text-delta' && chunk.payload?.text) {
              if (afterTool) sendText(chunk.payload.text);
              else pending += chunk.payload.text;
            } else if (chunk.type === 'tool-call' && chunk.payload?.toolName && chunk.payload.toolName !== 'updateWorkingMemory') {
              pending = ''; // what it said before using the tool is not part of the answer
              afterTool = true;
            } else if (chunk.type === 'error') {
              console.error('Chat: the agent stopped with an error:', chunk.payload?.error);
              send(line({ type: 'error', payload: { message: 'The agent stopped with an error' } }));
            }
          }
          if (pending) sendText(pending);
        } catch (error) {
          console.error('Chat: the agent could not answer:', error);
          send(line({ type: 'error', payload: { message: 'The agent could not answer' } }));
        } finally {
          clearInterval(keepAlive);
          stopListening();
          send(line('[DONE]'));
          if (open) controller.close();
        }
      },
    });

    return new Response(stream, { headers });
  },
});
