// Tests for the small shared helpers: embedded text, translation, embeddings, the owner check, and config data.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ISIC_DIVISIONS } from '../../src/mastra/config/isic-divisions';
import { ISIC_SECTION_LETTERS } from '../../src/mastra/config/sectors';
import { APPROVED_DOMAINS } from '../../src/mastra/config/approved-domains';
import { activityLine, startupEmbedText, toEnglish } from '../../src/mastra/lib/startup-text';
import { embedTexts, toPgVector } from '../../src/mastra/lib/embeddings';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('embedded text', () => {
  it('is English, with no names, and the target market when known', () => {
    const text = startupEmbedText({ startup_description: ' Buy now, pay later for tuition. ', target_market: 'B2C', isic_section: 'K', isic_division: '64' });
    expect(text).toBe(
      'Buy now, pay later for tuition. | Target market: B2C | Activity: Financial and insurance activities; Financial service activities, except insurance and pension funding',
    );
  });

  it('leaves out a division that is not in the section', () => {
    expect(activityLine('P', '64')).toBe('Activity: Education');
    expect(activityLine('Z', '64')).toBeNull();
  });
});

describe('translation to English', () => {
  it('leaves English as it is, without calling OpenAI', async () => {
    globalThis.fetch = vi.fn() as never;
    expect(await toEnglish('BNPL for school fees')).toBe('BNPL for school fees');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('translates Arabic', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: ' Tutoring platform for students ' } }] }))) as never;
    expect(await toEnglish('منصة دروس خصوصية للطلاب')).toBe('Tutoring platform for students');
  });
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

  it('has every site from the sheet once, with known values', () => {
    expect(APPROVED_DOMAINS).toHaveLength(57);
    expect(new Set(APPROVED_DOMAINS.map((d) => d.domain)).size).toBe(57);
    for (const d of APPROVED_DOMAINS) {
      expect(d.domain).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
      for (const s of d.sections) expect(ISIC_SECTION_LETTERS).toContain(s);
    }
  });
});
