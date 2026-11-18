// The website's chat route: POST /chat (Hala, 17 Nov 2026).
// Mastra's own route (/api/agents/conversationalAgent/stream) sends the website everything the agents do, including
// the Competitor Agent's whole run: about 197 KB for one analysis, in 126 pieces of up to 36 KB, over 30 seconds,
// for a reply of one sentence. On a phone (5G, Safari) that long, heavy answer was cut and the founder saw
// "Darb could not reach its assistant", although the server had answered (live test, 17 Nov 2026).
// This route runs the same Conversational Agent, with the same login check, and sends only what the website uses:
//   data: {"type":"text-delta","payload":{"text":"..."}}   the reply, piece by piece
//   data: {"type":"error","payload":{"message":"..."}}      the agent stopped with an error
//   data: {"type":"status","payload":{"step":"..."}}       what Darb is doing now (lib/progress.ts, 18 Nov 2026)
//   data: [DONE]                                            the end
// and a short ": still working" line every 5 seconds, so a phone or a proxy never sees a silent connection.
// The format is the one the website already reads (frontend/shared/agent.js), so only the address changed there.
import { registerApiRoute } from '@mastra/core/server';
import type { RequestContext } from '@mastra/core/request-context';
import { listenToProgress } from '../lib/progress';

export const KEEP_ALIVE_MS = 5_000;

type Body = { text?: unknown; threadId?: unknown; assessmentId?: unknown };

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
          for await (const chunk of output.fullStream as AsyncIterable<{ type: string; payload?: { text?: string; error?: unknown } }>) {
            if (chunk.type === 'text-delta' && chunk.payload?.text) send(line({ type: 'text-delta', payload: { text: chunk.payload.text } }));
            else if (chunk.type === 'error') {
              console.error('Chat: the agent stopped with an error:', chunk.payload?.error);
              send(line({ type: 'error', payload: { message: 'The agent stopped with an error' } }));
            }
          }
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

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' },
    });
  },
});
