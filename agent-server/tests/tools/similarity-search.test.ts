// Tests for similarity_search. OpenAI and Supabase are replaced by fakes.
import { describe, expect, it, vi } from 'vitest';
import { SIMILARITY_THRESHOLD } from '../../src/mastra/config/models';
import { StartupCandidate } from '../../src/mastra/contracts';

const embeddedTexts: string[] = [];
vi.mock('../../src/mastra/lib/embeddings', () => ({
  embedTexts: async (texts: string[]) => {
    embeddedTexts.push(...texts);
    return texts.map(() => [0.1, 0.2, 0.3]);
  },
  toPgVector: (e: number[]) => JSON.stringify(e),
}));

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
vi.mock('../../src/mastra/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return {
        data: [
          { startup_id: 'ST_1', startup_name: 'Jahez', startup_name_ar: 'جاهز', startup_description: 'Food delivery', sector: 'Food & Beverages', region: 'Riyadh', stage: 'IPO', website: 'https://jahez.net', similarity: 0.71 },
          { startup_id: 'ST_2', startup_name: 'NoDescription', startup_name_ar: null, startup_description: null, sector: null, region: null, stage: null, website: null, similarity: 0.4 },
        ],
        error: null,
      };
    },
  }),
}));

const { similaritySearchTool } = await import('../../src/mastra/tools/similarity-search');

describe('similarity_search', () => {
  it('returns candidates that match the shared StartupCandidate shape', async () => {
    const out: any = await similaritySearchTool.execute!({ query_text: 'food delivery app', k: 5 }, {} as never);
    expect(out.candidates).toHaveLength(2);
    for (const c of out.candidates) expect(StartupCandidate.safeParse(c).success).toBe(true);
    expect(out.candidates[0]).toMatchObject({ name: 'Jahez', name_ar: 'جاهز', description: 'Food delivery', source: 'dataset' });
    expect(rpcCalls[0]).toMatchObject({ fn: 'match_startups', args: { match_count: 5, min_similarity: SIMILARITY_THRESHOLD } });
  });

  it('records what it found for the code guard', async () => {
    const values = new Map<string, unknown>();
    const ctx = { requestContext: { get: (k: string) => values.get(k), set: (k: string, v: unknown) => values.set(k, v) } };
    await similaritySearchTool.execute!({ query_text: 'food delivery app', k: 5 }, ctx as never);
    const registry = values.get('darb_search_results') as Map<string, unknown>;
    expect([...registry.keys()]).toEqual(['ST_1', 'ST_2']);
  });

  it('embeds only the description, without the ISIC4 activity', async () => {
    embeddedTexts.length = 0;
    const values = new Map<string, unknown>([['isicSection', 'K'], ['isicDivision', '64']]);
    const ctx = { requestContext: { get: (k: string) => values.get(k), set: (k: string, v: unknown) => values.set(k, v) } };
    await similaritySearchTool.execute!({ query_text: 'BNPL for school fees', k: 5 }, ctx as never);
    expect(embeddedTexts[0]).toBe('BNPL for school fees');
  });
});
