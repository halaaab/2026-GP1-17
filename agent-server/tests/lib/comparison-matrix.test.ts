// Tests for the comparison matrix. The startups table is replaced by a fake.
import { describe, expect, it, vi } from 'vitest';
import type { Competitor } from '../../src/mastra/contracts';

vi.mock('../../src/mastra/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        in: async () => ({
          data: [
            { startup_id: 'ST_336', target_market: 'B2C', sector: 'Education, Research & Talent', isic_section: 'K', isic_division: '64' },
            { startup_id: 'ST_290', target_market: null, sector: 'Financial Services & Fintech; Technology' }, // not classified yet
          ],
          error: null,
        }),
      }),
    }),
  }),
}));

const { buildComparisonMatrix, ComparisonMatrix } = await import('../../src/mastra/lib/comparison-matrix');

const competitor = (id: string, name: string, similarity: number): Competitor => ({
  startup_id: id,
  name,
  name_ar: null,
  description: `${name} description`,
  sector: null,
  region: 'Riyadh',
  stage: 'Seed',
  website: null,
  similarity,
  source: 'dataset',
  rank: 1,
});

describe('comparison matrix', () => {
  it('puts the idea beside each competitor, from stored data only', async () => {
    const matrix = await buildComparisonMatrix(
      { idea_text: 'BNPL for school fees', sector: 'K', sub_sector: '64', region: 'Riyadh' },
      [competitor('ST_336', 'Jeel', 0.639), competitor('ST_290', 'WAKI', 0.618)],
    );
    expect(ComparisonMatrix.safeParse(matrix).success).toBe(true);
    expect(matrix.columns.map((c) => c.key)).toEqual(['founder', 'ST_336', 'ST_290']);

    const row = (field: string) => matrix.rows.find((r) => r.field === field)!.values;
    expect(row('activity')).toEqual({
      founder: 'K 64 · Financial service activities, except insurance and pension funding',
      ST_336: 'K 64 · Financial service activities, except insurance and pension funding',
      ST_290: 'Financial Services & Fintech; Technology', // old label until classified
    });
    expect(row('similarity')).toEqual({ founder: null, ST_336: '63.9%', ST_290: '61.8%' });
    expect(row('target_market')).toEqual({ founder: null, ST_336: 'B2C', ST_290: null }); // missing stays missing
    expect(row('website').ST_336).toBeNull();
  });
});
