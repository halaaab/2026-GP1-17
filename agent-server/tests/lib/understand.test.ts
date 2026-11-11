// Tests for the Understand capability: the clarification rules, the understand_idea tool and the question result.
// The profile model, OpenAI embeddings and the database are replaced by fakes, so nothing is sent or paid for.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import type { IdeaProfile, Result as ResultType } from '../../src/mastra/schemas/competitor';

const IDEA = '22222222-2222-4222-8222-222222222222';

let modelProfile: IdeaProfile | Error;
vi.mock('../../src/mastra/lib/idea-profile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/mastra/lib/idea-profile')>()),
  buildIdeaProfile: vi.fn(async () => {
    if (modelProfile instanceof Error) throw modelProfile;
    return modelProfile;
  }),
}));
let embeddingFails = false;
vi.mock('../../src/mastra/lib/embeddings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/mastra/lib/embeddings')>()),
  embedTexts: vi.fn(async () => {
    if (embeddingFails) throw new Error('down');
    return [[0.1, 0.2]];
  }),
}));
const saved: { table: string; values: unknown; idea: unknown }[] = [];
vi.mock('../../src/mastra/lib/supabase', () => ({
  getSupabase: () => ({
    from: (table: string) => ({
      update: (values: unknown) => ({
        eq: async (_column: string, idea: unknown) => {
          saved.push({ table, values, idea });
          return { error: null };
        },
      }),
    }),
  }),
}));

const { buildIdeaProfile } = await import('../../src/mastra/lib/idea-profile');
const { CLARIFY_QUESTIONS, clarificationFor, understandText, withStatedFacts } = await import('../../src/mastra/lib/understand');
const { newRunState, RUN_STATE_KEY } = await import('../../src/mastra/lib/competitor-run');
const { understandIdeaTool } = await import('../../src/mastra/tools/understand-idea');
const { finalizeResultTool, HANDOFF_KEY, STARTED_AT_KEY } = await import('../../src/mastra/tools/finalize-result');
const { Result } = await import('../../src/mastra/schemas/competitor');

const unknown = { value: null, origin: 'unknown' as const };
function profileWith(parts: Partial<Record<'problem' | 'customer' | 'offering' | 'market', { value: string | null; origin: 'stated' | 'inferred' | 'unknown' }>>): IdeaProfile {
  return {
    problem: unknown,
    customer: unknown,
    offering: unknown,
    market: unknown,
    sector: { isic_section: 'I', isic_division: '56' },
    business_model: null,
    keywords_en: ['healthy lunch'],
    keywords_ar: ['غداء صحي'],
    ...parts,
  };
}
const problem = { value: 'Office workers lack healthy lunch options', origin: 'inferred' as const };
const offering = { value: 'Healthy lunch box delivery', origin: 'stated' as const };

const handoff = {
  assessment_id: '11111111-1111-4111-8111-111111111111',
  idea_id: IDEA,
  mode: 'new' as const,
  language: 'en' as const,
  idea_text: 'Healthy lunch boxes for offices in Dammam',
};

beforeEach(() => {
  saved.length = 0;
  embeddingFails = false;
  vi.mocked(buildIdeaProfile).mockClear();
});

describe('the clarification rules', () => {
  it('searches when the problem and the offering are known, stated or inferred', () => {
    expect(clarificationFor(profileWith({ problem, offering }), handoff)).toBeNull();
  });

  it('asks one question for the missing part, in the founder’s language', () => {
    expect(clarificationFor(profileWith({ problem }), handoff)).toEqual({ question: CLARIFY_QUESTIONS.offering.en, missing_field: 'offering' });
    expect(clarificationFor(profileWith({ offering }), { ...handoff, language: 'ar' })).toEqual({ question: CLARIFY_QUESTIONS.problem.ar, missing_field: 'problem' });
    expect(clarificationFor(profileWith({}), handoff)).toEqual({ question: CLARIFY_QUESTIONS.both.en, missing_field: 'offering' });
  });

  it('asks only once: after an answer it searches with what is known, unless both are still missing', () => {
    const answered = { ...handoff, clarification: { question: 'Q', answer: 'A' } };
    expect(clarificationFor(profileWith({ problem }), answered)).toBeNull();
    expect(clarificationFor(profileWith({}), answered)?.missing_field).toBe('offering');
  });

  it('profiles the idea together with the founder’s answer', () => {
    expect(understandText({ idea_text: ' An idea ', clarification: { question: 'What does it do?', answer: 'Delivers lunch' } })).toBe(
      'An idea\nQuestion: What does it do?\nAnswer: Delivers lunch',
    );
    expect(understandText({ idea_text: 'An idea' })).toBe('An idea');
  });

  it('lets the facts the founder stated win over the model’s reading', () => {
    const merged = withStatedFacts(profileWith({ customer: { value: 'Students', origin: 'inferred' } }), { known_facts: { customer: 'offices in Dammam' } });
    expect(merged.customer).toEqual({ value: 'offices in Dammam', origin: 'stated' });
    expect(merged.problem).toEqual(unknown);
  });

  it('has every question in Arabic and English', () => {
    for (const q of Object.values(CLARIFY_QUESTIONS)) {
      expect(q.en).toMatch(/\?$/);
      expect(q.ar).toMatch(/[؀-ۿ]/);
    }
  });
});

describe('understand_idea, then finalize_result', () => {
  function newRun(values = handoff) {
    const requestContext = new RequestContext();
    requestContext.set(HANDOFF_KEY, values);
    requestContext.set(STARTED_AT_KEY, Date.now());
    const state = newRunState();
    requestContext.set(RUN_STATE_KEY, state);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const context = { requestContext } as any;
    type Summary = { ready: boolean; error?: string; missing_field?: string; keywords_en?: string[] };
    return {
      state,
      understand: async () => (await understandIdeaTool.execute!({}, context)) as Summary,
      finalize: async () => (await finalizeResultTool.execute!({}, context)) as ResultType,
    };
  }

  it('is ready when the idea is clear, and saves the profile’s embedding on the idea', async () => {
    modelProfile = profileWith({ problem, offering });
    const run = newRun();
    const summary = await run.understand();
    expect(summary).toMatchObject({ ready: true, keywords_en: ['healthy lunch'] });
    expect(summary).not.toHaveProperty('missing_field');
    expect(run.state.ideaEmbedding).toEqual([0.1, 0.2]);
    expect(saved).toEqual([{ table: 'startup_ideas', values: { embedding: '[0.1,0.2]' }, idea: IDEA }]);
    expect(run.state.steps[0]).toMatchObject({ capability: 'understand', outcome: 'ok', detail: 'ready' });
    // no search has run yet, so the founder is not told "none found"
    expect(await run.finalize()).toMatchObject({ notes: ['capability_pending'] });
  });

  it('still continues when the embedding cannot be saved', async () => {
    modelProfile = profileWith({ problem, offering });
    embeddingFails = true;
    const run = newRun();
    expect((await run.understand()).ready).toBe(true);
    expect(run.state.steps[0].detail).toBe('ready_embedding_failed');
  });

  it('asks the one question when the idea is too vague, with no competitors and no scores', async () => {
    modelProfile = profileWith({ problem });
    const run = newRun();
    expect(await run.understand()).toMatchObject({ ready: false, missing_field: 'offering' });
    expect(saved).toEqual([]); // nothing embedded for an idea that cannot be searched yet

    const result = await run.finalize();
    expect(Result.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      status: 'needs_clarification',
      clarification: { question: CLARIFY_QUESTIONS.offering.en, missing_field: 'offering' },
      competitors: [],
      iss: null,
      notes: [],
    });
  });

  it('says the analysis did not finish when the idea could not be read', async () => {
    modelProfile = new Error('OpenAI down');
    const run = newRun();
    expect(await run.understand()).toEqual({ ready: false, error: 'profile_failed' });
    expect(await run.finalize()).toMatchObject({ status: 'partial', notes: ['analysis_incomplete'] });
  });

  it('does nothing without a handoff', async () => {
    const requestContext = new RequestContext();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await understandIdeaTool.execute!({}, { requestContext } as any)).toEqual({ ready: false, error: 'no_handoff' });
    expect(buildIdeaProfile).not.toHaveBeenCalled();
  });
});
