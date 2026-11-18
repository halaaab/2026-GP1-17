// Tests for the website's chat route, POST /chat (17 Nov 2026): it sends only Darb's reply text, never the agents'
// steps, and only to a signed-in founder. The agent is a fake that streams like Mastra's: nothing is paid for.
import { describe, expect, it } from 'vitest';
import { chatRoute } from '../../src/mastra/server/chat-route';

type Chunk = { type: string; payload?: Record<string, unknown> };

function fakeContext(userId: string | undefined, body: unknown, chunks: Chunk[]) {
  const values = new Map<string, unknown>(userId ? [['userId', userId]] : []);
  const requestContext = { get: (k: string) => values.get(k), set: (k: string, v: unknown) => values.set(k, v) };
  const calls: { text: string; options: any }[] = [];
  const agent = {
    stream: async (text: string, options: unknown) => {
      calls.push({ text, options });
      return { fullStream: (async function* () { yield* chunks; })() };
    },
  };
  const context = {
    get: (k: string) => (k === 'requestContext' ? requestContext : k === 'mastra' ? { getAgent: () => agent } : undefined),
    req: { json: async () => body },
    json: (data: unknown, status: number) => new Response(JSON.stringify(data), { status }),
  };
  return { context, calls, values };
}

const run = (context: unknown) => (chatRoute as unknown as { handler: (c: unknown) => Promise<Response> }).handler(context);
const body = { text: 'A food delivery app in Riyadh', threadId: 'thread-1', assessmentId: 'assessment-1' };

describe('POST /chat', () => {
  it('sends only the reply text and the end, not the steps of the analysis', async () => {
    const { context, calls, values } = fakeContext('founder-1', body, [
      { type: 'start' },
      { type: 'tool-call', payload: { toolName: 'competitorAgent' } },
      { type: 'tool-output', payload: { output: 'x'.repeat(36_000) } },
      { type: 'text-delta', payload: { text: 'Here are ' } },
      { type: 'text-delta', payload: { text: 'your competitors.' } },
      { type: 'finish' },
    ]);
    const response = await run(context);
    const raw = await response.text();

    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(raw).toBe(
      'data: {"type":"text-delta","payload":{"text":"Here are "}}\n\n' +
        'data: {"type":"text-delta","payload":{"text":"your competitors."}}\n\n' +
        'data: [DONE]\n\n',
    );
    // The same agent run as before: the founder from the login, the assessment for the analysis.
    expect(calls[0].text).toBe('A food delivery app in Riyadh');
    expect(calls[0].options.memory).toEqual({ thread: 'thread-1', resource: 'founder-1' });
    expect(values.get('assessmentId')).toBe('assessment-1');
  });

  it('passes an agent error on to the website, then ends', async () => {
    const { context } = fakeContext('founder-1', body, [{ type: 'error', payload: { error: 'model down' } }]);
    const raw = await (await run(context)).text();
    expect(raw).toBe('data: {"type":"error","payload":{"message":"The agent stopped with an error"}}\n\ndata: [DONE]\n\n');
  });

  it('refuses a caller who is not signed in, and a message without its conversation', async () => {
    expect((await run(fakeContext(undefined, body, []).context)).status).toBe(401);
    expect((await run(fakeContext('founder-1', { text: 'hi' }, []).context)).status).toBe(400);
  });
});
