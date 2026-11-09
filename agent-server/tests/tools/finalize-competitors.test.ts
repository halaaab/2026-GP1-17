// Tests for finalize_competitors. The database is replaced by a fake, so no keys are needed.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StartupCandidate } from '../../src/mastra/contracts';

// A higher threshold than the real placeholder (0), so filtering can be tested.
vi.mock('../../src/mastra/config/models', () => ({ SIMILARITY_THRESHOLD: 0.3, MAX_COMPETITORS: 3 }));

// Fake Supabase: records every call in order.
const calls: string[] = [];
const insertedRows: unknown[] = [];
vi.mock('../../src/mastra/lib/supabase', () => ({
  getSupabase: () => ({
    from: (table: string) => ({
      // The startups table knows every id except the invented one.
      select: () => ({
        in: async (_column: string, ids: string[]) => ({
          data: ids.filter((id) => id !== 'INVENTED').map((startup_id) => ({ startup_id })),
          error: null,
        }),
      }),
      delete: () => ({
        eq: async (column: string, value: string) => {
          calls.push(`delete ${table} where ${column}=${value}`);
          return { error: null };
        },
      }),
      insert: async (rows: unknown[]) => {
        calls.push(`insert ${table} ${rows.length}`);
        insertedRows.push(...rows);
        return { error: null };
      },
      update: (values: { iss: number | null }) => ({
        eq: async (column: string, value: string) => {
          calls.push(`update ${table} iss=${values.iss} where ${column}=${value}`);
          return { error: null };
        },
      }),
    }),
  }),
}));

const { selectCompetitors, finalizeCompetitorsTool, normalizeName } = await import('../../src/mastra/tools/finalize-competitors');

const ASSESSMENT = '3f2b6c1e-8a4d-4e2b-9c1a-5d6e7f8a9b0c';

function candidate(id: string, similarity: number, extra: Partial<StartupCandidate> = {}): StartupCandidate {
  return {
    startup_id: id,
    name: `Startup ${id}`,
    name_ar: null,
    description: 'A startup',
    sector: null,
    region: null,
    stage: null,
    website: null,
    similarity,
    source: 'dataset',
    ...extra,
  };
}

const run = (candidates: StartupCandidate[]) =>
  finalizeCompetitorsTool.execute!({ assessment_id: ASSESSMENT, candidates }, {} as never) as Promise<any>;

beforeEach(() => {
  calls.length = 0;
  insertedRows.length = 0;
});

describe('ISS', () => {
  it('averages 3 competitors', () => {
    const { iss } = selectCompetitors([candidate('A', 0.9), candidate('B', 0.8), candidate('C', 0.7)]);
    expect(iss).toBe(80);
  });

  it('averages only 2 competitors when 2 are found', async () => {
    const out = await run([candidate('A', 0.9), candidate('B', 0.6)]);
    expect(out.iss).toBe(75);
    expect(out.competitors_found).toBe(2);
    expect(out.status).toBe('ok');
  });

  it('uses the single score when 1 is found, rounded to 1 decimal', async () => {
    const out = await run([candidate('A', 0.83456)]);
    expect(out.iss).toBe(83.5);
    expect(out.competitors_found).toBe(1);
  });

  it('is null with status no_results when none are found', async () => {
    const out = await run([]);
    expect(out.iss).toBeNull();
    expect(out.status).toBe('no_results');
    expect(out.competitors).toEqual([]);
  });
});

describe('filtering, duplicates and ranking', () => {
  it('drops candidates below the threshold', () => {
    const { competitors } = selectCompetitors([candidate('A', 0.9), candidate('B', 0.29), candidate('C', 0.3)]);
    expect(competitors.map((c) => c.startup_id)).toEqual(['A', 'C']);
  });

  it('removes duplicates by startup_id, keeping the higher score', () => {
    const { competitors } = selectCompetitors([candidate('A', 0.6), candidate('A', 0.9)]);
    expect(competitors).toHaveLength(1);
    expect(competitors[0].similarity).toBe(0.9);
  });

  it('treats dataset rows with the same website as one company, but not a shared host', () => {
    const { competitors } = selectCompetitors([
      candidate('ST_368', 0.73, { website: 'https://misraj.sa/' }),
      candidate('ST_369', 0.72, { website: 'https://misraj.sa/' }),
      candidate('ST_366', 0.71, { website: 'misraj.sa' }),
      candidate('ST_1', 0.6, { website: 'https://linktr.ee/one' }),
      candidate('ST_2', 0.5, { website: 'https://linktr.ee/two' }),
    ]);
    expect(competitors.map((c) => c.startup_id)).toEqual(['ST_368', 'ST_1', 'ST_2']);
  });

  it('removes a web duplicate by website domain', () => {
    const { competitors } = selectCompetitors([
      candidate('ST_1', 0.8, { website: 'https://www.jahez.net' }),
      candidate('web-1', 0.7, { source: 'web', name: 'Other name', website: 'jahez.net/about' }),
    ]);
    expect(competitors.map((c) => c.startup_id)).toEqual(['ST_1']);
  });

  it('removes a web duplicate whose Arabic name is spelled differently', () => {
    const { competitors } = selectCompetitors([
      candidate('ST_1', 0.8, { name: 'Ajer', name_ar: 'أَجِّر للعقارات' }),
      candidate('web-1', 0.85, { source: 'web', name: 'اجر للعقارات' }),
    ]);
    expect(competitors).toHaveLength(1);
    expect(competitors[0].startup_id).toBe('web-1'); // the higher score wins
  });

  it('keeps the dataset version on a tie', () => {
    const { competitors } = selectCompetitors([
      candidate('web-1', 0.8, { source: 'web', name: 'Startup ST_1' }),
      candidate('ST_1', 0.8),
    ]);
    expect(competitors).toHaveLength(1);
    expect(competitors[0].source).toBe('dataset');
  });

  it('normalizes Arabic names', () => {
    expect(normalizeName('  مَدْرَسَةٌ   إلكترونية ')).toBe(normalizeName('مدرسه الكترونية'));
  });

  it('ranks by score and keeps only the top 3', () => {
    const { competitors } = selectCompetitors([
      candidate('A', 0.5),
      candidate('B', 0.95),
      candidate('C', 0.7),
      candidate('D', 0.8),
    ]);
    expect(competitors.map((c) => [c.startup_id, c.rank])).toEqual([
      ['B', 1],
      ['D', 2],
      ['C', 3],
    ]);
  });
});

describe('saving', () => {
  it('deletes old rows before inserting, and saves dataset and web competitors', async () => {
    const web = candidate('web-1', 0.8, {
      source: 'web',
      name: 'Web Co',
      website: 'https://webco.sa',
      source_url: 'https://webco.sa/about',
    });
    const out = await run([candidate('A', 0.9), web]);
    expect(calls).toEqual([
      `delete similar_startup_results where assessment_id=${ASSESSMENT}`,
      'insert similar_startup_results 2',
      `update assessments iss=85 where assessment_id=${ASSESSMENT}`,
    ]);
    expect(insertedRows).toEqual([
      { assessment_id: ASSESSMENT, source_type: 'database', startup_id: 'A', similarity_score: 0.9, rank: 1 },
      {
        assessment_id: ASSESSMENT,
        source_type: 'web',
        startup_id: null, // a web competitor has no row in public.startups (0..1)
        competitor_name: 'Web Co',
        description: 'A startup',
        website: 'https://webco.sa',
        source_url: 'https://webco.sa/about',
        similarity_score: 0.8,
        rank: 2,
      },
    ]);
    expect(out.competitors).toHaveLength(2);
  });
});

describe('code guard', () => {
  // A fake request context like the one an analysis shares, with what similarity_search really returned.
  function analysisContext(found: StartupCandidate[]) {
    const values = new Map<string, unknown>([['darb_search_results', new Map(found.map((c) => [c.startup_id, c]))]]);
    return { requestContext: { get: (k: string) => values.get(k), set: (k: string, v: unknown) => values.set(k, v) }, values };
  }

  it('drops a startup the search never returned, and keeps the search\'s own score and name', async () => {
    const ctx = analysisContext([candidate('A', 0.62, { name: 'Real Name' })]);
    const out: any = await finalizeCompetitorsTool.execute!(
      { assessment_id: ASSESSMENT, startup_ids: ['A', 'INVENTED'], candidates: [candidate('A', 0.99, { name: 'Renamed' })] },
      ctx as never,
    );
    expect(out.competitors).toHaveLength(1);
    expect(out.competitors[0]).toMatchObject({ startup_id: 'A', similarity: 0.62, name: 'Real Name' });
    expect(out.iss).toBe(62);
    expect(ctx.values.get('darb_finalize_output')).toEqual(out); // left for delegate_competitor_analysis
  });

  it('uses the assessment from the analysis, not the id the model typed', async () => {
    const ctx = analysisContext([candidate('A', 0.5)]);
    const real = '9b0c3f2b-6c1e-4a4d-8e2b-5d6e7f8a9b0c';
    ctx.values.set('assessmentId', real);
    const out: any = await finalizeCompetitorsTool.execute!({ assessment_id: ASSESSMENT, startup_ids: ['A'] }, ctx as never);
    expect(out.assessment_id).toBe(real);
    expect(calls[0]).toBe(`delete similar_startup_results where assessment_id=${real}`);
  });

  it('run by hand, drops a dataset startup that is not in public.startups', async () => {
    const out = await run([candidate('A', 0.9), candidate('INVENTED', 0.95)]);
    expect(out.competitors.map((c: any) => c.startup_id)).toEqual(['A']);
  });

  it('returns a preview and saves nothing when an agent calls it without an assessment', async () => {
    const ctx = analysisContext([candidate('A', 0.62)]);
    const out: any = await finalizeCompetitorsTool.execute!(
      { assessment_id: ASSESSMENT, startup_ids: ['A'] },
      { ...ctx, agent: { agentId: 'competitor-agent' } } as never,
    );
    expect(calls).toEqual([]); // the id the model typed is never used to save
    expect(out.status).toBe('ok');
    expect(out.iss).toBe(62);
    expect(out.message).toMatch(/Preview only/);
  });
});
