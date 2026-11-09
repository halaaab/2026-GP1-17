// Tests for delegate_competitor_analysis: the checks before an analysis, the daily limit,
// and that only finalize_competitors' result comes back. The database and the agent are fakes.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OwnedAssessment } from '../../src/mastra/lib/assessments';

const USER = 'user-1';
const ASSESSMENT = '11111111-1111-4111-8111-111111111111';

let owned: OwnedAssessment | null;
vi.mock('../../src/mastra/lib/assessments', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadOwnedAssessment: async (_id: string, userId: string) => (userId === USER ? owned : null),
}));

// Fake Supabase: today's analysis count, and the saved confirmed inputs.
let analysesToday = 0;
const savedInputs: unknown[] = [];
vi.mock('../../src/mastra/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        gte: async () => ({ count: analysesToday, error: null }),
        update: (values: { confirmed_inputs: unknown }) => {
          savedInputs.push(values.confirmed_inputs);
          return { eq: async () => ({ error: null }) };
        },
      };
      return query;
    },
  }),
}));

vi.mock('../../src/mastra/lib/comparison-matrix', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  buildComparisonMatrix: async () => ({ columns: [{ key: 'founder', name: 'Your idea', name_ar: 'فكرتك' }], rows: [] }),
}));

const { runCompetitorAnalysis, checkClassification, startOfSaudiDay } = await import('../../src/mastra/tools/delegate-competitor-analysis');

const finalizeResult = {
  status: 'ok',
  assessment_id: ASSESSMENT,
  competitors: [
    { startup_id: 'ST_336', name: 'Jeel', name_ar: 'جيل', description: 'BNPL for tuition', sector: null, region: 'Riyadh', stage: 'Seed', website: null, similarity: 0.64, source: 'dataset', rank: 1 },
  ],
  iss: 64,
  competitors_found: 1,
  message: 'Found 1 competitor(s).',
};

// A fake Competitor Agent: records the context it was given, and (unless told not to) leaves finalize's result in it.
let agentContext: { get: (k: string) => unknown } | undefined;
let agentFinalizes = true;
const fakeAgent = {
  generate: vi.fn(async (_prompt: string, options: { requestContext: { get: (k: string) => unknown; set: (k: string, v: unknown) => void } }) => {
    agentContext = options.requestContext;
    if (agentFinalizes) options.requestContext.set('darb_finalize_output', finalizeResult);
    return { text: 'I found 7 amazing competitors including MadeUpCo with 99% similarity!' }; // ignored on purpose
  }),
};
const context = (userId = USER) => ({ agent: { resourceId: userId }, mastra: { getAgentById: () => fakeAgent } }) as never;

const input = { assessment_id: ASSESSMENT, idea_text: 'BNPL app for private school fees', sector: 'K', sub_sector: '64', region: 'Riyadh', language: 'en' as const };

beforeEach(() => {
  owned = {
    assessment_id: ASSESSMENT,
    idea_id: 'idea-1',
    thread_id: null,
    language: 'en',
    iss: null,
    analysed_at: null,
    fis_score: null,
    inputs: { idea_text: null, sector: null, region: null },
  };
  analysesToday = 0;
  savedInputs.length = 0;
  agentFinalizes = true;
  agentContext = undefined;
  fakeAgent.generate.mockClear();
});

describe('checks before an analysis', () => {
  it('accepts a division inside its section, and rejects the rest', () => {
    expect(checkClassification('K', '64')).toBeNull();
    expect(checkClassification('Z', '64')).toMatch(/Unknown sector/);
    expect(checkClassification('K', '99')).toMatch(/not in section K/);
    expect(checkClassification('K', '00')).toMatch(/Unknown sub-sector/);
    expect(checkClassification('P', '64')).toMatch(/not in section P/);
  });

  it('never starts the agent for an invalid sub-sector', async () => {
    const out = await runCompetitorAnalysis({ ...input, sub_sector: '85' }, context());
    expect(out.status).toBe('error');
    expect(fakeAgent.generate).not.toHaveBeenCalled();
  });

  it("refuses another founder's assessment", async () => {
    const out = await runCompetitorAnalysis(input, context('someone-else'));
    expect(out.status).toBe('error');
    expect(out.message).toMatch(/does not exist for this founder/);
    expect(fakeAgent.generate).not.toHaveBeenCalled();
  });

  it('refuses when nobody is signed in', async () => {
    const out = await runCompetitorAnalysis(input, { mastra: { getAgentById: () => fakeAgent } } as never);
    expect(out.message).toMatch(/No signed-in founder/);
  });
});

describe('daily limit', () => {
  it('stops the 6th analysis of the day', async () => {
    analysesToday = 5;
    const out = await runCompetitorAnalysis(input, context());
    expect(out.status).toBe('limit_reached');
    expect(fakeAgent.generate).not.toHaveBeenCalled();
  });

  it('lets a retry of an assessment already analysed today through', async () => {
    analysesToday = 5;
    owned!.analysed_at = new Date().toISOString();
    const out = await runCompetitorAnalysis(input, context());
    expect(out.status).toBe('ok');
  });

  it('counts the day from midnight in Saudi Arabia', () => {
    // 22:30 UTC on 6 Nov is 01:30 on 7 Nov in Riyadh, so the day started at 21:00 UTC on 6 Nov.
    expect(startOfSaudiDay(new Date('2026-11-06T22:30:00Z'))).toBe('2026-11-06T21:00:00.000Z');
    expect(startOfSaudiDay(new Date('2026-11-06T20:00:00Z'))).toBe('2026-11-05T21:00:00.000Z');
  });
});

describe('what comes back', () => {
  it("returns finalize_competitors' result, never the agent's own text", async () => {
    const out = await runCompetitorAnalysis(input, context());
    expect(out.status).toBe('ok');
    expect(out.competitors.map((c) => c.name)).toEqual(['Jeel']);
    expect(JSON.stringify(out)).not.toContain('MadeUpCo');
    expect(out.comparison_matrix?.columns[0].key).toBe('founder');
  });

  it('gives the agent the trusted ids and the idea, not values it must type', async () => {
    await runCompetitorAnalysis(input, context());
    expect(agentContext?.get('userId')).toBe(USER);
    expect(agentContext?.get('assessmentId')).toBe(ASSESSMENT);
    expect(agentContext?.get('isicSection')).toBe('K');
    expect(agentContext?.get('ideaText')).toBe(input.idea_text);
  });

  it('saves the confirmed inputs on the assessment', async () => {
    await runCompetitorAnalysis({ ...input, sector: 'k' }, context());
    expect(savedInputs[0]).toMatchObject({ idea_text: input.idea_text, sector: 'K', sub_sector: '64', region: 'Riyadh' });
  });

  it('reports an error when the agent never finished with finalize_competitors', async () => {
    agentFinalizes = false;
    const out = await runCompetitorAnalysis(input, context());
    expect(out.status).toBe('error');
    expect(out.competitors).toEqual([]);
  });
});
