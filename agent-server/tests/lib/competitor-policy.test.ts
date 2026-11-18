// Tests for the guardrails: the policy rules, the similarity score, the ranking, the ISS, the market level and the
// Result. Everything here is code, so no model, database or website is called.
import { describe, expect, it } from 'vitest';
import {
  applyPolicy,
  buildResult,
  opportunityFor,
  quoteInEvidence,
  withCardName,
  citesCandidate,
  computeIss,
  hostOf,
  isExcluded,
  marketLevel,
  normalizeName,
  rankCompetitors,
  similarityScore,
  displayName,
  type Judged,
} from '../../src/mastra/lib/competitor-policy';

describe('displayName (18 Nov 2026)', () => {
  it('shows the name in the founder\'s language when the company has one, else its main name', () => {
    expect(displayName({ name: 'Mrsool', name_aliases: ['مرسول'] }, 'ar')).toBe('مرسول');
    expect(displayName({ name: 'Mrsool', name_aliases: ['مرسول'] }, 'en')).toBe('Mrsool');
    expect(displayName({ name: 'عشق القهوة', name_aliases: ['Eshq Coffee'] }, 'en')).toBe('Eshq Coffee');
    expect(displayName({ name: 'Foodics', name_aliases: [] }, 'ar')).toBe('Foodics');
  });
});
import { Handoff, Result, type Candidate, type IdeaProfile, type JudgeOutput } from '../../src/mastra/schemas/competitor';

const NOW = '2026-11-11T10:00:00+03:00';

const profile = (customer: 'stated' | 'inferred' | 'unknown' = 'stated'): IdeaProfile => ({
  problem: { value: 'Restaurants struggle to buy fresh vegetables reliably', origin: 'stated' },
  customer: customer === 'unknown' ? { value: null, origin: 'unknown' } : { value: 'Restaurants', origin: customer },
  offering: { value: 'An app to order vegetables from local farms', origin: 'stated' },
  market: { value: 'Riyadh', origin: 'stated' },
  sector: { isic_section: 'G', isic_division: '46' },
  business_model: null,
  keywords_en: ['restaurant supply'],
  keywords_ar: ['توريد المطاعم'],
});

function candidate(key: string, extra: Partial<Candidate> = {}, status: 'confirmed' | 'likely' | 'unconfirmed' = 'confirmed'): Candidate {
  return {
    candidate_key: key,
    source_type: 'web',
    startup_id: null,
    name: `${key} Co`,
    name_aliases: [],
    website: `https://www.${key}.sa`,
    domain: `${key}.sa`,
    evidence_text: 'We supply fresh vegetables to restaurants in Riyadh every morning.',
    description: `${key} supplies restaurants with fresh produce.`,
    city_region: 'Riyadh',
    sources: [{ url: `https://www.${key}.sa/about`, source_type: 'official_site', accessed_at: NOW }],
    validation: { real_entity: 'pass', real_offering: 'pass', active: 'pass', saudi_reach: 'pass', evidence_status: status, checked_at: NOW },
    ...extra,
  };
}

const QUOTE = 'fresh vegetables to restaurants in Riyadh';
const same = (key: string) => ({ answer: 'same' as const, note: 'Same.', source_url: `https://www.${key}.sa/about`, quote: QUOTE });
const ans = (answer: 'partly' | 'different' | 'unknown' | 'conflicting') => ({ answer, note: answer });

function judge(key: string, extra: Partial<JudgeOutput> = {}): JudgeOutput {
  return { candidate_key: key, is_company: true, problem: same(key), customer: same(key), offering: same(key), label: 'direct', reason: 'Same problem for restaurants.', ...extra };
}

const judged = (key: string, j: Partial<JudgeOutput> = {}, c: Partial<Candidate> = {}, status?: 'confirmed' | 'likely' | 'unconfirmed', p = profile()): Judged => {
  const cand = candidate(key, c, status);
  return { candidate: cand, policy: applyPolicy(judge(key, j), cand, p) };
};

const handoff = Handoff.parse({
  assessment_id: '11111111-1111-4111-8111-111111111111',
  idea_id: '22222222-2222-4222-8222-222222222222',
  mode: 'new',
  language: 'en',
  idea_text: 'An app for restaurants to order vegetables from local farms',
});
const usage = { tavily_calls: 4, duration_ms: 1200, trace_id: 't1' };

describe('the similarity score', () => {
  it('gives full points for same, half for partly and none for the rest, problem weighing most', () => {
    expect(similarityScore({ problem: 'same', customer: 'same', offering: 'same' }, 'full')).toBe(100);
    expect(similarityScore({ problem: 'same', customer: 'different', offering: 'different' }, 'full')).toBe(50);
    expect(similarityScore({ problem: 'partly', customer: 'unknown', offering: 'conflicting' }, 'full')).toBe(25);
    expect(similarityScore({ problem: 'different', customer: 'same', offering: 'same' }, 'full')).toBe(50);
  });

  it('uses only the problem and the offering when the customer is unknown', () => {
    expect(similarityScore({ problem: 'same', customer: 'different', offering: 'same' }, 'problem_offering_only')).toBe(100);
    expect(similarityScore({ problem: 'same', customer: 'same', offering: 'different' }, 'problem_offering_only')).toBe(71);
  });
});

describe('the policy rules on one judge answer', () => {
  it('keeps a Direct label backed by sources, with a score of 100', () => {
    expect(judged('a').policy).toMatchObject({ label: 'direct', similarity_score: 100 });
  });

  it('turns a "same" without a source from this candidate into "unknown"', () => {
    const p = judged('a', { customer: { answer: 'same', note: 'x', source_url: 'https://other-site.com/page', quote: QUOTE }, offering: { answer: 'same', note: 'x', quote: QUOTE } }).policy;
    expect(p.customer.answer).toBe('unknown');
    expect(p.offering.answer).toBe('unknown');
    expect(p.label).toBe('indirect'); // Direct needs the same customer
  });

  it('turns a "same" whose quote is missing or not in the evidence into "unknown"', () => {
    const noQuote = judged('a', { problem: { answer: 'same', note: 'x', source_url: 'https://www.a.sa/about' } }).policy;
    expect(noQuote.problem.answer).toBe('unknown');
    const madeUp = judged('a', { customer: { ...same('a'), quote: 'We only serve restaurants in Jeddah' } }).policy;
    expect(madeUp.customer.answer).toBe('unknown');
    expect(quoteInEvidence('  FRESH vegetables   to restaurants ', 'We supply fresh vegetables to restaurants.')).toBe(true);
    expect(quoteInEvidence('short', 'short text')).toBe(false); // too short to prove anything
  });

  it('accepts a source on the candidate’s own site, with or without www', () => {
    const c = candidate('a');
    expect(citesCandidate('https://a.sa/pricing', c)).toBe(true);
    expect(citesCandidate('https://www.a.sa/about', c)).toBe(true);
    expect(citesCandidate('https://a.sa.evil.com', c)).toBe(false);
    expect(citesCandidate(undefined, c)).toBe(false);
  });

  it('never shows articles, lists or directory pages', () => {
    expect(judged('a', { is_company: false }).policy).toMatchObject({ label: 'not_competitor', changed_by: 'not_a_company', similarity_score: 0 });
  });

  it('keeps the judge’s "not a competitor"', () => {
    expect(judged('a', { label: 'not_competitor' }).policy.label).toBe('not_competitor');
  });

  it('never counts the same sector or topic only', () => {
    for (const problem of [ans('different'), ans('unknown'), ans('conflicting')]) {
      expect(judged('a', { problem, label: 'indirect' }).policy).toMatchObject({ label: 'not_competitor', changed_by: 'problem_not_shared' });
    }
  });

  it('downgrades Direct to Indirect unless the problem and the stated customer are the same', () => {
    expect(judged('a', { customer: ans('partly') }).policy.label).toBe('indirect');
    expect(judged('a', { problem: ans('partly') }).policy.label).toBe('indirect');
    expect(judged('a', { offering: ans('conflicting') }).policy.label).toBe('indirect');
    // an inferred or unknown customer can never produce Direct
    expect(judged('a', {}, {}, 'confirmed', profile('inferred')).policy.label).toBe('indirect');
    expect(judged('a', {}, {}, 'confirmed', profile('unknown')).policy.label).toBe('indirect');
  });

  it('never upgrades Indirect to Direct', () => {
    expect(judged('a', { label: 'indirect' }).policy.label).toBe('indirect');
  });
});

describe('competitive opportunities (four fixed rules)', () => {
  const o = (problem: string, customer: string, offering: string) =>
    opportunityFor({ problem, customer, offering } as Parameters<typeof opportunityFor>[0]);

  it('finds a proven difference when the customer is different', () => {
    expect(o('same', 'different', 'same')).toBe('proven_difference');
  });
  it('finds a possible difference about the customer when the customer is only partly the same', () => {
    expect(o('same', 'partly', 'same')).toBe('possible_customer_difference');
  });
  it('finds a possible difference about the offering when the offering differs in part or fully', () => {
    expect(o('same', 'same', 'partly')).toBe('possible_difference');
    expect(o('same', 'same', 'different')).toBe('possible_difference');
  });
  it('says honestly when there is no clear difference', () => {
    expect(o('same', 'same', 'same')).toBe('no_clear_difference');
  });
  it('takes the first matching rule from the top, so a customer difference wins', () => {
    expect(o('same', 'different', 'partly')).toBe('proven_difference');
    expect(o('same', 'partly', 'partly')).toBe('possible_customer_difference'); // the customer rule comes first
  });
  it('treats conflicting evidence as unknown, never as a difference', () => {
    expect(o('same', 'conflicting', 'same')).toBe('not_enough_evidence');
    expect(o('same', 'same', 'conflicting')).toBe('not_enough_evidence');
    expect(o('same', 'conflicting', 'partly')).toBe('possible_difference'); // the difference comes from the offering
  });
  it('says there is not enough evidence when most answers are unknown', () => {
    expect(o('same', 'unknown', 'unknown')).toBe('not_enough_evidence');
    expect(o('partly', 'same', 'unknown')).toBe('not_enough_evidence');
  });
  it('keeps the judge’s difference sentence, and drops "none"', () => {
    expect(judged('a', { offering: ans('partly'), difference: 'It covers one chain, not many.' }).policy).toMatchObject({
      opportunity: 'possible_difference',
      difference: 'It covers one chain, not many.',
    });
    expect(judged('a', { difference: 'None.' }).policy).toMatchObject({ opportunity: 'no_clear_difference', difference: null });
  });
});

describe('the policy gate and ranking', () => {
  it('shows the strongest overlap first, then Confirmed before Likely (18 Nov 2026)', () => {
    const ranked = rankCompetitors(
      [
        judged('likely100', {}, {}, 'likely'),
        judged('confirmed50', { customer: ans('different'), offering: ans('different'), label: 'indirect' }),
        judged('confirmed100'),
      ],
      handoff,
    );
    // a Likely company as close as the idea comes before a Confirmed one that is further away (Jahez above Lugmety)
    expect(ranked.map((j) => j.candidate.candidate_key)).toEqual(['confirmed100', 'likely100', 'confirmed50']);
  });

  it('never shows unconfirmed or unvalidated candidates, ones with no source or no description, or non-competitors', () => {
    const ranked = rankCompetitors(
      [
        judged('unconfirmed', {}, {}, 'unconfirmed'),
        judged('unvalidated', {}, { validation: undefined }),
        judged('nosource', {}, { sources: [] }),
        judged('nodescription', {}, { description: null }),
        judged('article', { is_company: false }),
        judged('ok'),
      ],
      handoff,
    );
    expect(ranked.map((j) => j.candidate.candidate_key)).toEqual(['ok']);
  });

  it('shows one result per company: same domain, or the same name in Arabic letter forms', () => {
    const ranked = rankCompetitors(
      [
        judged('a'),
        judged('a2', {}, { domain: 'a.sa', website: 'https://a.sa' }),
        judged('b', {}, { name: 'مؤسسة', domain: null, website: null }),
        judged('c', {}, { name: 'مؤسسه', domain: null, website: null }),
      ],
      handoff,
    );
    expect(ranked).toHaveLength(2);
  });

  it('never shows the founder’s own startup or a reference', () => {
    const exclude = { founder_startup: { name: 'My Farm', website: 'myfarm.sa' }, references: ['Talabat'] };
    expect(isExcluded(candidate('x', { name: 'my-farm' }), exclude)).toBe(true);
    expect(isExcluded(candidate('x', { domain: 'myfarm.sa', website: null }), exclude)).toBe(true);
    expect(isExcluded(candidate('x', { name: 'طلبات', name_aliases: ['Talabat'] }), exclude)).toBe(true);
    expect(isExcluded(candidate('x'), exclude)).toBe(false);
  });

  it('normalizes names and hosts', () => {
    expect(normalizeName('Jahez  Co.')).toBe('jahezco');
    expect(normalizeName('إِدارة')).toBe('اداره');
    expect(hostOf('WWW.Example.com/path')).toBe('example.com');
    expect(hostOf(null)).toBeNull();
  });
});

describe('the ISS and the market level', () => {
  it('has no ISS when nothing is found', () => {
    expect(computeIss([])).toBeNull();
  });

  it('lets the closest competitor count most, so a clone is not hidden by an average', () => {
    const iss = computeIss([
      { similarity_score: 100, evidence_status: 'confirmed' },
      { similarity_score: 20, evidence_status: 'confirmed' },
      { similarity_score: 20, evidence_status: 'confirmed' },
    ]);
    expect(iss).toBe(68); // a plain average would be 47
  });

  it('counts a Likely competitor slightly less', () => {
    expect(computeIss([{ similarity_score: 100, evidence_status: 'likely' }])).toBe(90);
    expect(computeIss([{ similarity_score: 80, evidence_status: 'confirmed' }])).toBe(80);
  });

  it('is open, competitive or crowded by the number of valid direct competitors', () => {
    const direct = (n: number) => Array.from({ length: n }, (_, i) => judged(`d${i}`));
    expect(marketLevel(direct(2))).toBe('open');
    expect(marketLevel(direct(3))).toBe('competitive');
    expect(marketLevel(direct(6))).toBe('crowded');
    expect(marketLevel([...direct(2), judged('i', { label: 'indirect' })])).toBe('open');
  });
});

describe('the Result', () => {
  it('shows up to three, ranked, with the ISS, basis and market level, and is valid', () => {
    const result = buildResult({ handoff, profile: profile(), judged: ['a', 'b', 'c', 'd'].map((k) => judged(k)), runNotes: [], usage });
    expect(Result.safeParse(result).success).toBe(true);
    expect(result.competitors.map((c) => c.rank)).toEqual([1, 2, 3]);
    expect(result).toMatchObject({ status: 'complete', iss: 100, iss_basis: 'full', market_level: 'competitive', notes: [] });
    expect(result.competitors[0]).toMatchObject({ label: 'direct', evidence_status: 'confirmed', description: 'a supplies restaurants with fresh produce.', opportunity: 'no_clear_difference' });
  });

  it('keeps the proof sentence only when it is really on the competitor’s own page (18 Nov 2026)', () => {
    const shown = buildResult({ handoff, profile: profile(), judged: [judged('a')], runNotes: [], usage }).competitors[0];
    expect(shown.comparison.problem).toEqual({ answer: 'same', note: 'Same.', quote: QUOTE, source_url: 'https://www.a.sa/about' });

    // a "partly" whose sentence is not in the evidence, or that cites another site, keeps no quote
    const invented = { answer: 'partly' as const, note: 'Partly.', source_url: 'https://www.a.sa/about', quote: 'we deliver groceries to every home in Jeddah' };
    const elsewhere = { answer: 'partly' as const, note: 'Partly.', source_url: 'https://news.example.com/a', quote: QUOTE };
    const other = buildResult({ handoff, profile: profile(), judged: [judged('a', { problem: invented, offering: elsewhere, label: 'indirect' })], runNotes: [], usage }).competitors[0];
    expect(other.comparison.problem).toEqual({ answer: 'partly', note: 'Partly.' });
    expect(other.comparison.offering).toEqual({ answer: 'partly', note: 'Partly.' });
    expect(Result.safeParse(buildResult({ handoff, profile: profile(), judged: [judged('a')], runNotes: [], usage })).success).toBe(true);

    // a startup from Darb's list: its evidence is Darb's own summary, not the company's page, so no quote is shown
    const listed = buildResult({ handoff, profile: profile(), judged: [judged('a', {}, { source_type: 'corpus', startup_id: '33333333-3333-4333-8333-333333333333' })], runNotes: [], usage }).competitors[0];
    expect(listed.comparison.problem).toEqual({ answer: 'same', note: 'Same.' });
  });

  it('says none were found, with no ISS and no market level', () => {
    const result = buildResult({ handoff, profile: profile(), judged: [judged('a', { label: 'not_competitor' })], runNotes: [], usage });
    expect(result).toMatchObject({ status: 'complete', competitors: [], iss: null, iss_basis: null, market_level: null, notes: ['none_found'] });
  });

  it('adds the notes for fewer than three, only indirect and an unknown customer', () => {
    const result = buildResult({ handoff, profile: profile('unknown'), judged: [judged('a', {}, {}, 'confirmed', profile('unknown'))], runNotes: [], usage });
    expect(result.notes).toEqual(['fewer_than_three', 'only_indirect', 'customer_unknown']);
    expect(result.iss_basis).toBe('problem_offering_only');
  });

  it('is partial, still with its competitors, when a part of the run failed', () => {
    const result = buildResult({ handoff, profile: profile(), judged: [judged('a')], runNotes: ['web_search_failed', 'judge_call_failed'], usage });
    expect(result.status).toBe('partial');
    expect(result.competitors).toHaveLength(1);
    expect(result.notes).toEqual(['fewer_than_three', 'web_search_failed', 'judge_call_failed']);
  });

  it('keeps a corpus competitor’s startup_id', () => {
    const result = buildResult({ handoff, profile: profile(), judged: [judged('a', {}, { source_type: 'corpus', startup_id: '42' })], runNotes: [], usage });
    expect(result.competitors[0]).toMatchObject({ source_type: 'corpus', startup_id: '42' });
  });
});

describe('the company name inside the card sentences (18 Nov 2026)', () => {
  const lugmety = { name: 'Lugmety', name_aliases: ['لقمتي', 'Lugmety App'], domain: 'lugmety.com' };
  it('uses the card name in an Arabic card', () => {
    expect(withCardName('تتناول Lugmety مشكلة توصيل الطعام، و Lugmety App متاح في الرياض.', lugmety, 'لقمتي')).toBe('تتناول لقمتي مشكلة توصيل الطعام، و لقمتي متاح في الرياض.');
    expect(withCardName('يقدم lugmety وجبات', lugmety, 'لقمتي')).toBe('يقدم لقمتي وجبات');
    // the card name already contains the other name: it is not doubled (live run, 18 Nov 2026)
    const d360 = { name: 'D360', name_aliases: ['بنك D360'], domain: 'd360.com' };
    expect(withCardName('يقدم بنك D360 خدمات، و D360 متوافق مع الشريعة.', d360, 'بنك D360')).toBe('يقدم بنك D360 خدمات، و بنك D360 متوافق مع الشريعة.');
  });
  it('uses the card name in an English card, and never touches words of the same script', () => {
    expect(withCardName('لقمتي delivers food.', lugmety, 'Lugmety')).toBe('Lugmety delivers food.');
    expect(withCardName('A food app.', { name: 'Food Co', name_aliases: ['فود'], domain: 'food.sa' }, 'Food Co')).toBe('A food app.');
  });
});
