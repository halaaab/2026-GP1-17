// Tests for step 3: saving and reading results, the analysis limits, the follow-up tool, the clarification
// question shown word for word, and the run's time limit. The database is a small fake: nothing real is touched.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import type { DelegationCompleteContext, DelegationStartContext } from '@mastra/core/agent';

const ASSESSMENT = '11111111-1111-4111-8111-111111111111';
const IDEA = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const NOW = '2026-11-11T10:00:00+03:00';

// ---------------------------------------------------------------------------
// A fake Supabase: every query is recorded, and answers come from `db`.
// ---------------------------------------------------------------------------
type Call = { table: string; op: string; values?: unknown; filters: [string, string, unknown][] };
const calls: Call[] = [];
const db = {
  analysedAt: null as string | null, // this assessment's analysed_at
  countToday: 0,
  countMonth: 0,
  fail: false,
  rows: [] as Record<string, unknown>[],
  assessmentRow: null as Record<string, unknown> | null,
};

function query(table: string) {
  const call: Call = { table, op: 'select', filters: [] };
  calls.push(call);
  const answer = () => {
    if (db.fail) return { data: null, count: null, error: new Error('db down') };
    if (call.op !== 'select') return { data: null, error: null };
    if (table === 'similar_startup_results') return { data: db.rows, error: null };
    // analysisLimit counts today first, then this month
    if (call.filters.some(([op, column]) => op === 'gte' && column === 'analysed_at')) {
      const countsSoFar = calls.filter((c) => c.filters.some(([op]) => op === 'gte')).length;
      return { count: countsSoFar === 1 ? db.countToday : db.countMonth, error: null };
    }
    return { data: db.assessmentRow ?? { analysed_at: db.analysedAt }, error: null };
  };
  const builder = {
    select: () => builder,
    delete: () => ((call.op = 'delete'), builder),
    insert: (values: unknown) => ((call.op = 'insert'), (call.values = values), builder),
    update: (values: unknown) => ((call.op = 'update'), (call.values = values), builder),
    eq: (column: string, value: unknown) => (call.filters.push(['eq', column, value]), builder),
    gte: (column: string, value: unknown) => (call.filters.push(['gte', column, value]), builder),
    order: () => builder,
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

const store = await import('../../src/mastra/lib/competitor-store');
const { onCompetitorDelegationStart, onCompetitorDelegationComplete, pendingQuestions, withoutEmptyFields, COMPETITOR_AGENT_ID } = await import(
  '../../src/mastra/lib/competitor-delegation'
);
const { RUN_STATE_KEY, newRunState } = await import('../../src/mastra/lib/competitor-run');
const { finalizeResultTool, HANDOFF_KEY, STARTED_AT_KEY } = await import('../../src/mastra/tools/finalize-result');
const { getCompetitorResultTool } = await import('../../src/mastra/tools/get-competitor-result');
const { judgeCandidatesTool } = await import('../../src/mastra/tools/judge-candidates');
const { NOTE_TEXT } = await import('../../src/mastra/lib/competitor-notes');
const { CLARIFY_QUESTIONS } = await import('../../src/mastra/lib/understand');
const { MAX_ANALYSES_PER_DAY, MAX_ANALYSES_PER_MONTH, RUN_TIME_LIMIT_MS } = await import('../../src/mastra/config/limits');
const { Result } = await import('../../src/mastra/schemas/competitor');
type ResultT = import('../../src/mastra/schemas/competitor').Result;
type CandidateT = import('../../src/mastra/schemas/competitor').Candidate;

beforeEach(() => {
  calls.length = 0;
  Object.assign(db, { analysedAt: null, countToday: 0, countMonth: 0, fail: false, rows: [], assessmentRow: null });
  pendingQuestions.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

const profile = {
  problem: { value: 'Restaurants struggle to buy fresh vegetables', origin: 'stated' as const },
  customer: { value: 'Restaurants', origin: 'stated' as const },
  offering: { value: 'An ordering app', origin: 'stated' as const },
  market: { value: null, origin: 'unknown' as const },
  sector: { isic_section: null, isic_division: null },
  business_model: null,
  keywords_en: [],
  keywords_ar: [],
};
const competitor = (rank: number, source_type: 'web' | 'corpus' = 'web') => ({
  rank,
  name: `Co ${rank}`,
  website: `https://co${rank}.sa`,
  description: 'Supplies restaurants.',
  city_region: 'Riyadh',
  source_type,
  ...(source_type === 'corpus' ? { startup_id: `s${rank}` } : {}),
  label: 'direct' as const,
  evidence_status: 'confirmed' as const,
  reason: 'Same problem for restaurants.',
  comparison: {
    problem: { answer: 'same' as const, note: 'x' },
    customer: { answer: 'same' as const, note: 'x' },
    offering: { answer: 'partly' as const, note: 'x' },
  },
  sources: [{ url: `https://co${rank}.sa/about`, source_type: 'official_site' as const, accessed_at: NOW }],
  similarity_score: 90,
  opportunity: 'no_clear_difference' as const,
  difference: null,
});
const result = (competitors = [competitor(1), competitor(2, 'corpus')]): ResultT =>
  Result.parse({
    status: 'complete',
    idea_profile: profile,
    competitors,
    iss: competitors.length ? 90 : null,
    iss_basis: competitors.length ? 'full' : null,
    market_level: competitors.length ? 'open' : null,
    notes: competitors.length ? ['fewer_than_three'] : ['none_found'],
    usage: { tavily_calls: 0, duration_ms: 1, trace_id: null },
  });

describe('Saudi day and month', () => {
  it('start at midnight Saudi time (21:00 UTC the day before)', () => {
    const now = new Date('2026-11-11T22:30:00Z'); // already 12 November in Riyadh
    expect(store.startOfSaudiDay(now)).toBe('2026-11-11T21:00:00.000Z');
    expect(store.startOfSaudiMonth(now)).toBe('2026-10-31T21:00:00.000Z');
  });
});

describe('saving a result', () => {
  it('replaces the assessment’s competitors and saves the ISS, basis, market level and time', async () => {
    await store.saveResult(ASSESSMENT, result());
    expect(calls.map((c) => `${c.table}:${c.op}`)).toEqual(['similar_startup_results:delete', 'similar_startup_results:insert', 'assessments:update']);
    const rows = calls[1].values as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ assessment_id: ASSESSMENT, rank: 1, source_type: 'web', startup_id: null, competitor_name: 'Co 1', source_url: 'https://co1.sa/about', label: 'direct' });
    expect(rows[1]).toMatchObject({ source_type: 'corpus', startup_id: 's2' });
    expect(rows[0]).not.toHaveProperty('evidence_text');
    expect(rows[0]).toMatchObject({ opportunity: 'no_clear_difference', differences: null });
    expect(calls[2].values).toMatchObject({ iss: 90, iss_basis: 'full', market_level: 'open', competitor_notes: ['fewer_than_three'] });
    expect((calls[2].values as { analysed_at: string }).analysed_at).toBeTruthy();
  });

  it('saves "none found" without rows, and throws when the database fails', async () => {
    await store.saveResult(ASSESSMENT, result([]));
    expect(calls.map((c) => c.op)).toEqual(['delete', 'update']);
    db.fail = true;
    await expect(store.saveResult(ASSESSMENT, result())).rejects.toThrow('db down');
  });

  it('reads the saved result back, in rank order', async () => {
    db.assessmentRow = { analysed_at: NOW, iss: '90.0', iss_basis: 'full', market_level: 'open' };
    db.rows = store.resultRows(ASSESSMENT, result().competitors);
    const stored = await store.loadStoredResult(ASSESSMENT);
    expect(stored).toMatchObject({ analysed_at: NOW, iss: 90, iss_basis: 'full', market_level: 'open' });
    expect(stored.competitors.map((c) => c.name)).toEqual(['Co 1', 'Co 2']);
  });
});

describe('the analysis limits', () => {
  it('lets a founder under the limits analyse', async () => {
    expect(await store.analysisLimit(USER, ASSESSMENT)).toBeNull();
  });

  it('stops a new analysis at the daily, then the monthly limit', async () => {
    db.countToday = MAX_ANALYSES_PER_DAY;
    expect(await store.analysisLimit(USER, ASSESSMENT)).toBe('daily_limit_reached');
    db.countToday = 0;
    db.countMonth = MAX_ANALYSES_PER_MONTH;
    calls.length = 0;
    expect(await store.analysisLimit(USER, ASSESSMENT, new Date('2026-11-11T10:00:00Z'))).toBe('monthly_limit_reached');
  });

  it('lets an assessment already analysed today run again for free', async () => {
    db.countToday = MAX_ANALYSES_PER_DAY;
    db.analysedAt = new Date().toISOString();
    expect(await store.analysisLimit(USER, ASSESSMENT)).toBeNull();
  });

  it('allows the analysis when the count cannot be read', async () => {
    db.fail = true;
    expect(await store.analysisLimit(USER, ASSESSMENT)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Delegation: limits and the clarification question
// ---------------------------------------------------------------------------
const written = { mode: 'new', language: 'en', idea_text: 'Fresh vegetables for restaurants in Riyadh' };
let n = 0;
function start(prompt: object, founder: string[] = ['Fresh vegetables for restaurants in Riyadh']) {
  const requestContext = new RequestContext();
  requestContext.set('assessmentId', ASSESSMENT);
  requestContext.set('userId', USER);
  const rules = { sentences: [] as string[], language: null as string | null, codeWritesReply: false };
  requestContext.set('darbReplyRules', rules);
  const ctx = {
    primitiveId: COMPETITOR_AGENT_ID,
    prompt: JSON.stringify(prompt),
    requestContext,
    toolCallId: `call-${++n}`,
    messages: founder.map((content) => ({ role: 'user', content })),
  } as unknown as DelegationStartContext;
  return { ctx, rules };
}
const complete = (toolCallId: string, toolResult: unknown) =>
  ({ primitiveId: COMPETITOR_AGENT_ID, toolCallId, result: { text: 'Done.', subAgentToolResults: [{ toolName: 'finalize_result', toolCallId: 'x', result: toolResult }] } }) as unknown as DelegationCompleteContext;

const clarifying = (question: string) =>
  Result.parse({
    status: 'needs_clarification',
    clarification: { question, missing_field: 'offering' },
    idea_profile: profile,
    competitors: [],
    iss: null,
    iss_basis: null,
    market_level: null,
    notes: [],
    usage: { tavily_calls: 0, duration_ms: 1, trace_id: null },
  });

describe('delegation: empty fields', () => {
  it('drops the optional fields the supervisor left empty, instead of rejecting the handoff', async () => {
    const { ctx } = start({ ...written, known_facts: { problem: '' }, founder_startup: {}, named_competitors: {}, references: [] });
    const decision = await onCompetitorDelegationStart(ctx);
    expect(decision?.proceed).toBe(true);
    const handoff = ctx.requestContext.get(HANDOFF_KEY) as Record<string, unknown>;
    for (const key of ['known_facts', 'founder_startup', 'named_competitors', 'references']) expect(handoff[key]).toBeUndefined();
  });

  it('keeps filled fields as written, so a wrong one is still rejected', async () => {
    expect(withoutEmptyFields({ references: ['Talabat'], founder_startup: { name: 'X', website: '' } })).toEqual({
      references: ['Talabat'],
      founder_startup: { name: 'X' },
    });
    const { ctx } = start({ ...written, references: { name: 'Talabat' } });
    expect((await onCompetitorDelegationStart(ctx))?.proceed).toBe(false);
  });
});

describe('delegation: limits', () => {
  it('marks the run when the founder has no analyses left, and tells the agent to finish', async () => {
    db.countToday = MAX_ANALYSES_PER_DAY;
    const { ctx } = start(written);
    const decision = await onCompetitorDelegationStart(ctx);
    expect(decision?.modifiedPrompt).toContain('call finalize_result now');
    expect((ctx.requestContext.get(RUN_STATE_KEY) as { limitNote: string }).limitNote).toBe('daily_limit_reached');

    // finalize_result then returns only the limit note, and the founder sees it word for word
    const output = (await finalizeResultTool.execute!({}, { requestContext: ctx.requestContext } as never)) as ResultT;
    expect(output).toMatchObject({ status: 'complete', competitors: [], notes: ['daily_limit_reached'] });
  });
});

describe('delegation: the clarification question', () => {
  it('shows the founder exactly the question, and remembers it', async () => {
    const { ctx, rules } = start(written);
    await onCompetitorDelegationStart(ctx);
    onCompetitorDelegationComplete(complete(ctx.toolCallId, clarifying(CLARIFY_QUESTIONS.offering.en)));
    expect(rules).toMatchObject({ sentences: [CLARIFY_QUESTIONS.offering.en], language: 'en', codeWritesReply: true });
    expect(pendingQuestions.get(ASSESSMENT)).toBe(CLARIFY_QUESTIONS.offering.en);
  });

  it('adds the founder’s answer when the supervisor forgets it, and forgets the question once answered', async () => {
    pendingQuestions.set(ASSESSMENT, 'What will your product do?');
    const { ctx } = start(written, ['Food for restaurants', 'An app to order vegetables from farms']);
    await onCompetitorDelegationStart(ctx);
    expect(ctx.requestContext.get(HANDOFF_KEY)).toMatchObject({
      clarification: { question: 'What will your product do?', answer: 'An app to order vegetables from farms' },
    });
    onCompetitorDelegationComplete(complete(ctx.toolCallId, result()));
    expect(pendingQuestions.has(ASSESSMENT)).toBe(false);
  });

  it('keeps the supervisor’s own clarification when it sends one', async () => {
    pendingQuestions.set(ASSESSMENT, 'Old question?');
    const { ctx } = start({ ...written, clarification: { question: 'Q?', answer: 'A' } });
    await onCompetitorDelegationStart(ctx);
    expect(ctx.requestContext.get(HANDOFF_KEY)).toMatchObject({ clarification: { question: 'Q?', answer: 'A' } });
  });

  it('lets the supervisor present competitors itself, and writes "none found" in code', async () => {
    const shown = start(written);
    await onCompetitorDelegationStart(shown.ctx);
    onCompetitorDelegationComplete(complete(shown.ctx.toolCallId, result()));
    expect(shown.rules.codeWritesReply).toBe(false);

    const none = start(written);
    await onCompetitorDelegationStart(none.ctx);
    onCompetitorDelegationComplete(complete(none.ctx.toolCallId, result([])));
    expect(none.rules).toMatchObject({ sentences: [NOTE_TEXT.none_found.en], codeWritesReply: true });
  });
});

// ---------------------------------------------------------------------------
// finalize_result saves; the time limit; the follow-up tool
// ---------------------------------------------------------------------------
function runWith(candidates: CandidateT[], startedAt = Date.now()) {
  const requestContext = new RequestContext();
  requestContext.set(HANDOFF_KEY, { ...written, assessment_id: ASSESSMENT, idea_id: IDEA, known_facts: { customer: 'restaurants' } });
  requestContext.set(STARTED_AT_KEY, startedAt);
  const state = newRunState();
  state.profile = profile;
  for (const c of candidates) state.candidates.set(c.candidate_key, c);
  state.steps.push({ capability: 'discover', outcome: 'ok', duration_ms: 1 });
  requestContext.set(RUN_STATE_KEY, state);
  return { requestContext, state };
}

describe('finalize_result saves the result', () => {
  it('saves a finished analysis, and still returns it when saving fails', async () => {
    const run = runWith([]);
    const output = (await finalizeResultTool.execute!({}, { requestContext: run.requestContext } as never)) as ResultT;
    expect(output.notes).toEqual(['none_found']);
    expect(calls.some((c) => c.table === 'assessments' && c.op === 'update')).toBe(true);
    expect(run.state.steps.at(-1)?.detail).toContain('saved');

    db.fail = true;
    const failed = runWith([]);
    const again = (await finalizeResultTool.execute!({}, { requestContext: failed.requestContext } as never)) as ResultT;
    expect(again.notes).toEqual(['none_found']);
    expect(failed.state.steps.at(-1)?.detail).toContain('save_failed');
  });
});

describe('the run’s time limit', () => {
  it('starts no judge call after the limit, and the result says so', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const candidate: CandidateT = {
      candidate_key: 'a', source_type: 'web', startup_id: null, name: 'A', name_aliases: [], website: 'https://a.sa', domain: 'a.sa',
      evidence_text: '', description: 'A.', city_region: null,
      sources: [{ url: 'https://a.sa', source_type: 'official_site', accessed_at: NOW }],
    };
    const run = runWith([candidate], Date.now() - RUN_TIME_LIMIT_MS - 1);
    const summary = (await judgeCandidatesTool.execute!({}, { requestContext: run.requestContext } as never)) as { skipped_over_limit: number };
    expect(fetchMock).not.toHaveBeenCalled();
    expect(summary.skipped_over_limit).toBe(1);
    const output = (await finalizeResultTool.execute!({}, { requestContext: run.requestContext } as never)) as ResultT;
    expect(output).toMatchObject({ status: 'partial' });
    expect(output.notes).toContain('time_limit_reached');
    vi.unstubAllGlobals();
  });
});

describe('get_competitor_result (follow-ups)', () => {
  const ask = (values: Record<string, unknown>) => {
    const requestContext = new RequestContext();
    for (const [k, v] of Object.entries(values)) requestContext.set(k, v);
    return getCompetitorResultTool.execute!({}, { requestContext } as never) as Promise<{ status: string; competitors: unknown[]; iss: number | null }>;
  };

  it('returns the saved analysis of this founder’s assessment, without searching', async () => {
    db.assessmentRow = { analysed_at: NOW, iss: 90, iss_basis: 'full', market_level: 'open' };
    db.rows = store.resultRows(ASSESSMENT, result().competitors);
    const answer = await ask({ assessmentId: ASSESSMENT, userId: USER });
    expect(answer).toMatchObject({ status: 'ok', iss: 90 });
    expect(answer.competitors).toHaveLength(2);
    expect(answer).not.toHaveProperty('analysed_at');
  });

  it('says when nothing was analysed yet, refuses another founder’s assessment, and reports errors', async () => {
    expect((await ask({ assessmentId: ASSESSMENT, userId: USER })).status).toBe('not_analysed');
    expect((await ask({ assessmentId: ASSESSMENT, userId: '44444444-4444-4444-8444-444444444444' })).status).toBe('no_assessment');
    expect((await ask({})).status).toBe('no_assessment');
    db.fail = true;
    expect((await ask({ assessmentId: ASSESSMENT, userId: USER })).status).toBe('error');
  });
});

describe('the summary and opportunity sentences (written in code)', async () => {
  const { summarySentences, opportunitySentences, OPPORTUNITY_TEXT, issBand } = await import('../../src/mastra/lib/competitor-notes');

  it('says the ISS with its words and the market, in the founder’s language', () => {
    expect(summarySentences({ iss: 78, market_level: 'competitive' }, 'en')).toEqual([
      'Idea Similarity Score: 78 out of 100 (higher similarity).',
      'Market: Competitive. Several direct competitors were found in our sources.',
    ]);
    expect(summarySentences({ iss: 50, market_level: 'open' }, 'ar')[0]).toContain('تشابه متوسط');
    expect(summarySentences({ iss: null, market_level: null }, 'en')).toEqual([]);
    expect([issBand(70), issBand(69), issBand(39)]).toEqual(['higher', 'moderate', 'lower']);
  });

  it('gives each competitor its opportunity and next step, using the judge’s sentence for a possible difference', () => {
    const competitors = [
      { ...competitor(1), opportunity: 'no_clear_difference' as const, difference: null },
      { ...competitor(2), opportunity: 'possible_difference' as const, difference: 'It covers one gym chain, not many.' },
    ];
    expect(opportunitySentences({ competitors }, 'en')).toEqual([
      `No clear difference (Co 1): ${OPPORTUNITY_TEXT.no_clear_difference.text!.en} Next step: ${OPPORTUNITY_TEXT.no_clear_difference.next.en}`,
      `Possible difference (Co 2): It covers one gym chain, not many. Next step: ${OPPORTUNITY_TEXT.possible_difference.next.en}`,
    ]);
    for (const text of Object.values(OPPORTUNITY_TEXT)) expect(text.next.ar).toMatch(/[؀-ۿ]/);
    expect(OPPORTUNITY_TEXT.possible_customer_difference.next.en).toBe('Interview your target customers.');
  });

  it('passes them to the supervisor with the result', async () => {
    const { ctx } = start(written);
    await onCompetitorDelegationStart(ctx);
    const reply = JSON.parse(onCompetitorDelegationComplete(complete(ctx.toolCallId, result()))!.resultText);
    expect(reply.summary_sentences[0]).toContain('Idea Similarity Score: 90');
    expect(reply.opportunity_sentences).toHaveLength(2);
  });
});

describe('the customer-partly rule (explainer §6, rule 2)', async () => {
  const { opportunitySentences, OPPORTUNITY_TEXT } = await import('../../src/mastra/lib/competitor-notes');
  it('uses its fixed message, not the judge’s sentence, and the next step "Interview your target customers"', () => {
    const competitors = [{ ...competitor(1), opportunity: 'possible_customer_difference' as const, difference: 'Some judge sentence.' }];
    expect(opportunitySentences({ competitors }, 'en')).toEqual([
      `Possible difference (Co 1): ${OPPORTUNITY_TEXT.possible_customer_difference.text!.en} Next step: Interview your target customers.`,
    ]);
  });
});
