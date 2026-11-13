// Tests for Task 7, turning search results into a clean list of companies (test plan TC-7.1 to TC-7.9).
// Hand-made inputs only: no network, no database.
import { describe, expect, it } from 'vitest';
import { cleanLink, cleanName, identifyCandidates, type RawResult } from '../../src/mastra/lib/identify-candidates';
import { Candidate } from '../../src/mastra/schemas/competitor';

const NOW = new Date('2026-11-13T09:00:00.000Z');
const run = (results: RawResult[], context = {}) => identifyCandidates(results, context, NOW);
const names = (out: ReturnType<typeof run>) => out.candidates.map((c) => c.name).sort();

describe('cleaning links and names', () => {
  it('drops www, tracking parts and case', () => {
    expect(cleanLink('https://www.Bayut.sa/?utm_source=ads')).toBe('https://bayut.sa');
    expect(cleanLink('bayut.sa')).toBe('https://bayut.sa');
  });

  it('drops legal words in both languages and unifies Arabic letters', () => {
    expect(cleanName('1pass Co.')).toBe('1pass');
    expect(cleanName('شركة جاهز الدولية للتقنية')).toBe(cleanName('جاهز الدوليه'));
    expect(cleanName('Aajil LLC')).toBe('aajil');
  });
});

describe('Task 7: a clean list of companies', () => {
  it('TC-7.1: a "Top 10" article on a news site is removed', () => {
    const out = run([{ source_type: 'web', url: 'https://www.wamda.com/2026/10/top-10-saudi-food-startups', title: 'Top 10 Saudi food startups' }]);
    expect(out.candidates).toEqual([]);
    expect(out.removed[0].reason).toBe('article_or_list');
  });

  it('TC-7.2: "Jahez" and "جاهز" on jahez.net become one company, both names kept', () => {
    const out = run([
      { source_type: 'web', name: 'Jahez', url: 'https://jahez.net' },
      { source_type: 'web', name: 'جاهز', url: 'https://www.jahez.net/ar' },
    ]);
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]).toMatchObject({ name: 'Jahez', name_aliases: ['جاهز'], domain: 'jahez.net' });
  });

  it('TC-7.3: 1pass from 1pass.app and from its Saudi App Store page become one company', () => {
    const out = run([
      { source_type: 'web', name: '1pass', url: 'https://1pass.app' },
      { source_type: 'web', name: '1pass', url: 'https://apps.apple.com/sa/app/1pass/id123' },
    ]);
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0].sources.map((s) => s.source_type)).toEqual(['official_site', 'app_store']);
  });

  it('TC-7.4: the founder’s own startup never appears', () => {
    const out = run(
      [
        { source_type: 'corpus', startup_id: 'ST_073', name: '1pass', url: 'https://1pass.app/#home' },
        { source_type: 'web', name: '1pass', url: 'https://apps.apple.com/sa/app/1pass/id123' },
      ],
      { founder_startup: { name: '1pass' } },
    );
    expect(out.candidates).toEqual([]);
    expect(out.removed.map((r) => r.reason)).toEqual(['founder_startup', 'founder_startup']);
  });

  it('TC-7.5: Barq on barq.com and Barq on web.barqfleet.com stay two companies', () => {
    const out = run([
      { source_type: 'corpus', startup_id: 'ST_030', name: 'Barq', url: 'https://barq.com/' },
      { source_type: 'corpus', startup_id: 'ST_202', name: 'Barq', url: 'https://web.barqfleet.com/' },
    ]);
    expect(out.candidates.map((c) => c.candidate_key).sort()).toEqual(['corpus:ST_030', 'corpus:ST_202']);
  });

  it('TC-7.5 (also): an app store page named "Barq" is not merged by guess when two Barqs exist', () => {
    const out = run([
      { source_type: 'web', name: 'Barq', url: 'https://barq.com' },
      { source_type: 'web', name: 'Barq', url: 'https://web.barqfleet.com' },
      { source_type: 'web', name: 'Barq', url: 'https://apps.apple.com/sa/app/barq/id9' },
    ]);
    expect(out.candidates).toHaveLength(3);
  });

  it('TC-7.6: tracking parts and "www" are ignored: one company', () => {
    const out = run([
      { source_type: 'web', name: 'Bayut', url: 'https://www.bayut.sa/?utm_source=ads' },
      { source_type: 'web', name: 'Bayut', url: 'https://bayut.sa' },
    ]);
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0].sources).toHaveLength(1);
  });

  it('TC-7.7: "شركة ون باس للتقنية" on 1pass.app is merged with 1pass', () => {
    const out = run([
      { source_type: 'corpus', startup_id: 'ST_073', name: '1pass', url: 'https://1pass.app/#home' },
      { source_type: 'web', name: 'شركة ون باس للتقنية', url: 'https://www.1pass.app/about' },
    ]);
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]).toMatchObject({ candidate_key: 'corpus:ST_073', name: '1pass', name_aliases: ['شركة ون باس للتقنية'] });
  });

  it('TC-7.8: a government page listing startups is not a company, but kept as evidence', () => {
    const out = run([{ source_type: 'web', url: 'https://www.monshaat.gov.sa/startups', title: 'Startups supported by Monshaat' }]);
    expect(out.candidates).toEqual([]);
    expect(out.evidence).toEqual([{ url: 'https://monshaat.gov.sa/startups', domain: 'monshaat.gov.sa', kind: 'government', title: 'Startups supported by Monshaat' }]);
  });

  it('TC-7.9: a normal company page is kept and passes the candidate format check', () => {
    const out = run([{ source_type: 'web', name: 'Aajil', url: 'https://aajil.sa', text: 'Buy your business materials now and pay later.' }]);
    expect(out.candidates).toHaveLength(1);
    expect(Candidate.safeParse(out.candidates[0]).success).toBe(true);
    expect(out.candidates[0]).toMatchObject({ candidate_key: 'web:aajil.sa', website: 'https://aajil.sa', domain: 'aajil.sa' });
  });

  it('removes companies the founder used as an analogy ("like Talabat")', () => {
    const out = run([{ source_type: 'web', name: 'Talabat', url: 'https://talabat.com' }], { references: ['Talabat'] });
    expect(out.candidates).toEqual([]);
    expect(out.removed[0].reason).toBe('reference');
  });

  it('the example from the logic page: 9 results → Jahez, two Barqs, Aajil', () => {
    const out = run(
      [
        { source_type: 'web', url: 'https://wamda.com/top-10', title: 'Top 10 Saudi food startups' },
        { source_type: 'web', name: 'Jahez', url: 'https://jahez.net' },
        { source_type: 'web', name: 'جاهز', url: 'https://jahez.net/ar' },
        { source_type: 'corpus', startup_id: 'ST_073', name: '1pass', url: 'https://1pass.app' },
        { source_type: 'web', name: '1pass', url: 'https://apps.apple.com/sa/app/1pass/id1' },
        { source_type: 'corpus', startup_id: 'ST_030', name: 'Barq', url: 'https://barq.com' },
        { source_type: 'corpus', startup_id: 'ST_202', name: 'Barq', url: 'https://web.barqfleet.com' },
        { source_type: 'web', url: 'https://monshaat.gov.sa/startups', title: 'Startups list' },
        { source_type: 'web', name: 'Aajil', url: 'https://aajil.sa' },
      ],
      { founder_startup: { name: '1pass' } },
    );
    expect(names(out)).toEqual(['Aajil', 'Barq', 'Barq', 'Jahez']);
    expect(out.removed.map((r) => r.reason).sort()).toEqual(['article_or_list', 'founder_startup', 'founder_startup']);
    expect(out.evidence).toHaveLength(1);
    for (const c of out.candidates) expect(Candidate.safeParse(c).success).toBe(true);
  });
});
