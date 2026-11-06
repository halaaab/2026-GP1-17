// The web tools from start to finish, with fake Tavily, fake OpenAI and fake embeddings:
// web_search → extract_and_verify_profile → finalize_competitors.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fake Tavily: one search answer and one page.
const searchCalls: { query: string; options: Record<string, unknown> }[] = [];
const extractCalls: string[][] = [];
const PAGE = [
  'Saudi ArtTech startups to watch.',
  'Rawi Art. Rawi Art issues digital certificates of authenticity for artworks sold by Saudi galleries.',
  'Lawha. Lawha is an online marketplace where collectors buy original paintings from local artists.',
  'Powered by our research team. Trusted insights for every investor and founder.',
].join('\n');
vi.mock('@tavily/core', () => ({
  tavily: () => ({
    search: async (query: string, options: Record<string, unknown>) => {
      searchCalls.push({ query, options });
      return {
        results: [
          { title: 'Saudi ArtTech startups', url: 'https://www.wamda.com/2026/art-tech', content: 'A list of Saudi ArtTech startups' },
          { title: 'Fake copy', url: 'https://wamda.com.evil.io/art', content: 'x' },
        ],
      };
    },
    extract: async (urls: string[]) => {
      extractCalls.push(urls);
      return { results: [{ rawContent: PAGE }] };
    },
  }),
}));

// Fake OpenAI profile extraction: two real profiles, one invented quote, and the page's tagline given to a company.
const extracted = {
  companies: [
    { name: 'Rawi Art', name_ar: null, website: 'https://rawi.art', country: 'Saudi Arabia', quote: 'Rawi Art issues digital certificates of authenticity for artworks sold by Saudi galleries.' },
    { name: 'Lawha', name_ar: null, website: null, country: null, quote: 'Lawha is an online marketplace where collectors buy original paintings from local artists.' },
    { name: 'Fanni', name_ar: null, website: null, country: null, quote: 'Fanni is the largest art platform in the Gulf with two million users.' },
    { name: 'Lawha', name_ar: null, website: null, country: null, quote: 'Trusted insights for every investor and founder.' },
  ],
};
const realFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(extracted) } }] }))) as never;
  process.env.TAVILY_API_KEY = 'test';
  process.env.OPENAI_API_KEY = 'test';
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.TAVILY_API_KEY;
});

// Fake embeddings: the idea is [1, 0]; certificates point the same way, a marketplace partly.
vi.mock('../lib/embeddings', () => ({
  embedTexts: async (texts: string[]) =>
    texts.map((t) => (t.startsWith('Art authentication') ? [1, 0] : t.includes('certificates') ? [0.8, 0.6] : t.includes('marketplace') ? [0.5, 0.866] : [0, 1])),
  toPgVector: (e: number[]) => JSON.stringify(e),
}));

const { webSearchTool } = await import('./web-search');
const { extractAndVerifyProfileTool } = await import('./extract-and-verify-profile');
const { finalizeCompetitorsTool } = await import('./finalize-competitors');

function analysisContext() {
  const values = new Map<string, unknown>([
    ['isicSection', 'R'],
    ['ideaText', 'Art authentication with certificates of authenticity'],
  ]);
  return { requestContext: { get: (k: string) => values.get(k), set: (k: string, v: unknown) => values.set(k, v) }, agent: {}, values };
}

describe('web flow', () => {
  it('searches approved sites, verifies profiles on the page, and ranks only verified ones', async () => {
    searchCalls.length = 0;
    const ctx = analysisContext();

    // 1. web_search: only approved sites are searched, and the lookalike result is dropped.
    const found: any = await webSearchTool.execute!({ queries: ['Saudi art authentication startups'] }, ctx as never);
    expect(searchCalls[0].options.includeDomains).toContain('wamda.com');
    expect(searchCalls[0].options.includeDomains).not.toContain('sama.gov.sa'); // finance site, not for section R
    expect(found.results.map((r: any) => r.url)).toEqual(['https://www.wamda.com/2026/art-tech']);

    // 2. extract_and_verify_profile: the invented quote is rejected, and so is the tagline given to Lawha as a second profile.
    const page: any = await extractAndVerifyProfileTool.execute!({ url: 'https://www.wamda.com/2026/art-tech' }, ctx as never);
    expect(extractCalls.at(-1)).toEqual(['https://www.wamda.com/2026/art-tech']);
    expect(page.candidates.map((c: any) => c.name)).toEqual(['Rawi Art', 'Lawha']);
    expect(page.candidates[1].description).toBe(extracted.companies[1].quote); // the real description, not the tagline
    expect(page.rejected.map((r: any) => r.reason)).toEqual(['its description is not on the page', 'a second description for the same company']);
    const rawi = page.candidates[0];
    expect(rawi.description).toBe(extracted.companies[0].quote); // the page's own sentence
    expect(rawi.source).toBe('web');
    expect(rawi.source_url).toBe('https://www.wamda.com/2026/art-tech');
    expect(rawi.similarity).toBeCloseTo(0.8); // computed in code against the idea

    // 3. finalize_competitors: accepts the verified web companies with their computed scores; an invented id is dropped.
    const final: any = await finalizeCompetitorsTool.execute!(
      { startup_ids: [rawi.startup_id, page.candidates[1].startup_id, 'web:invented:fanni'] },
      ctx as never,
    );
    expect(final.competitors.map((c: any) => [c.name, Math.round(c.similarity * 100)])).toEqual([
      ['Rawi Art', 80],
      ['Lawha', 50],
    ]);
    expect(final.iss).toBe(65);
  });

  it('uses only the snippet for a "snippet only" site, without opening the page', async () => {
    const ctx = analysisContext();
    const { recordWebResults } = await import('../lib/web-registry');
    recordWebResults(ctx, [
      { title: 't', url: 'https://www.crunchbase.com/organization/rawi', snippet: 'Rawi Art. Rawi Art issues digital certificates of authenticity for artworks sold by Saudi galleries.', domain: 'crunchbase.com', status: 'needs_checking', label: 'single', method: 'snippet', query: 'q' },
    ]);
    const before = extractCalls.length;
    const page: any = await extractAndVerifyProfileTool.execute!({ url: 'https://www.crunchbase.com/organization/rawi' }, ctx as never);
    expect(extractCalls.length).toBe(before); // the page was never opened
    expect(page.candidates.map((c: any) => c.name)).toEqual(['Rawi Art']);
  });
});
