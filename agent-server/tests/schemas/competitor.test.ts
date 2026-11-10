// Tests for the Competitor Agent's contracts: a valid sample of every schema passes, and each broken sample fails.
import { describe, expect, it } from 'vitest';
import { Candidate, Handoff, IdeaProfile, JudgeOutput, Result } from '../../src/mastra/schemas/competitor';

const ASSESSMENT = '11111111-1111-4111-8111-111111111111';
const IDEA = '22222222-2222-4222-8222-222222222222';
const NOW = '2026-11-10T09:00:00.000Z';

// ---------------------------------------------------------------------------
// Valid samples
// ---------------------------------------------------------------------------

const handoff = {
  assessment_id: ASSESSMENT,
  idea_id: IDEA,
  mode: 'new',
  language: 'en',
  idea_text: 'An app that lets restaurants order fresh vegetables from local farms, like Talabat for suppliers.',
  known_facts: { customer: 'restaurants', offering: 'ordering app for fresh vegetables' },
  founder_startup: { name: 'Mazra', website: 'mazra.sa' },
  named_competitors: ['Sary'],
  references: ['Talabat'],
  clarification: { question: 'Who pays for the app?', answer: 'The restaurants pay a monthly fee.' },
};

const profile = {
  problem: { value: 'Restaurants struggle to buy fresh vegetables reliably.', origin: 'inferred' },
  customer: { value: 'Restaurants', origin: 'stated' },
  offering: { value: 'An ordering app connecting restaurants with local farms.', origin: 'stated' },
  market: { value: null, origin: 'unknown' },
  sector: { isic_section: 'G', isic_division: '46' },
  business_model: 'Monthly subscription',
  keywords_en: ['restaurant supply', 'fresh produce', 'B2B ordering'],
  keywords_ar: ['توريد المطاعم', 'خضروات طازجة'],
};

const source = { url: 'https://example.sa/about', source_type: 'official_site', accessed_at: NOW };

const candidate = {
  candidate_key: 'corpus:ESA-0042',
  source_type: 'corpus',
  startup_id: 'ESA-0042',
  name: 'Sary',
  name_aliases: ['ساري'],
  website: 'https://sary.sa',
  domain: 'sary.sa',
  evidence_text: 'Sary is a B2B marketplace for businesses to order supplies.',
  sources: [source],
  validation: {
    real_entity: 'pass',
    real_offering: 'pass',
    active: 'pass',
    saudi_reach: 'pass',
    evidence_status: 'confirmed',
    checked_at: NOW,
  },
};

const judge = {
  candidate_key: 'corpus:ESA-0042',
  is_company: true,
  problem: { answer: 'same', note: 'Both solve restaurant supply ordering.', source_url: 'https://sary.sa' },
  customer: { answer: 'partly', note: 'Sary serves all small businesses.' },
  offering: { answer: 'same', note: 'Both are ordering apps.' },
  label: 'direct',
  reason: 'Sary already lets restaurants order supplies through an app.',
};

const competitor = {
  rank: 1,
  name: 'Sary',
  website: 'https://sary.sa',
  description: 'A B2B ordering app for shop and restaurant supplies.',
  city_region: 'Riyadh',
  source_type: 'corpus',
  startup_id: 'ESA-0042',
  label: 'direct',
  evidence_status: 'confirmed',
  reason: 'Sary already lets restaurants order supplies through an app.',
  comparison: {
    problem: { answer: 'same', note: 'Supply ordering.' },
    customer: { answer: 'partly', note: 'Wider customer group.' },
    offering: { answer: 'same', note: 'Ordering app.' },
  },
  sources: [source],
  similarity_score: 75,
};

const result = {
  status: 'complete',
  idea_profile: profile,
  competitors: [competitor],
  iss: 75,
  iss_basis: 'full',
  market_level: 'open',
  notes: ['fewer_than_three'],
  usage: { tavily_calls: 3, duration_ms: 12000, trace_id: 'trace-abc' },
};

// The skeleton's answer while the capabilities are not built yet.
const pendingResult = {
  status: 'complete',
  idea_profile: profile,
  competitors: [],
  iss: null,
  iss_basis: null,
  market_level: null,
  notes: ['capability_pending'],
  usage: { tavily_calls: 0, duration_ms: 5, trace_id: null },
};

// A copy of a sample with some fields changed (or removed, when set to undefined).
function changed<T extends object>(base: T, changes: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = structuredClone(base) as Record<string, unknown>;
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) delete copy[key];
    else copy[key] = value;
  }
  return copy;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Handoff', () => {
  it('accepts a full handoff and a minimal one', () => {
    expect(Handoff.safeParse(handoff).success).toBe(true);
    const minimal = { assessment_id: ASSESSMENT, idea_id: IDEA, mode: 'rerun', language: 'ar', idea_text: 'تطبيق لطلب الخضار للمطاعم' };
    expect(Handoff.safeParse(minimal).success).toBe(true);
  });

  it.each([
    ['a missing assessment_id', { assessment_id: undefined }],
    ['an idea_id that is not a uuid', { idea_id: '42' }],
    ['an unknown mode', { mode: 'retry' }],
    ['an unknown language', { language: 'fr' }],
    ['an empty idea', { idea_text: '   ' }],
    ['a guessed field in known_facts', { known_facts: { sector: 'Retail' } }],
    ['named_competitors that is not a list', { named_competitors: 'Sary' }],
    ['a clarification with no answer', { clarification: { question: 'Who pays?' } }],
    ['an extra field', { similarity_threshold: 0.5 }],
  ])('rejects %s', (_name, change) => {
    expect(Handoff.safeParse(changed(handoff, change)).success).toBe(false);
  });
});

describe('IdeaProfile', () => {
  it('accepts a profile with stated, inferred and unknown parts', () => {
    expect(IdeaProfile.safeParse(profile).success).toBe(true);
  });

  it.each([
    ['an unknown part with a value', { market: { value: 'Riyadh', origin: 'unknown' } }],
    ['a stated part with no value', { customer: { value: null, origin: 'stated' } }],
    ['an unknown origin', { problem: { value: 'x', origin: 'guessed' } }],
    ['a sector that is not an ISIC4 section', { sector: { isic_section: 'Z', isic_division: '46' } }],
    ['a division that is not 2 digits', { sector: { isic_section: 'G', isic_division: '4' } }],
    ['missing Arabic keywords', { keywords_ar: undefined }],
  ])('rejects %s', (_name, change) => {
    expect(IdeaProfile.safeParse(changed(profile, change)).success).toBe(false);
  });
});

describe('Candidate', () => {
  it('accepts a validated corpus candidate and an unvalidated web candidate', () => {
    expect(Candidate.safeParse(candidate).success).toBe(true);
    const web = changed(candidate, { candidate_key: 'web:foodbox.sa', source_type: 'web', startup_id: null, validation: undefined });
    expect(Candidate.safeParse(web).success).toBe(true);
  });

  it.each([
    ['a corpus candidate with no startup_id', { startup_id: null }],
    ['an unknown source type', { source_type: 'database' }],
    ['a source with a bad url', { sources: [{ ...source, url: 'not a url' }] }],
    ['a source of an unknown type', { sources: [{ ...source, source_type: 'blog' }] }],
    ['a check outcome that is not pass, fail or unknown', { validation: { ...candidate.validation, active: 'yes' } }],
    ['a validation with no date', { validation: { ...candidate.validation, checked_at: undefined } }],
  ])('rejects %s', (_name, change) => {
    expect(Candidate.safeParse(changed(candidate, change)).success).toBe(false);
  });
});

describe('JudgeOutput', () => {
  it('accepts a judge answer', () => {
    expect(JudgeOutput.safeParse(judge).success).toBe(true);
  });

  it.each([
    ['an unknown answer', { problem: { answer: 'similar', note: '' } }],
    ['an unknown label', { label: 'competitor' }],
    ['is_company as text', { is_company: 'yes' }],
    ['an empty reason', { reason: '' }],
    ['a number the judge should never write', { similarity_score: 80 }],
  ])('rejects %s', (_name, change) => {
    expect(JudgeOutput.safeParse(changed(judge, change)).success).toBe(false);
  });
});

describe('Result', () => {
  it('accepts a complete result, the skeleton result and a clarification request', () => {
    expect(Result.safeParse(result).success).toBe(true);
    expect(Result.safeParse(pendingResult).success).toBe(true);
    const clarify = changed(pendingResult, {
      status: 'needs_clarification',
      clarification: { question: 'What does your product do?', missing_field: 'offering' },
      notes: [],
    });
    expect(Result.safeParse(clarify).success).toBe(true);
  });

  it.each([
    ['more than three competitors', { competitors: [1, 2, 3, 4].map((rank) => ({ ...competitor, rank: Math.min(rank, 3) })) }],
    ['ranks out of order', { competitors: [{ ...competitor, rank: 2 }] }],
    ['a not_competitor label', { competitors: [{ ...competitor, label: 'not_competitor' }] }],
    ['an unconfirmed competitor', { competitors: [{ ...competitor, evidence_status: 'unconfirmed' }] }],
    ['a competitor with no source', { competitors: [{ ...competitor, sources: [] }] }],
    ['a corpus competitor with no startup_id', { competitors: [{ ...competitor, startup_id: undefined }] }],
    ['a score above 100', { competitors: [{ ...competitor, similarity_score: 101 }] }],
    ['an ISS that is not a whole number', { iss: 74.5 }],
    ['an ISS with nothing found', { competitors: [] }],
    ['an ISS with no basis', { iss_basis: null }],
    ['a note written as a sentence', { notes: ['No web results.'] }],
    ['the same note twice', { notes: ['only_indirect', 'only_indirect'] }],
    ['needs_clarification with no question', { status: 'needs_clarification' }],
    ['a question when the status is complete', { clarification: { question: 'Who pays?', missing_field: 'problem' } }],
    ['more Tavily calls than the cap', { usage: { tavily_calls: 16, duration_ms: 1, trace_id: null } }],
    ['an unknown market level', { market_level: 'busy' }],
  ])('rejects %s', (_name, change) => {
    expect(Result.safeParse(changed(result, change)).success).toBe(false);
  });
});
