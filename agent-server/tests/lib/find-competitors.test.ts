// Tests for Task 11, the whole part (test plan TC-11.1 to TC-11.6, TC-11.11, TC-11.12, TC-11.14).
// Fake list, fake web, fake pages and a fake AI: nothing is sent, paid for or saved.
import { describe, expect, it, vi } from 'vitest';
import { addToRunState, CLOSE_SIMILARITY, findCompetitors, type FindDeps } from '../../src/mastra/lib/find-competitors';
import { newRunState } from '../../src/mastra/lib/competitor-run';
import type { CorpusRow } from '../../src/mastra/lib/search-corpus';
import type { AiAnswer, ReadPages } from '../../src/mastra/lib/validate-candidate';
import { Candidate, type IdeaProfile } from '../../src/mastra/schemas/competitor';

const NOW = new Date('2026-11-14T09:00:00Z');
const known = (value: string) => ({ value, origin: 'stated' as const });
const PROFILE: IdeaProfile = {
  problem: known('people want to use many gyms'),
  customer: known('gym goers'),
  offering: known('one monthly gym subscription'),
  market: known('Riyadh'),
  sector: { isic_section: 'R', isic_division: '93' },
  business_model: null,
  keywords_en: ['gym subscription'],
  keywords_ar: ['اشتراك نوادي'],
};
const row = (id: string, name: string, similarity: number): CorpusRow => ({
  startup_id: id, startup_name: name, startup_name_ar: null, startup_description: `${name} gyms`, profile_text: `Offering: ${name} gym subscription`,
  website: `https://${name.toLowerCase()}.sa`, ecosystemsa_profile_url: null, similarity,
});

// Every site says it is real, sells now, is current and is Saudi; "Closed" sites say they closed.
const read: ReadPages & { asked: string[][] } = Object.assign(
  async (urls: string[]) => {
    read.asked.push(urls);
    return {
      pages: urls.filter((u) => !u.endsWith('/ar')).map((url) => ({ url: url.replace(/\/$/, ''), text: `${new URL(url).host.split('.')[0]} gyms info@${new URL(url).host} Join now © 2026`, about_url: null, about_text: null })),
      failed: [],
      tavily_calls: 1,
    };
  },
  { asked: [] as string[][] },
);
const askAi = async (name: string): Promise<AiAnswer> =>
  /closed/i.test(name)
    ? { offering: [], blocking: [{ signal: 'closed or discontinued', quote: 'Join now', page: 1 }], dated: [], saudi_address: [] }
    : { offering: [{ signal: 'sign up, download or order', quote: 'Join now', page: 1 }], blocking: [], dated: [], saudi_address: [] };

function deps(rows: CorpusRow[], webHits: { url: string; title: string }[] = [], stored = new Map()): FindDeps & { searched: string[] } {
  const searched: string[] = [];
  read.asked = [];
  return {
    searched,
    corpus: {
      buildProfile: vi.fn(async () => PROFILE),
      toText: () => 'Offering: one monthly gym subscription\nKeywords: gym subscription',
      embed: async () => [0.1],
      searchByVector: async () => rows,
      loadSaved: async () => null,
      save: async () => {},
    },
    web: {
      writeQueries: async (_p, previous) => (previous.length ? [] : [{ text: 'gym pass Saudi', language: 'en' as const }]),
      search: async (q) => (searched.push(q), webHits.map((h) => ({ ...h, content: h.title }))),
    },
    validate: { read, askAi, save: async () => {} },
    storedChecks: async () => stored,
  };
}

describe('Task 11: Darb’s list, the web when needed, and the checks', () => {
  it('TC-11.1 (D1): only 1 close valid startup → the web is searched, and the new companies are checked', async () => {
    const d = deps([row('ST_073', '1pass', 0.84), row('ST_100', 'Phys', 0.61)], [{ url: 'https://gymy.sa', title: 'GymY - gym pass' }]);
    const out = await findCompetitors({ idea_text: 'one gym subscription', idea_profile: PROFILE }, d, NOW);
    expect(out.web).toMatchObject({ searched: true, queries: ['gym pass Saudi'] });
    expect(out.companies.map((c) => c.name).sort()).toEqual(['1pass', 'GymY', 'Phys']);
  });

  it('TC-11.2 (D5): 3 or more close valid startups → no web search', async () => {
    const d = deps([row('ST_489', 'Bayut', 0.87), row('ST_500', 'FiftyFifty', 0.87), row('ST_501', 'Dealapp', 0.87)]);
    const out = await findCompetitors({ idea_text: 'property app', idea_profile: PROFILE }, d, NOW);
    expect(out.web.searched).toBe(false);
    expect(d.searched).toEqual([]);
    expect(out.companies).toHaveLength(3);
  });

  it(`TC-11.3 (N1): nothing close (below ${CLOSE_SIMILARITY}) → the web is searched; nothing found, nothing invented`, async () => {
    const d = deps([row('ST_200', 'GuestNa', 0.68)]);
    const out = await findCompetitors({ idea_text: 'falcon photography in AlUla', idea_profile: PROFILE }, d, NOW);
    expect(out.web).toMatchObject({ searched: true, stopped_because: 'nothing_new' });
    expect(out.companies.map((c) => c.name)).toEqual(['GuestNa']); // valid, but far from the idea: the judge decides
  });

  it('TC-11.4 (V1): the offering unknown → needs_clarification with one question, and nothing is searched', async () => {
    const d = deps([row('ST_073', '1pass', 0.84)]);
    const vague = { ...PROFILE, offering: { value: null, origin: 'unknown' as const } };
    const out = await findCompetitors({ idea_text: 'An AI app for restaurants', idea_profile: vague, language: 'ar' }, d, NOW);
    expect(out).toMatchObject({ status: 'needs_clarification', clarification: { missing_field: 'offering' }, tavily_calls: 0, companies: [] });
    expect(out.clarification!.question).toMatch(/[؀-ۿ]/);
    expect(read.asked).toEqual([]);
  });

  it('TC-11.5: never more than 15 Tavily calls, even when every step has work to do', async () => {
    const rows = Array.from({ length: 15 }, (_, i) => row(`ST_${i}`, `Far${i}`, 0.6));
    const d = deps(rows);
    let n = 0;
    d.web.writeQueries = async (_p, _prev, count) => Array.from({ length: count }, () => ({ text: `query ${++n}`, language: 'en' as const }));
    d.web.search = async (q) => [{ url: `https://c-${q.replace(/\W/g, '')}.sa`, title: `C ${q} - app`, content: '' }];
    const out = await findCompetitors({ idea_text: 'x', idea_profile: PROFILE }, d, NOW);
    expect(out.tavily_calls).toBeLessThanOrEqual(15);
    expect(out.companies.length).toBeLessThanOrEqual(25);
  });

  it('TC-11.6: every company passed on has its validation and is Confirmed or Likely; Unconfirmed ones are listed apart', async () => {
    const d = deps([row('ST_1', 'Good', 0.9), row('ST_2', 'Closed', 0.9)]);
    const out = await findCompetitors({ idea_text: 'x', idea_profile: PROFILE, web: 'off' }, d, NOW);
    expect(out.companies.map((c) => c.name)).toEqual(['Good']);
    for (const c of out.companies) {
      expect(c.validation?.evidence_status).toMatch(/confirmed|likely/);
      const { evidence_status, checked, similarity, ...candidate } = c;
      expect(Candidate.safeParse(candidate).success).toBe(true);
    }
    expect(out.not_shown).toEqual([expect.objectContaining({ name: 'Closed', why: expect.stringContaining('active fail') })]);
  });

  it("a web company already in Darb's list is dropped by its name, even from another link (1Pass App)", async () => {
    const d = deps([row('ST_073', '1pass', 0.84)], [{ url: 'https://1passapp.com', title: '1Pass App' }, { url: 'https://gymy.sa', title: 'GymY - gym pass' }]);
    const out = await findCompetitors({ idea_text: 'one gym subscription', idea_profile: PROFILE }, d, NOW);
    expect(out.companies.map((c) => c.name).sort()).toEqual(['1pass', 'GymY']);
    expect(out.not_shown).toContainEqual(expect.objectContaining({ source: 'web', why: "already in Darb's list" }));
  });

  it('a startup from Darb’s list below 0.55 is not checked or passed on (N1: Unifonic 0.45)', async () => {
    const d = deps([row('ST_073', '1pass', 0.84), row('ST_021', 'Unifonic', 0.45)]);
    const out = await findCompetitors({ idea_text: 'x', idea_profile: PROFILE, web: 'off' }, d, NOW);
    expect(out.companies.map((c) => c.name)).toEqual(['1pass']);
    expect(out.not_shown).toContainEqual({ name: 'Unifonic', source: 'corpus', why: 'not close enough to the idea (0.45, below 0.55)' });
    expect(read.asked.flat().some((u) => u.includes('unifonic'))).toBe(false); // never read
  });

  it('TC-11.11: the founder’s own startup never appears', async () => {
    const d = deps([row('ST_073', '1pass', 0.84), row('ST_1', 'Good', 0.9)]);
    const out = await findCompetitors({ idea_text: 'I run 1pass', idea_profile: PROFILE, founder_startup: { name: '1pass' }, web: 'off' }, d, NOW);
    expect(out.companies.map((c) => c.name)).toEqual(['Good']);
    expect(out.not_shown[0]).toMatchObject({ name: '1pass', why: "the founder's own startup" });
  });

  it('TC-11.12: an analogy ("like Talabat") is never a competitor', async () => {
    const d = deps([row('ST_9', 'Talabat', 0.9), row('ST_1', 'Good', 0.9)]);
    const out = await findCompetitors({ idea_text: 'Like Talabat, but for pharmacies', idea_profile: PROFILE, references: ['Talabat'], web: 'off' }, d, NOW);
    expect(out.companies.map((c) => c.name)).toEqual(['Good']);
  });

  it('a stored pass from the last 90 days is used without reading the site again (Task 9)', async () => {
    const stored = new Map([['ST_073', { validation_status: 'pass', validated_at: '2026-11-01T00:00:00Z' }]]);
    const d = deps([row('ST_073', '1pass', 0.84)], [], stored);
    const out = await findCompetitors({ idea_text: 'x', idea_profile: PROFILE, web: 'off' }, d, NOW);
    expect(out.companies[0]).toMatchObject({ name: '1pass', checked: 'stored', evidence_status: 'likely' });
    expect(read.asked).toEqual([]);
    // Saved as Confirmed (migration 0039): shown as Confirmed, not Likely.
    const confirmed = new Map([['ST_073', { validation_status: 'pass', evidence_status: 'confirmed', validated_at: '2026-11-01T00:00:00Z' }]]);
    const out2 = await findCompetitors({ idea_text: 'x', idea_profile: PROFILE, web: 'off' }, deps([row('ST_073', '1pass', 0.84)], [], confirmed), NOW);
    expect(out2.companies[0]).toMatchObject({ name: '1pass', checked: 'stored', evidence_status: 'confirmed' });
  });

  it('TC-11.14: web "off" never searches; "always" searches even when the list is enough', async () => {
    const rows = [row('ST_1', 'A', 0.9), row('ST_2', 'B', 0.9), row('ST_3', 'C', 0.9)];
    const off = deps(rows);
    expect((await findCompetitors({ idea_text: 'x', idea_profile: PROFILE, web: 'off' }, off, NOW)).web.searched).toBe(false);
    const always = deps(rows);
    expect((await findCompetitors({ idea_text: 'x', idea_profile: PROFILE, web: 'always' }, always, NOW)).web.searched).toBe(true);
  });

  it('in the agent: the valid companies go to the run state as strict Candidates, ready for the judge', async () => {
    const stored = new Map([['ST_073', { validation_status: 'pass', evidence_status: 'confirmed', validated_at: '2026-11-01T00:00:00Z' }]]);
    const out = await findCompetitors({ idea_text: 'x', idea_profile: PROFILE, web: 'always' }, deps([row('ST_073', '1pass', 0.84)], [{ url: 'https://gymy.sa', title: 'GymY - gym pass' }], stored), NOW);
    const state = newRunState();
    addToRunState(state, out, 1234);
    const candidates = [...state.candidates.values()];
    expect(candidates.map((c) => c.name).sort()).toEqual(['1pass', 'GymY']);
    for (const c of candidates) expect(() => Candidate.parse(c)).not.toThrow(); // no extra fields
    // A stored pass becomes a validation, so the guardrails can show it (with its saved Confirmed).
    expect(state.candidates.get('corpus:ST_073')?.validation).toMatchObject({ evidence_status: 'confirmed', checked_at: '2026-11-01T00:00:00.000Z' });
    expect(state.tavilyCalls).toBe(out.tavily_calls);
    expect(state.steps).toEqual([{ capability: 'discover', outcome: 'ok', duration_ms: 1234, detail: expect.stringContaining('valid=2') }]);
  });
});

