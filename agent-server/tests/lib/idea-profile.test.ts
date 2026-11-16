// Tests for the structured idea profile. OpenAI is replaced by a fake answer, so nothing is sent or paid for.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildIdeaProfile, FOUNDER_IDEA_RULES, PROFILE_PROMPT, profileText } from '../../src/mastra/lib/idea-profile';

function fakeOpenAI(answer: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] })));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const answer = {
  problem: { value: 'Restaurants struggle to buy fresh vegetables reliably.', origin: 'inferred' },
  customer: { value: 'Restaurants', origin: 'stated' },
  offering: { value: 'An app to order vegetables from local farms.', origin: 'stated' },
  market: { value: '', origin: 'stated' }, // empty: becomes unknown
  sector: { isic_section: 'g', isic_division: '46' },
  business_model: null,
  keywords_en: ['restaurant supply', ' fresh produce ', ''],
  keywords_ar: ['توريد المطاعم'],
};

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'test-key';
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
});

describe('the profile prompt', () => {
  it('asks for English, plain facts, both keyword languages and "unknown" instead of guessing', () => {
    expect(PROFILE_PROMPT).toContain('in English');
    expect(PROFILE_PROMPT).toContain('marketing language');
    expect(PROFILE_PROMPT).toContain('keywords_ar');
    expect(PROFILE_PROMPT).toContain('Never guess');
  });
});

describe('buildIdeaProfile', () => {
  it('returns a checked profile, at temperature 0, with small fixes', async () => {
    const fetchMock = fakeOpenAI(answer);
    const profile = await buildIdeaProfile('تطبيق يربط المطاعم بالمزارع');
    expect(profile.market).toEqual({ value: null, origin: 'unknown' });
    expect(profile.sector).toEqual({ isic_section: 'G', isic_division: '46' });
    expect(profile.keywords_en).toEqual(['restaurant supply', 'fresh produce']);

    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(sent.temperature).toBe(0);
    expect(sent.messages[1].content).toBe('تطبيق يربط المطاعم بالمزارع');
  });

  it("a founder's idea gets the rule against inventing the offering; Darb's startup list does not (16 Nov 2026)", async () => {
    const fetchMock = fakeOpenAI(answer);
    await buildIdeaProfile('An AI app for restaurants', { founderIdea: true });
    await buildIdeaProfile('A Saudi startup that sells vegetables to restaurants.');
    const system = (i: number) => JSON.parse((fetchMock.mock.calls[i] as unknown as [string, { body: string }])[1].body).messages[0].content;
    expect(system(0)).toContain(FOUNDER_IDEA_RULES);
    expect(system(1)).toBe(PROFILE_PROMPT); // the corpus profiles stay as they were made
    expect(FOUNDER_IDEA_RULES).toContain('set offering to "unknown"');
  });

  it('leaves a sector code in the wrong form empty instead of failing (makan.design, TC-1.5)', async () => {
    for (const [section, division] of [['G', '6201'], ['g', '62.0'], ['Retail', '4'], ['Z', 'ab']]) {
      fakeOpenAI({ ...answer, sector: { isic_section: section, isic_division: division } });
      const profile = await buildIdeaProfile('makan.design: interior design platform');
      expect(profile.sector.isic_division).toBeNull();
      expect(profile.problem.origin).toBe('inferred'); // the rest of the profile is kept
    }
    fakeOpenAI({ ...answer, sector: { isic_section: 'Retail', isic_division: '47' } });
    expect((await buildIdeaProfile('An idea')).sector).toEqual({ isic_section: null, isic_division: '47' });
  });

  it('throws when the answer does not match the profile', async () => {
    fakeOpenAI({ ...answer, problem: { value: 'x', origin: 'guessed' } });
    await expect(buildIdeaProfile('An idea')).rejects.toThrow();
  });

  it('throws without a key or without text, before calling OpenAI', async () => {
    const fetchMock = fakeOpenAI(answer);
    await expect(buildIdeaProfile('   ')).rejects.toThrow('no text');
    delete process.env.OPENAI_API_KEY;
    await expect(buildIdeaProfile('An idea')).rejects.toThrow('OPENAI_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('profileText', () => {
  it('lists the known parts and both keyword lists, and leaves out unknown parts', async () => {
    fakeOpenAI(answer);
    const text = profileText(await buildIdeaProfile('An idea'));
    expect(text).toContain('Customer: Restaurants');
    expect(text).toContain('Keywords: restaurant supply, fresh produce');
    expect(text).toContain('توريد المطاعم');
    expect(text).not.toContain('Market');
  });
});
