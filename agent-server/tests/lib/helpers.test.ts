// Tests for the small shared helpers: embeddings, the owner check, and config data.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ISIC_DIVISIONS } from '../../src/mastra/config/isic-divisions';
import { ISIC_SECTION_LETTERS } from '../../src/mastra/config/sectors';
import { embedTexts, toPgVector } from '../../src/mastra/lib/embeddings';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('embeddings', () => {
  it('puts OpenAI answers back in the order the texts were sent', async () => {
    process.env.OPENAI_API_KEY = 'test';
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ index: 1, embedding: [2] }, { index: 0, embedding: [1] }] })),
    ) as never;
    expect(await embedTexts(['first', 'second'])).toEqual([[1], [2]]);
    expect(toPgVector([0.1, 0.2])).toBe('[0.1,0.2]');
  });

  it('reports a failed request instead of returning nothing', async () => {
    process.env.OPENAI_API_KEY = 'test';
    globalThis.fetch = vi.fn(async () => new Response('busy', { status: 429 })) as never;
    await expect(embedTexts(['x'])).rejects.toThrow(/429/);
  });
});

describe('who the founder is', () => {
  it('prefers the id set by the server, then the memory resource id', async () => {
    const { getUserId } = await import('../../src/mastra/lib/assessments');
    const withBoth = { requestContext: { get: () => 'from-login' }, agent: { resourceId: 'from-memory' } };
    expect(getUserId(withBoth)).toBe('from-login');
    expect(getUserId({ agent: { resourceId: 'from-memory' } })).toBe('from-memory');
    expect(getUserId({})).toBeNull();
  });
});

describe('config data', () => {
  it('has the 85 SSIC divisions, each in a real section', () => {
    expect(Object.keys(ISIC_DIVISIONS)).toHaveLength(85);
    for (const [code, d] of Object.entries(ISIC_DIVISIONS)) {
      expect(code).toMatch(/^\d{2}$/);
      expect(ISIC_SECTION_LETTERS).toContain(d.section);
      expect(d.ar.length).toBeGreaterThan(0);
    }
  });

  it('excludes exact hostnames only: google.com, not Google Play', async () => {
    const { isExcludedSite } = await import('../../src/mastra/config/excluded-sources');
    expect(isExcludedSite('www.linkedin.com')).toBe(true);
    expect(isExcludedSite('google.com')).toBe(true);
    expect(isExcludedSite('maps.google.com')).toBe(true);
    expect(isExcludedSite('play.google.com')).toBe(false);
    expect(isExcludedSite('magnitt.com')).toBe(true);
  });
});
