// Tests for get_competitor_details. The database is replaced by a fake.
import { describe, expect, it, vi } from 'vitest';

let fakeRow: unknown = null;
const filters: string[] = [];
vi.mock('../lib/supabase', () => ({
  getSupabase: () => {
    const query = {
      select: () => query,
      eq: (column: string, value: string) => {
        filters.push(`${column}=${value}`);
        return query;
      },
      maybeSingle: async () => ({ data: fakeRow, error: null }),
    };
    return { from: () => query };
  },
}));

const { getCompetitorDetailsTool } = await import('./get-competitor-details');
const ASSESSMENT = '3f2b6c1e-8a4d-4e2b-9c1a-5d6e7f8a9b0c';
const run = (startup_id: string) =>
  getCompetitorDetailsTool.execute!({ assessment_id: ASSESSMENT, startup_id }, {} as never) as Promise<any>;

describe('get_competitor_details', () => {
  it('returns the stored facts, and keeps missing facts as null', async () => {
    fakeRow = {
      rank: 1,
      similarity_score: 0.8234,
      startups: { startup_id: 'ST_1', startup_name: 'Jahez', startup_description: 'Food delivery app', sector: 'Food & Beverages' },
    };
    const out = await run('ST_1');
    expect(filters).toEqual([`assessment_id=${ASSESSMENT}`, 'startup_id=ST_1']);
    expect(out.status).toBe('ok');
    expect(out.details.similarity_percent).toBe(82.3);
    expect(out.details.name).toBe('Jahez');
    expect(out.details.stage).toBeNull();
  });

  it('refuses a startup that was not one of this assessment\'s competitors', async () => {
    fakeRow = null;
    const out = await run('ST_999');
    expect(out).toEqual({ status: 'not_in_results', details: null });
  });
});
