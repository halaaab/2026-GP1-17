// Tests for the web tools' guards. Tavily, OpenAI and the database are never called.
import { afterEach, describe, expect, it } from 'vitest';
import { approvedDomainOf, domainsForSection } from '../../src/mastra/config/approved-domains';
import { recordSearchResults } from '../../src/mastra/lib/search-registry';
import { recordWebResults } from '../../src/mastra/lib/web-registry';
import { extractAndVerifyProfileTool, quoteIsAboutCompany, quoteIsOnPage } from '../../src/mastra/tools/extract-and-verify-profile';
import { finalizeCompetitorsTool } from '../../src/mastra/tools/finalize-competitors';
import { keepApproved } from '../../src/mastra/tools/web-search';

function analysisContext() {
  const values = new Map<string, unknown>();
  return { requestContext: { get: (k: string) => values.get(k), set: (k: string, v: unknown) => values.set(k, v) }, values };
}

afterEach(() => {
  delete process.env.TAVILY_API_KEY;
});

describe('approved domains', () => {
  it('accepts an approved site and its real subdomains', () => {
    expect(approvedDomainOf('https://www.wamda.com/2026/10/story')?.domain).toBe('wamda.com');
    expect(approvedDomainOf('https://sian.monshaat.gov.sa/en/startups')?.domain).toBe('sian.monshaat.gov.sa');
  });

  it('rejects lookalikes, off-list sites and "do not extract" sites', () => {
    expect(approvedDomainOf('https://wamda.com.evil.io/page')).toBeNull();
    expect(approvedDomainOf('https://notwamda.com/page')).toBeNull();
    expect(approvedDomainOf('https://example.com')).toBeNull();
    expect(approvedDomainOf('https://www.linkedin.com/company/x')).toBeNull();
    expect(approvedDomainOf('https://www.google.com/maps')).toBeNull();
  });

  it('adds sector sites only for their ISIC4 section', () => {
    const finance = domainsForSection('K').map((d) => d.domain);
    const education = domainsForSection('P').map((d) => d.domain);
    expect(finance).toContain('sama.gov.sa');
    expect(education).not.toContain('sama.gov.sa');
    expect(education).toContain('wamda.com'); // general sites are used for every idea
    expect(education).not.toContain('linkedin.com');
  });
});

describe('web_search filtering', () => {
  it('keeps approved results once each, and drops the rest', () => {
    const kept = keepApproved(
      [
        { title: 'A', url: 'https://www.wamda.com/a?utm_source=x', content: 'a' },
        { title: 'A again', url: 'https://wamda.com/a', content: 'a' },
        { title: 'Fake', url: 'https://wamda.com.evil.io/a', content: 'x' },
        { title: 'Off list', url: 'https://randomblog.net/a', content: 'x' },
      ],
      'BNPL school fees',
      new Set(),
    );
    expect(kept.map((r) => r.title)).toEqual(['A']);
    expect(kept[0]).toMatchObject({ domain: 'wamda.com', query: 'BNPL school fees' });
  });
});

describe('web_search limit', () => {
  it('refuses a third web search in the same analysis, without calling Tavily', async () => {
    const { webSearchTool } = await import('../../src/mastra/tools/web-search');
    const ctx = analysisContext();
    ctx.values.set('darb_web_search_calls', 2);
    const out: any = await webSearchTool.execute!({ queries: ['anything'] }, ctx as never);
    expect(out.results).toEqual([]);
    expect(out.message).toMatch(/already searched 2 times/);
  });
});

describe('extract_and_verify_profile guards', () => {
  it('checks a quote is really on the page, ignoring spacing and case', () => {
    const page = 'Welcome.  Tamara is a  Saudi buy-now-pay-later company that lets shoppers split payments.\nMore text.';
    expect(quoteIsOnPage('Tamara is a Saudi Buy-Now-Pay-Later company that lets shoppers split payments.', page)).toBe(true);
    expect(quoteIsOnPage('Tamara is the largest fintech in the Middle East with 20 million users.', page)).toBe(false);
    expect(quoteIsOnPage('Tamara', page)).toBe(false); // too short to show what a company does
  });

  it('accepts a sentence only when it is about that company', () => {
    const page =
      'Tracxn. AI-powered market intelligence across companies, investors, and sectors. ' +
      'Verisart. Verisart issues blockchain certificates of authenticity for artworks and collectibles. ' +
      'Startbahn. A platform that records the provenance of artworks for artists and galleries.';
    const names = ['Tracxn', 'Verisart', 'Startbahn'];
    const tagline = 'AI-powered market intelligence across companies, investors, and sectors.';
    const startbahn = 'A platform that records the provenance of artworks for artists and galleries.';
    expect(quoteIsAboutCompany(tagline, 'Verisart', page, names)).toBe(false); // the site's tagline, about no company
    expect(quoteIsAboutCompany('Verisart issues blockchain certificates of authenticity for artworks and collectibles.', 'Verisart', page, names)).toBe(true);
    expect(quoteIsAboutCompany(startbahn, 'Startbahn', page, names)).toBe(true); // its name comes just before
    expect(quoteIsAboutCompany(startbahn, 'Verisart', page, names)).toBe(false); // a neighbour's description
  });

  it('refuses to open a page that web_search did not return', async () => {
    const ctx = analysisContext();
    const out: any = await extractAndVerifyProfileTool.execute!({ url: 'https://wamda.com/invented-page' }, ctx as never);
    expect(out.status).toBe('not_from_search');
  });

  it('opens at most the allowed number of pages per analysis', async () => {
    const ctx = analysisContext();
    recordWebResults(ctx, [
      { title: 't', url: 'https://wamda.com/a', snippet: 's', domain: 'wamda.com', method: 'snippet', query: 'q' },
    ]);
    ctx.values.set('darb_pages_opened', 4);
    const out: any = await extractAndVerifyProfileTool.execute!({ url: 'https://wamda.com/a' }, ctx as never);
    expect(out.status).toBe('page_limit');
  });
});

describe('the 0.50 web rule', () => {
  const weak = { startup_id: 'ST_1', name: 'A', name_ar: null, description: 'd', sector: null, region: null, stage: null, website: null, similarity: 0.45, source: 'dataset' as const };

  it('will not finish before the web is searched when the dataset is weak', async () => {
    process.env.TAVILY_API_KEY = 'test';
    const ctx = analysisContext();
    recordSearchResults(ctx, [weak]);
    await expect(finalizeCompetitorsTool.execute!({ startup_ids: ['ST_1'] }, { ...ctx, agent: {} } as never)).rejects.toThrow(/search the web first/);
  });

  it('finishes once the web was searched, even if it found nothing', async () => {
    process.env.TAVILY_API_KEY = 'test';
    const ctx = analysisContext();
    recordSearchResults(ctx, [weak]);
    recordWebResults(ctx, []);
    const out: any = await finalizeCompetitorsTool.execute!({ startup_ids: ['ST_1'] }, { ...ctx, agent: {} } as never);
    expect(out.status).toBe('ok'); // a preview: no assessment in this test, so nothing is saved
  });
});
