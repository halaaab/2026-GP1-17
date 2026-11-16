// Tests for what-if analyses: the confirmation rule, the new linked assessment, removing it when nothing was saved,
// the limits, and the before → after comparison. The database is a small fake: nothing real is touched.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import type { DelegationCompleteContext, DelegationStartContext } from '@mastra/core/agent';

const ASSESSMENT = '11111111-1111-4111-8111-111111111111';
const WHAT_IF = '55555555-5555-4555-8555-555555555555';
const IDEA = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const NOW = '2026-11-11T10:00:00+03:00';

// ---------------------------------------------------------------------------
// A fake Supabase: records every query; answers from `db`.
// ---------------------------------------------------------------------------
type Call = { table: string; op: string; values?: unknown; filters: unknown[][] };
const calls: Call[] = [];
const db = { countToday: 0, original: null as null | { analysed_at: string; iss: number; market_level: string }, originalRows: [] as unknown[] };

function query(table: string) {
  const call: Call = { table, op: 'select', filters: [] };
  calls.push(call);
  const answer = () => {
    if (call.op === 'insert') return { data: { assessment_id: WHAT_IF }, error: null };
    if (call.op !== 'select') return { data: null, error: null };
    if (call.filters.some(([op]) => op === 'gte')) return { count: db.countToday, error: null };
    if (table === 'similar_startup_results') return { data: db.originalRows, error: null };
    return { data: db.original ?? { analysed_at: null }, error: null };
  };
  const builder = {
    select: () => builder,
    insert: (values: unknown) => ((call.op = 'insert'), (call.values = values), builder),
    delete: () => ((call.op = 'delete'), builder),
    eq: (...f: unknown[]) => (call.filters.push(['eq', ...f]), builder),
    gte: (...f: unknown[]) => (call.filters.push(['gte', ...f]), builder),
    not: (...f: unknown[]) => (call.filters.push(['not', ...f]), builder),
    order: () => builder,
    single: async () => answer(),
    maybeSingle: async () => answer(),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(answer()).then(resolve, reject),
  };
  return builder;
}
vi.mock('../../src/mastra/lib/supabase', () => ({ getSupabase: () => ({ from: query }) }));
vi.mock('../../src/mastra/lib/assessments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/mastra/lib/assessments')>()),
  loadOwnedAssessment: vi.fn(async (assessmentId: string, userId: string) =>
    assessmentId === ASSESSMENT && userId === USER ? { assessment_id: ASSESSMENT, idea_id: IDEA, language: 'en' } : null,
  ),
}));

const { askedBeforeLatestReply, compareResults, comparisonSentences } = await import('../../src/mastra/lib/what-if');
const { onCompetitorDelegationStart, onCompetitorDelegationComplete, COMPETITOR_AGENT_ID } = await import('../../src/mastra/lib/competitor-delegation');
const { RUN_STATE_KEY } = await import('../../src/mastra/lib/competitor-run');
const { HANDOFF_KEY } = await import('../../src/mastra/tools/finalize-result');
const { MAX_ANALYSES_PER_DAY } = await import('../../src/mastra/config/limits');
const { Result } = await import('../../src/mastra/schemas/competitor');
type RunStateT = import('../../src/mastra/lib/competitor-run').RunState;

beforeEach(() => {
  calls.length = 0;
  Object.assign(db, { countToday: 0, original: null, originalRows: [] });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

const profile = {
  problem: { value: 'Gym access', origin: 'stated' as const },
  customer: { value: 'People who exercise', origin: 'stated' as const },
  offering: { value: 'One subscription', origin: 'stated' as const },
  market: { value: 'Jeddah', origin: 'stated' as const },
  sector: { isic_section: null, isic_division: null },
  business_model: null,
  keywords_en: [],
  keywords_ar: [],
};
const competitor = (rank: number, name: string, website: string) => ({
  rank,
  name,
  website,
  description: 'Gyms.',
  city_region: 'Jeddah',
  source_type: 'web' as const,
  label: 'direct' as const,
  evidence_status: 'confirmed' as const,
  reason: 'Same.',
  comparison: { problem: { answer: 'same' as const, note: '' }, customer: { answer: 'same' as const, note: '' }, offering: { answer: 'same' as const, note: '' } },
  sources: [{ url: `${website}/about`, source_type: 'official_site' as const, accessed_at: NOW }],
  similarity_score: 90,
});
const resultWith = (competitors: ReturnType<typeof competitor>[], iss: number | null, market: 'open' | 'competitive' | null) =>
  Result.parse({
    status: 'complete',
    idea_profile: profile,
    competitors,
    iss,
    iss_basis: iss === null ? null : 'full',
    market_level: market,
    notes: competitors.length ? [] : ['none_found'],
    usage: { tavily_calls: 0, duration_ms: 1, trace_id: null },
  });

describe('the confirmation rule', () => {
  const msg = (role: string, content: unknown) => ({ role, content });

  it('is met when Darb asked a question and the founder answered it', () => {
    expect(askedBeforeLatestReply([msg('user', 'Gyms in Riyadh'), msg('assistant', 'Same idea in Jeddah. Shall I run it?'), msg('user', 'yes')])).toBe(true);
    expect(askedBeforeLatestReply([msg('assistant', [{ type: 'text', text: 'نفس الفكرة في جدة. هل أبدأ؟' }]), msg('user', 'نعم')])).toBe(true);
  });

  it('is not met on a first mention, or when Darb did not ask', () => {
    expect(askedBeforeLatestReply([msg('user', 'what if I targeted Jeddah?')])).toBe(false);
    expect(askedBeforeLatestReply([msg('assistant', 'Here are your competitors.'), msg('user', 'what if Jeddah?')])).toBe(false);
    expect(askedBeforeLatestReply(undefined)).toBe(false);
  });
});

describe('the before → after comparison', () => {
  const original = { analysed_at: NOW, iss: 64, iss_basis: 'full' as const, market_level: 'open' as const,
    competitors: [{ ...competitor(1, 'FitPass', 'https://fitpass.sa'), startup_id: null }, { ...competitor(2, 'Old Gym', 'https://oldgym.sa'), startup_id: null }] };

  it('finds the new and dropped competitors and the score and market changes', () => {
    const after = resultWith([competitor(1, 'FitPass', 'https://www.fitpass.sa'), competitor(2, 'Jeddah Gyms', 'https://jgyms.sa')], 78, 'competitive');
    const c = compareResults(original, after);
    expect(c).toEqual({
      original_analysed: true,
      iss: { before: 64, after: 78 },
      market_level: { before: 'open', after: 'competitive' },
      new_competitors: ['Jeddah Gyms'],
      dropped_competitors: ['Old Gym'],
    });
    expect(comparisonSentences(c, 'en')).toEqual([
      'Compared with your original idea: Idea Similarity Score 64 (moderate similarity) → 78 (higher similarity).',
      'Market: Open → Competitive.',
      'New competitors: Jeddah Gyms.',
      'No longer shown: Old Gym.',
    ]);
    expect(comparisonSentences(c, 'ar')[1]).toBe('السوق: مفتوح ← تنافسي.');
  });

  it('says so when the original was never analysed, or nothing changed', () => {
    expect(comparisonSentences(compareResults(null, resultWith([], null, null)), 'en')).toEqual(['Your original idea has no saved analysis to compare with.']);
    const same = compareResults(original, resultWith([competitor(1, 'FitPass', 'https://fitpass.sa'), competitor(2, 'Old Gym', 'https://oldgym.sa')], 64, 'open'));
    expect(comparisonSentences(same, 'en').at(-1)).toBe('The same competitors appear in both versions.');
  });
});

// ---------------------------------------------------------------------------
// The delegation
// ---------------------------------------------------------------------------
const whatIf = { mode: 'what_if', language: 'en', idea_text: 'One subscription for many gyms in Jeddah', scenario_label: 'Jeddah instead of Riyadh' };
const confirmed = [
  { role: 'user', content: 'One subscription for many gyms in Riyadh' },
  { role: 'assistant', content: 'Same idea, but in Jeddah instead of Riyadh. Shall I run it?' },
  { role: 'user', content: 'Yes please' },
];
let n = 0;
function start(prompt: object, messages: object[] = confirmed) {
  const requestContext = new RequestContext();
  requestContext.set('assessmentId', ASSESSMENT);
  requestContext.set('userId', USER);
  const ctx = { primitiveId: COMPETITOR_AGENT_ID, prompt: JSON.stringify(prompt), requestContext, toolCallId: `w-${++n}`, messages } as unknown as DelegationStartContext;
  return ctx;
}
const complete = (ctx: DelegationStartContext, result: unknown) =>
  onCompetitorDelegationComplete({
    primitiveId: COMPETITOR_AGENT_ID,
    toolCallId: ctx.toolCallId,
    result: { text: 'Done.', subAgentToolResults: [{ toolName: 'finalize_result', toolCallId: 'x', result }] },
  } as unknown as DelegationCompleteContext);

describe('delegation: a what-if', () => {
  it('needs a short name for the change', async () => {
    const { scenario_label: _label, ...noLabel } = whatIf;
    const decision = await onCompetitorDelegationStart(start(noLabel));
    expect(decision).toMatchObject({ proceed: false });
    expect(decision?.rejectionReason).toContain('scenario_label');
  });

  it('is refused until the founder answered Darb’s confirmation question, and creates nothing', async () => {
    const decision = await onCompetitorDelegationStart(start(whatIf, [{ role: 'user', content: 'what if I targeted Jeddah?' }]));
    expect(decision).toMatchObject({ proceed: false });
    expect(decision?.rejectionReason).toContain('Confirm the what-if first');
    expect(calls.some((c) => c.op === 'insert')).toBe(false);
  });

  it('runs on a new assessment linked to this one, and compares it with the original', async () => {
    db.original = { analysed_at: NOW, iss: 64, market_level: 'open' };
    const ctx = start(whatIf);
    expect((await onCompetitorDelegationStart(ctx))?.proceed).toBe(true);

    const insert = calls.find((c) => c.op === 'insert');
    expect(insert?.values).toMatchObject({ idea_id: IDEA, confirmed_inputs: { idea_text: whatIf.idea_text, what_if_of: ASSESSMENT, what_if_label: 'Jeddah instead of Riyadh' } });
    expect(insert?.values).not.toHaveProperty('parent_assessment_id'); // no new relation
    expect(ctx.requestContext.get(HANDOFF_KEY)).toMatchObject({ mode: 'what_if', assessment_id: WHAT_IF, idea_id: IDEA });

    // the run saved its result
    (ctx.requestContext.get(RUN_STATE_KEY) as RunStateT).steps.push({ capability: 'guardrails', outcome: 'ok', duration_ms: 1, detail: 'shown=1 saved' });
    const reply = JSON.parse((await complete(ctx, resultWith([competitor(1, 'Jeddah Gyms', 'https://jgyms.sa')], 78, 'competitive')))!.resultText);
    expect(reply.comparison_sentences[0]).toContain('64 (moderate similarity) → 78 (higher similarity)');
    expect(calls.some((c) => c.op === 'delete')).toBe(false);
  });

  it('removes the new assessment when nothing was saved for it', async () => {
    const ctx = start(whatIf);
    await onCompetitorDelegationStart(ctx);
    const reply = JSON.parse((await complete(ctx, resultWith([], null, null)))!.resultText);
    expect(reply).not.toHaveProperty('comparison_sentences');
    await new Promise((r) => setTimeout(r, 0));
    const removed = calls.find((c) => c.op === 'delete');
    expect(removed?.filters).toContainEqual(['eq', 'assessment_id', WHAT_IF]);
    expect(removed?.filters).toContainEqual(['not', 'confirmed_inputs->>what_if_of', 'is', null]); // never an original
  });

  it('counts towards the limits, and creates nothing when the founder has none left', async () => {
    db.countToday = MAX_ANALYSES_PER_DAY;
    const ctx = start(whatIf);
    const decision = await onCompetitorDelegationStart(ctx);
    expect(decision?.modifiedPrompt).toContain('call finalize_result now');
    expect((ctx.requestContext.get(RUN_STATE_KEY) as RunStateT).limitNote).toBe('daily_limit_reached');
    expect(calls.some((c) => c.op === 'insert')).toBe(false);
  });
});
