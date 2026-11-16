// Tests for Task 2, finding similar startups in Darb's list. Made-up startups and a fake database:
// no OpenAI, no Supabase. The real cases (TC-2.1 to TC-2.8) are run in Studio.
import { describe, expect, it } from 'vitest';
import { corpusCandidate, firstSentence, keywordsOfProfileText, keywordWords, rankStartups, searchCorpus, searchForIdea, type CorpusRow, type SavedIdeaDeps } from '../../src/mastra/lib/search-corpus';
import { Candidate, type IdeaProfile } from '../../src/mastra/schemas/competitor';

const row = (id: string, name: string, similarity: number, en: string, ar = 'شيء'): CorpusRow => ({
  startup_id: id,
  startup_name: name,
  startup_name_ar: null,
  startup_description: `${name} description`,
  profile_text: `Offering: ${name}\nKeywords: ${en}\nالكلمات المفتاحية: ${ar}`,
  website: `https://www.${name.toLowerCase()}.sa/?utm_source=x`,
  ecosystemsa_profile_url: null,
  similarity,
});

describe('keywords', () => {
  it('reads both keyword lines of a profile', () => {
    expect(keywordsOfProfileText('Problem: x\nKeywords: gym access, fitness\nالكلمات المفتاحية: نادي رياضي، لياقة')).toEqual(['gym access', 'fitness', 'نادي رياضي', 'لياقة']);
  });

  it('compares words, unifies Arabic letters, and ignores common words like "platform"', () => {
    expect([...keywordWords(['gym subscription platform', 'الاشتراكات'])].sort()).toEqual(['gym', 'subscription', 'اشتراكات'].sort());
  });
});

describe('ranking: by meaning and by keywords, combined fairly', () => {
  const rows = [
    row('ST_001', 'Alpha', 0.62, 'gym subscription, fitness pass'),
    row('ST_002', 'Beta', 0.7, 'food delivery'),
    row('ST_003', 'Gamma', 0.6, 'gym equipment'),
    row('ST_004', 'Delta', 0.5, 'real estate'),
  ];

  it('a startup near the top of both lists comes first', () => {
    const list = rankStartups(rows, ['gym subscription', 'fitness']);
    expect(list[0]).toMatchObject({ startup_id: 'ST_001', meaning_rank: 2, keyword_rank: 1, keyword_matches: ['gym', 'subscription', 'fitness'] });
  });

  it('keeps every startup’s place in each list, for the trace', () => {
    const list = rankStartups(rows, ['gym subscription', 'fitness']);
    const beta = list.find((s) => s.startup_id === 'ST_002')!;
    expect(beta).toMatchObject({ meaning_rank: 1, keyword_rank: null, keyword_matches: [] });
  });

  it('keeps 15 at most, ranked 1, 2, 3 …', () => {
    const many = Array.from({ length: 40 }, (_, i) => row(`ST_${100 + i}`, `S${i}`, 0.9 - i * 0.01, 'x'));
    const list = rankStartups(many, ['gym']);
    expect(list).toHaveLength(15);
    expect(list.map((s) => s.rank)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });

  it('TC-2.7: the same input always gives the same list in the same order', () => {
    const tied = [row('ST_009', 'Z', 0.5, 'gym'), row('ST_008', 'Y', 0.5, 'gym'), row('ST_007', 'X', 0.5, 'gym')];
    const first = rankStartups(tied, ['gym']).map((s) => s.startup_id);
    expect(rankStartups([...tied].reverse(), ['gym']).map((s) => s.startup_id)).toEqual(first);
  });

  it('TC-2.8: an idea with nothing close still returns a list (low scores), no crash', () => {
    const list = rankStartups([row('ST_001', 'Alpha', 0.12, 'payments')], ['falcon', 'photography']);
    expect(list).toHaveLength(1);
    expect(list[0].keyword_rank).toBeNull();
  });
});

describe('the candidates for the judge', () => {
  it('are in the shared candidate format, with the profile and description as evidence', () => {
    const c = corpusCandidate({ ...row('ST_073', '1pass', 0.8, 'gym'), startup_name_ar: 'ون باس', ecosystemsa_profile_url: 'https://ecosystemsa.com/x' }, new Date('2026-11-13T09:00:00Z'));
    expect(Candidate.safeParse(c).success).toBe(true);
    expect(c).toMatchObject({
      candidate_key: 'corpus:ST_073',
      startup_id: 'ST_073',
      name_aliases: ['ون باس'],
      website: 'https://1pass.sa',
      domain: '1pass.sa',
    });
    expect(c.evidence_text).toContain('Keywords: gym');
    expect(c.evidence_text).toContain('Description: 1pass description');
    expect(c.sources.map((s) => s.source_type)).toEqual(['official_site', 'ecosystem']);
  });

  it('the whole search: idea profile → vector → Supabase → 15 candidates', async () => {
    const profile = {
      keywords_en: ['gym subscription'],
      keywords_ar: ['اشتراك نادي'],
    } as IdeaProfile;
    let sentVector: number[] = [];
    const out = await searchCorpus(profile, () => 'Offering: one subscription for many gyms', {
      embed: async () => [0.1, 0.2],
      searchByVector: async (v) => {
        sentVector = v;
        return [row('ST_073', '1pass', 0.8, 'gym subscription'), row('ST_002', 'Beta', 0.3, 'food')];
      },
    });
    expect(sentVector).toEqual([0.1, 0.2]);
    expect(out.idea_profile_text).toBe('Offering: one subscription for many gyms');
    expect(out.shortlist.map((s) => s.name)).toEqual(['1pass', 'Beta']);
    expect(out.candidates.map((c) => c.candidate_key)).toEqual(['corpus:ST_073', 'corpus:ST_002']);
  });
});

describe('same idea, same result (design §4, §12)', () => {
  const IDEA = '22222222-2222-4222-8222-222222222222';
  const rows = [row('ST_073', '1pass', 0.8, 'gym subscription'), row('ST_002', 'Beta', 0.3, 'food')];

  function fakes(saved: { profile_text: string | null; embedding: number[] | null } | null) {
    const calls = { build: 0, embed: 0, saved: [] as { profile_text: string; embedding: number[] }[] };
    let wording = 0;
    const deps: SavedIdeaDeps = {
      // Each call writes the profile a little differently, like the real model.
      buildProfile: async () => {
        calls.build++;
        return { keywords_en: [`gym ${++wording}`], keywords_ar: ['نادي'] } as IdeaProfile;
      },
      toText: (p) => `Offering: gyms\nKeywords: ${p.keywords_en.join(', ')}\nالكلمات المفتاحية: ${p.keywords_ar.join('، ')}`,
      embed: async () => {
        calls.embed++;
        return [0.1, 0.2];
      },
      searchByVector: async () => rows,
      loadSaved: async () => saved,
      save: async (_id, r) => {
        calls.saved.push(r);
        saved = r;
      },
    };
    return { deps, calls };
  }

  it('the first search for an idea makes its profile and saves it', async () => {
    const { deps, calls } = fakes(null);
    const out = await searchForIdea({ idea_id: IDEA, idea_text: 'One subscription for many gyms' }, deps);
    expect(out.reused_saved_profile).toBe(false);
    expect(calls.saved).toEqual([{ profile_text: out.idea_profile_text, embedding: [0.1, 0.2] }]);
  });

  it('every later search reuses the saved profile: same list, no new OpenAI call', async () => {
    const { deps, calls } = fakes(null);
    const first = await searchForIdea({ idea_id: IDEA, idea_text: 'One subscription for many gyms' }, deps);
    const second = await searchForIdea({ idea_id: IDEA, idea_text: 'One subscription for many gyms' }, deps);
    expect(second.reused_saved_profile).toBe(true);
    expect(second.idea_profile_text).toBe(first.idea_profile_text);
    expect(second.shortlist).toEqual(first.shortlist);
    expect(calls.build).toBe(1);
    expect(calls.embed).toBe(1);
  });

  it('without an idea_id, nothing is saved', async () => {
    const { deps, calls } = fakes(null);
    await searchForIdea({ idea_text: 'One subscription for many gyms' }, deps);
    expect(calls.saved).toEqual([]);
  });

  it('an idea with no saved profile and no text is refused with a clear reason', async () => {
    const { deps } = fakes(null);
    await expect(searchForIdea({ idea_id: IDEA }, deps)).rejects.toThrow('no saved profile yet');
  });
});

describe('the card description from Darb’s list', () => {
  it('is the first sentence of the description, at most 200 characters', () => {
    expect(firstSentence('Provides home physical therapy in Riyadh by qualified specialists. Book now.')).toBe('Provides home physical therapy in Riyadh by qualified specialists.');
    expect(firstSentence('منصة عقارية في السعودية؟ ابحث الآن')).toBe('منصة عقارية في السعودية؟');
    expect(firstSentence(null)).toBeNull();
    expect(firstSentence('word '.repeat(80))!.length).toBeLessThanOrEqual(200);
  });
});

