// Tests for run_what_if and the comparison. The database and the analysis are replaced by fakes.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OwnedAssessment } from '../lib/assessments';

const USER = 'user-1';
const ORIGINAL = '11111111-1111-4111-8111-111111111111';
const WHAT_IF = '22222222-2222-4222-8222-222222222222';

const base: Omit<OwnedAssessment, 'assessment_id' | 'inputs' | 'iss'> = {
  idea_id: 'idea-1',
  thread_id: 'thread-1',
  language: 'en',
  parent_assessment_id: null,
  scenario_label: null,
  analysed_at: null,
  fis_score: null,
};

// Assessments this fake founder owns. The what-if one appears once createScenario has run.
const owned: Record<string, OwnedAssessment> = {};
function reset() {
  for (const key of Object.keys(owned)) delete owned[key];
  owned[ORIGINAL] = {
    ...base,
    assessment_id: ORIGINAL,
    iss: 80,
    inputs: { idea_text: 'Home-cooked food delivery app', sector: 'I', sub_sector: '56', region: 'Riyadh' },
  };
}

vi.mock('../lib/assessments', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadOwnedAssessment: async (id: string, userId: string) => (userId === USER ? (owned[id] ?? null) : null),
}));

// Fake Supabase: saved competitors per assessment, and the insert of a new version.
const inserted: Record<string, unknown>[] = [];
const savedCompetitors: Record<string, unknown[]> = {
  [ORIGINAL]: [
    { startup_id: 'A', rank: 1, similarity_score: 0.9, startups: { startup_name: 'Alpha', startup_name_ar: null } },
    { startup_id: 'B', rank: 2, similarity_score: 0.7, startups: { startup_name: 'Beta', startup_name_ar: null } },
  ],
  [WHAT_IF]: [
    { startup_id: 'B', rank: 1, similarity_score: 0.8, startups: { startup_name: 'Beta', startup_name_ar: null } },
    { startup_id: 'C', rank: 2, similarity_score: 0.65, startups: { startup_name: 'Gamma', startup_name_ar: 'جاما' } },
  ],
};
vi.mock('../lib/supabase', () => ({
  getSupabase: () => ({
    from: () => {
      let assessmentId = '';
      const query = {
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          owned[WHAT_IF] = { ...base, assessment_id: WHAT_IF, iss: 72.5, inputs: row.scenario_inputs as OwnedAssessment['inputs'] };
          return { select: () => ({ single: async () => ({ data: { assessment_id: WHAT_IF }, error: null }) }) };
        },
        select: () => query,
        eq: (_column: string, value: string) => {
          assessmentId = value;
          return query;
        },
        order: async () => ({ data: savedCompetitors[assessmentId] ?? [], error: null }),
      };
      return query;
    },
  }),
}));

// The analysis itself is tested elsewhere; here it only reports what it was asked to analyse.
const analysed: unknown[] = [];
let analysisStatus = 'ok';
vi.mock('./delegate-competitor-analysis', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runCompetitorAnalysis: async (input: { assessment_id: string }) => {
    analysed.push(input);
    return { status: analysisStatus, assessment_id: input.assessment_id, competitors: [], iss: analysisStatus === 'ok' ? 72.5 : null, competitors_found: 0, message: analysisStatus };
  },
}));

const { runWhatIfTool } = await import('./run-what-if');
const { diffInputs } = await import('../lib/what-if');

const asFounder = (userId = USER) => ({ agent: { resourceId: userId } }) as never;
const run = (changes: Record<string, unknown>, userId = USER) =>
  runWhatIfTool.execute!({ parent_assessment_id: ORIGINAL, scenario_label: 'Jeddah', changes, language: 'en' } as never, asFounder(userId)) as Promise<any>;

beforeEach(() => {
  reset();
  inserted.length = 0;
  analysed.length = 0;
  analysisStatus = 'ok';
});

describe('run_what_if', () => {
  it('creates the new version, analyses it, and returns the exact comparison', async () => {
    const out = await run({ region: 'Jeddah' });
    expect(out.status).toBe('ok');
    expect(inserted[0]).toMatchObject({
      parent_assessment_id: ORIGINAL,
      scenario_inputs: { idea_text: 'Home-cooked food delivery app', sector: 'I', sub_sector: '56', region: 'Jeddah' },
    });
    expect(analysed[0]).toMatchObject({ assessment_id: WHAT_IF, region: 'Jeddah', sector: 'I', sub_sector: '56' });
    expect(out.comparison.inputs_changed).toEqual([{ field: 'region', before: 'Riyadh', after: 'Jeddah' }]);
    expect(out.comparison.iss).toEqual({ before: 80, after: 72.5, change: -7.5 });
    expect(out.comparison.survival_score).toEqual({ before: null, after: null, change: null });
    expect(out.comparison.competitors.kept.map((c: any) => [c.startup_id, c.rank_before, c.rank_after])).toEqual([['B', 2, 1]]);
    expect(out.comparison.competitors.new.map((c: any) => c.startup_id)).toEqual(['C']);
    expect(out.comparison.competitors.dropped.map((c: any) => c.startup_id)).toEqual(['A']);
  });

  it('ignores empty values the model sends for inputs that stay the same', async () => {
    const out = await run({ region: 'Jeddah', sector: null, sub_sector: null, idea_text: null });
    expect(out.status).toBe('ok');
    expect(inserted[0]).toMatchObject({ scenario_inputs: { sector: 'I', sub_sector: '56', region: 'Jeddah' } });
  });

  it('refuses a change that changes nothing', async () => {
    const out = await run({ region: 'Riyadh' });
    expect(out.status).toBe('no_change');
    expect(inserted).toHaveLength(0);
  });

  it('refuses a sub-sector outside the section, before saving anything', async () => {
    const out = await run({ sector: 'P' }); // Education, but the sub-sector is still 56 (food service)
    expect(out.status).toBe('invalid');
    expect(inserted).toHaveLength(0);
  });

  it("cannot reach another founder's assessment", async () => {
    const out = await run({ region: 'Jeddah' }, 'someone-else');
    expect(out.status).toBe('not_found');
    expect(inserted).toHaveLength(0);
  });

  it('passes the daily limit through without comparing', async () => {
    analysisStatus = 'limit_reached';
    const out = await run({ region: 'Jeddah' });
    expect(out.status).toBe('limit_reached');
    expect(out.comparison).toBeNull();
  });
});

describe('diffInputs', () => {
  it('lists only what changed, including the sub-sector', () => {
    expect(
      diffInputs(
        { idea_text: 'x', sector: 'I', sub_sector: '56', region: 'Riyadh' },
        { idea_text: 'x', sector: 'I', sub_sector: '55', region: 'Riyadh' },
      ),
    ).toEqual([{ field: 'sub_sector', before: '56', after: '55' }]);
  });
});
