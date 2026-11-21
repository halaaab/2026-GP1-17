// Tests for the Competitor Agent foundation: the delegation checks, the note sentences and the result builders.
// The database and OpenAI are never called.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DelegationCompleteContext, DelegationStartContext } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';

const ASSESSMENT = '11111111-1111-4111-8111-111111111111';
const IDEA = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';

// The database: this founder owns ASSESSMENT, which belongs to IDEA.
vi.mock('../../src/mastra/lib/assessments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/mastra/lib/assessments')>()),
  loadOwnedAssessment: vi.fn(async (assessmentId: string, userId: string) =>
    assessmentId === ASSESSMENT && userId === USER ? { assessment_id: ASSESSMENT, idea_id: IDEA } : null,
  ),
}));

const { competitorDelegation, onCompetitorDelegationComplete, onCompetitorDelegationStart, COMPETITOR_AGENT_ID } = await import(
  '../../src/mastra/lib/competitor-delegation'
);
const { NOTE_TEXT, noteSentences } = await import('../../src/mastra/lib/competitor-notes');
const { fallbackResult, pendingResult, profileFromKnownFacts } = await import('../../src/mastra/lib/competitor-result');
const { finalizeResultTool, HANDOFF_KEY, STARTED_AT_KEY } = await import('../../src/mastra/tools/finalize-result');
const { NOTE_CODES, Result, Handoff } = await import('../../src/mastra/schemas/competitor');

const written = {
  mode: 'new',
  language: 'ar',
  idea_text: 'تطبيق يربط المطاعم بالمزارع المحلية لطلب الخضار الطازجة',
  known_facts: { customer: 'المطاعم' },
};

let call = 0;
function startContext(prompt: string, values: Record<string, unknown> = { assessmentId: ASSESSMENT, userId: USER }) {
  const requestContext = new RequestContext();
  for (const [k, v] of Object.entries(values)) requestContext.set(k, v);
  return { primitiveId: COMPETITOR_AGENT_ID, prompt, requestContext, toolCallId: `call-${++call}` } as unknown as DelegationStartContext;
}

function completeContext(toolCallId: string, toolResult: unknown) {
  return {
    primitiveId: COMPETITOR_AGENT_ID,
    toolCallId,
    result: { text: 'Done.', subAgentToolResults: [{ toolName: 'finalize_result', toolCallId: 'x', result: toolResult }] },
  } as unknown as DelegationCompleteContext;
}

describe('note sentences', () => {
  it('has a sentence for every note code, in Arabic and English', () => {
    for (const code of NOTE_CODES) {
      expect(NOTE_TEXT[code].en.length).toBeGreaterThan(10);
      expect(NOTE_TEXT[code].ar).toMatch(/[؀-ۿ]/);
    }
  });

  it('returns the notes in the founder’s language, in order', () => {
    expect(noteSentences(['capability_pending'], 'en')).toEqual([NOTE_TEXT.capability_pending.en]);
    expect(noteSentences(['none_found', 'customer_unknown'], 'ar')).toEqual([NOTE_TEXT.none_found.ar, NOTE_TEXT.customer_unknown.ar]);
  });
});

describe('result builders', () => {
  const handoff = Handoff.parse({ ...written, assessment_id: ASSESSMENT, idea_id: IDEA });

  it('keeps stated facts as stated and marks the rest unknown, never guessed', () => {
    const profile = profileFromKnownFacts(handoff);
    expect(profile.customer).toEqual({ value: 'المطاعم', origin: 'stated' });
    expect(profile.problem).toEqual({ value: null, origin: 'unknown' });
  });

  it('builds a valid capability_pending result and a valid fallback', () => {
    const pending = pendingResult(handoff, { durationMs: 12.6, traceId: 't1' });
    expect(Result.safeParse(pending).success).toBe(true);
    expect(pending).toMatchObject({ status: 'complete', competitors: [], iss: null, notes: ['capability_pending'] });
    expect(pending.usage).toEqual({ tavily_calls: 0, duration_ms: 13, trace_id: 't1' });

    const fallback = fallbackResult(null, { durationMs: 5, traceId: null });
    expect(Result.safeParse(fallback).success).toBe(true);
    expect(fallback).toMatchObject({ status: 'partial', notes: ['analysis_incomplete'] });
  });
});

describe('finalize_result', () => {
  const run = (values: Record<string, unknown>) => {
    const requestContext = new RequestContext();
    for (const [k, v] of Object.entries(values)) requestContext.set(k, v);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return finalizeResultTool.execute!({}, { requestContext } as any);
  };

  it('returns the capability_pending result for a valid handoff', async () => {
    const handoff = { ...written, assessment_id: ASSESSMENT, idea_id: IDEA };
    const result = await run({ [HANDOFF_KEY]: handoff, [STARTED_AT_KEY]: Date.now() });
    expect(result).toMatchObject({ status: 'complete', notes: ['capability_pending'] });
  });

  it('returns the fallback when there is no valid handoff', async () => {
    expect(await run({})).toMatchObject({ status: 'partial', notes: ['analysis_incomplete'] });
  });
});

describe('delegation: before the Competitor Agent runs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adds the ids from the server, and passes only the checked handoff', async () => {
    const ctx = startContext(`\`\`\`json\n${JSON.stringify(written)}\n\`\`\``);
    const decision = await onCompetitorDelegationStart(ctx);
    expect(decision?.proceed).toBe(true);
    const handoff = ctx.requestContext.get(HANDOFF_KEY) as Record<string, unknown>;
    expect(handoff).toMatchObject({ ...written, assessment_id: ASSESSMENT, idea_id: IDEA });
    expect(decision?.modifiedPrompt).toContain(IDEA);
  });

  it('refuses ids written by the model', async () => {
    const decision = await onCompetitorDelegationStart(startContext(JSON.stringify({ ...written, idea_id: IDEA })));
    expect(decision?.proceed).toBe(false);
  });

  it.each([
    ['not JSON', 'Please analyse this idea about restaurants.'],
    ['a handoff with no idea', JSON.stringify({ mode: 'new', language: 'en' })],
    ['a guessed field', JSON.stringify({ ...written, sector: 'Retail' })],
  ])('rejects %s, with a reason', async (_name, prompt) => {
    const decision = await onCompetitorDelegationStart(startContext(prompt));
    expect(decision?.proceed).toBe(false);
    expect(decision?.rejectionReason).toBeTruthy();
  });

  it('rejects when there is no assessment, or it belongs to another founder', async () => {
    expect((await onCompetitorDelegationStart(startContext(JSON.stringify(written), { userId: USER })))?.proceed).toBe(false);
    const other = startContext(JSON.stringify(written), { assessmentId: ASSESSMENT, userId: '44444444-4444-4444-8444-444444444444' });
    expect((await onCompetitorDelegationStart(other))?.proceed).toBe(false);
  });

  it('shows the Competitor Agent none of the founder’s chat', async () => {
    const messages = [{ role: 'user' as const, content: 'my private details' }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = competitorDelegation.messageFilter!({ messages, primitiveId: COMPETITOR_AGENT_ID } as any);
    expect(await filter).toEqual([]);
  });
});

describe('delegation: after the Competitor Agent runs', () => {
  async function started() {
    const ctx = startContext(JSON.stringify(written));
    await onCompetitorDelegationStart(ctx);
    return ctx;
  }

  it('passes on finalize_result’s result, with the notes in the founder’s language', async () => {
    const ctx = await started();
    const handoff = Handoff.parse(ctx.requestContext.get(HANDOFF_KEY));
    const reply = await onCompetitorDelegationComplete(completeContext(ctx.toolCallId, pendingResult(handoff, { durationMs: 1, traceId: null })));
    const parsed = JSON.parse(reply!.resultText);
    expect(Result.safeParse(parsed.result).success).toBe(true);
    expect(parsed.result.notes).toEqual(['capability_pending']);
    expect(parsed.note_sentences).toEqual([NOTE_TEXT.capability_pending.ar]);
  });

  it('replaces an invalid or missing result with one rebuilt in code, never the invented one (16 Nov 2026)', async () => {
    for (const bad of [{ status: 'complete', competitors: [{ name: 'Invented Co' }] }, undefined]) {
      const ctx = await started();
      const parsed = JSON.parse((await onCompetitorDelegationComplete(completeContext(ctx.toolCallId, bad)))!.resultText);
      expect(Result.safeParse(parsed.result).success).toBe(true);
      expect(parsed.result.competitors).toEqual([]); // nothing was found in this run, so nothing is shown
      expect(JSON.stringify(parsed)).not.toContain('Invented Co');
    }
  });

  it('leaves a rejected delegation’s message alone', async () => {
    expect(await onCompetitorDelegationComplete(completeContext('never-started', undefined))).toBeUndefined();
  });
});

describe('delegation: decided in code from what the founder wrote', () => {
  function withFounderMessages(prompt: string, founder: string[]) {
    const ctx = startContext(prompt);
    (ctx as unknown as { messages: unknown[] }).messages = founder.map((content) => ({ role: 'user', content }));
    return ctx;
  }

  it('uses the language of the founder’s last message, not the model’s choice', async () => {
    const ctx = withFounderMessages(JSON.stringify({ ...written, language: 'ar', idea_text: 'Healthy lunch boxes for offices' }), [
      'Healthy lunch boxes for offices in Dammam',
    ]);
    await onCompetitorDelegationStart(ctx);
    expect((ctx.requestContext.get(HANDOFF_KEY) as { language: string }).language).toBe('en');
  });

  it('drops known facts the founder never said', async () => {
    const handoff = { ...written, language: 'en', idea_text: 'Healthy lunch boxes for offices in Dammam', known_facts: { customer: 'offices in Dammam', problem: 'Busy workers skip meals' } };
    const ctx = withFounderMessages(JSON.stringify(handoff), ['Healthy lunch boxes for offices in Dammam']);
    await onCompetitorDelegationStart(ctx);
    expect((ctx.requestContext.get(HANDOFF_KEY) as { known_facts: unknown }).known_facts).toEqual({ customer: 'offices in Dammam' });
  });

  it('fills the reply rules shared with the supervisor’s run', async () => {
    const ctx = withFounderMessages(JSON.stringify(written), ['تطبيق يربط المطاعم بالمزارع المحلية']);
    const rules = { sentences: [] as string[], language: null as string | null };
    ctx.requestContext.set('darbReplyRules', rules);
    await onCompetitorDelegationStart(ctx);
    const handoff = Handoff.parse(ctx.requestContext.get(HANDOFF_KEY));
    await onCompetitorDelegationComplete(completeContext(ctx.toolCallId, pendingResult(handoff, { durationMs: 1, traceId: null })));
    expect(rules).toEqual({ sentences: [NOTE_TEXT.capability_pending.ar], language: 'ar', codeWritesReply: true });
  });
});
