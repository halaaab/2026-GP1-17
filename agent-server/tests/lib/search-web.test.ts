// Tests for Task 5, searching the web (test plan TC-5.1 to TC-5.8). The AI and Tavily are fakes:
// nothing is sent or paid for. The live runs are done once in Studio.
import { describe, expect, it } from 'vitest';
import { siteName, nameFromTitle, PREFERRED_SITES, queryProblem, searchWeb, type SearchWebDeps, type WebHit } from '../../src/mastra/lib/search-web';

const PROFILE = 'Offering: a monthly subscription for access to many gyms\nKeywords: gym access, fitness\nالكلمات المفتاحية: نوادي رياضية';
const FOUNDER = 'One monthly subscription that lets people in Riyadh use many different gyms';

// A fake AI that writes the given queries, round after round.
function writer(rounds: { text: string; language: 'ar' | 'en' }[][]): SearchWebDeps['writeQueries'] {
  let i = 0;
  return async () => rounds[i++] ?? [];
}
const hit = (url: string, title: string): WebHit => ({ url, title, content: `${title} text` });

describe('queries: written by the AI, checked by code', () => {
  it('TC-5.3: drops a query that repeats the founder’s own words, or is too long', () => {
    expect(queryProblem('gym subscription app Saudi', FOUNDER, [])).toBeNull();
    expect(queryProblem('subscription that lets people in Riyadh use', FOUNDER, [])).toBe("contains the founder's own words");
    expect(queryProblem('a very long query with far too many words in it', FOUNDER, [])).toBe('longer than 8 words');
    expect(queryProblem('Gym subscription app Saudi', FOUNDER, ['gym subscription app saudi'])).toBe('already searched');
  });

  it('reads the company name from a page title: the part that matches the website', () => {
    expect(nameFromTitle('Get more out of your fitness time | Fitness Time GYM', 'fitnesstime.com.sa')).toBe('Fitness Time GYM');
    expect(nameFromTitle('Memberships | Optimo | Saudi Arabia', 'optimo.com.sa')).toBe('Optimo');
    expect(nameFromTitle('Gym Membership Package Offers in Saudi Arabia | Puregym KSA | PureGym', 'ksa.puregymarabia.com')).toBe('PureGym');
    expect(nameFromTitle('Body Masters - Membership', 'bodymasters.com.sa')).toBe('Body Masters');
  });

  it('uses the website’s own name when no part of the title matches it', () => {
    expect(nameFromTitle('Gyms In Riyadh', 'gymnation.com')).toBe('Gymnation');
    expect(nameFromTitle('Some page', 'core-life.com')).toBe('Core Life');
    // The part before the ending, not the longest part ("eshq.coffee" was shown as "Coffee").
    expect(nameFromTitle('متجر عشق القهوة المختصة', 'eshq.coffee')).toBe('Eshq');
    expect(siteName('eshq.coffee')).toBe('eshq');
    expect(siteName('ksa.puregymarabia.com')).toBe('puregymarabia');
    expect(siteName('optimo.com.sa')).toBe('optimo');
  });

  it('on an app store page, uses the first part of the title', () => {
    expect(nameFromTitle('1pass | Gym subscription', 'apps.apple.com')).toBe('1pass');
  });

  it('never sends the founder’s sentence anywhere: the AI gets only the profile', async () => {
    const seen: string[] = [];
    await searchWeb({ profile_text: PROFILE, founder_text: FOUNDER }, {
      writeQueries: async (profileText) => {
        seen.push(profileText);
        return [];
      },
      search: async () => [],
    });
    expect(seen).toEqual([PROFILE]);
  });
});

describe('Task 5: searching the web', () => {
  it('TC-5.1 and TC-5.2: any site in Saudi Arabia is searched, but an excluded site is never used', async () => {
    const out = await searchWeb({ profile_text: PROFILE }, {
      writeQueries: writer([[{ text: 'gym subscription app Saudi', language: 'en' }]]),
      search: async () => [hit('https://gymy.sa', 'GymY - gym pass'), hit('https://www.linkedin.com/company/gymz', 'GymZ | LinkedIn')],
    });
    expect(PREFERRED_SITES).toContain('play.google.com');
    expect(out.candidates.map((c) => c.domain)).toEqual(['gymy.sa']);
  });

  it('a directory or classifieds site is never a company (Haraj, Bluepages: D6)', async () => {
    const out = await searchWeb({ profile_text: PROFILE }, {
      writeQueries: writer([[{ text: 'gym subscription Riyadh', language: 'en' }]]),
      search: async () => [
        hit('https://haraj.com.sa/search/gym', 'اشتراك نادي رياضي | موقع حراج'),
        hit('https://bluepages.com.sa/riyadh/gyms', 'مراكز رياضية في الرياض | الصفحات الزرقاء'),
        hit('https://gymy.sa', 'GymY - gym pass'),
      ],
    });
    expect(out.candidates.map((c) => c.domain)).toEqual(['gymy.sa']);
  });

  it('news, social media and government pages are evidence, not companies; news titles become leads', async () => {
    const out = await searchWeb({ profile_text: PROFILE }, {
      writeQueries: writer([[{ text: 'gym subscription app Saudi', language: 'en' }]]),
      search: async () => [
        hit('https://menabytes.com/getmuv-investment', 'Saudi startup GetMuv raises $1.5 million'),
        hit('https://www.instagram.com/gymy', 'GymY (@gymy)'),
        hit('https://monshaat.gov.sa/startups', 'Startups list'),
      ],
    });
    expect(out.candidates).toEqual([]);
    expect(out.evidence.map((e) => e.kind)).toEqual(['news', 'social', 'government']);
    expect(out.leads).toEqual(['Saudi startup GetMuv raises $1.5 million']);
  });

  it('keeps only the Saudi App Store, and cleans the hidden marks in names', async () => {
    const out = await searchWeb({ profile_text: PROFILE }, {
      writeQueries: writer([[{ text: 'gym pass app', language: 'en' }]]),
      search: async () => [hit('https://apps.apple.com/sa/app/1pass/id1', '\u200f\u202bتطبيق 1Pass\u202c'), hit('https://apps.apple.com/us/app/route4me/id2', 'Route4Me Route Planner')],
    });
    expect(out.candidates.map((c) => c.name)).toEqual(['تطبيق 1Pass']);
    expect(out.removed.map((r) => r.reason)).toEqual(['not_saudi_app_store']);
  });

  it('TC-5.4 and TC-5.5: the queries asked for are searched, Arabic and English, and listed in the output', async () => {
    const out = await searchWeb({ profile_text: PROFILE }, {
      writeQueries: writer([[{ text: 'gym subscription app Saudi', language: 'en' }, { text: 'اشتراك نوادي رياضية الرياض', language: 'ar' }]]),
      search: async () => [],
    });
    expect(out.queries.map((q) => q.language).sort()).toEqual(['ar', 'en']);
  });

  it('TC-5.6: never more than 10 Tavily calls, however many rounds', async () => {
    let n = 0;
    const out = await searchWeb({ profile_text: PROFILE }, {
      writeQueries: async (_p, _prev, count) => Array.from({ length: count }, () => ({ text: `query ${++n}`, language: 'en' as const })),
      search: async (q) => [hit(`https://company-${q.replace(/\W/g, '')}.sa`, `Company ${q} - app`)],
    }, { calls: 10, newCompanies: 99 });
    expect(out.tavily_calls).toBe(10);
    expect(out.stopped_because).toBe('call_limit');
  });

  it('stops once 10 new companies are found', async () => {
    let n = 0;
    const out = await searchWeb({ profile_text: PROFILE }, {
      writeQueries: async (_p, _prev, count) => Array.from({ length: count }, () => ({ text: `query ${++n}`, language: 'en' as const })),
      search: async (q) => [1, 2, 3].map((k) => hit(`https://c${k}-${q.replace(/\W/g, '')}.sa`, `C${k} ${q} - app`)),
    });
    expect(out.stopped_because).toBe('enough_companies');
    expect(out.candidates).toHaveLength(10);
  });

  it('TC-5.7: a failing Tavily (e.g. wrong key) gives status partial with web_search_failed, never a crash', async () => {
    const out = await searchWeb({ profile_text: PROFILE }, {
      writeQueries: writer([[{ text: 'gym subscription app Saudi', language: 'en' }]]),
      search: async () => {
        throw new Error('401 Unauthorized');
      },
    });
    expect(out).toMatchObject({ status: 'partial', notes: ['web_search_failed'], candidates: [] });
  });

  it('TC-5.8: stops when a round finds nothing new, and invents nothing', async () => {
    const out = await searchWeb({ profile_text: PROFILE }, {
      writeQueries: writer([[{ text: 'falcon photography AlUla', language: 'en' }], [{ text: 'تصوير الصقور العلا', language: 'ar' }]]),
      search: async () => [],
    });
    expect(out).toMatchObject({ stopped_because: 'nothing_new', candidates: [], tavily_calls: 1 });
  });

  it('companies already found (e.g. by search-corpus) are not counted as new', async () => {
    const out = await searchWeb({ profile_text: PROFILE, known_domains: ['https://1pass.app'] }, {
      writeQueries: writer([[{ text: 'gym pass Saudi', language: 'en' }]]),
      search: async () => [hit('https://www.1pass.app', '1pass | Gym pass'), hit('https://gymy.sa', 'GymY - gym pass')],
    });
    expect(out.candidates.map((c) => c.domain)).toEqual(['gymy.sa']);
  });

  it('removes the founder’s own startup and list articles (through Task 7)', async () => {
    const out = await searchWeb({ profile_text: PROFILE, founder_startup: { name: 'GymY' } }, {
      writeQueries: writer([[{ text: 'gym pass Saudi', language: 'en' }]]),
      search: async () => [hit('https://gymy.sa', 'GymY - gym pass'), hit('https://wamda.com/top-10', 'Top 10 Saudi fitness startups')],
    });
    expect(out.candidates).toEqual([]);
    expect(out.removed.map((r) => r.reason)).toEqual(['founder_startup']);
    expect(out.evidence.map((e) => e.kind)).toEqual(['news']);
  });
});
