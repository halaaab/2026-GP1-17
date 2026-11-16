// Tests for Task 6, reading companies' own pages (test plan TC-6.1 to TC-6.6). Tavily is replaced by a fake,
// so nothing is sent or paid for. The live runs are done once in Studio.
import { describe, expect, it, vi } from 'vitest';
import { extractPages, findAboutLink, withoutImages, type ExtractFunction } from '../../src/mastra/lib/extract-pages';
import { CONTACT_WORDS, findAboutLink as findLink } from '../../src/mastra/lib/extract-pages';

const NOW = new Date('2026-11-13T09:00:00.000Z');
const long = (text: string) => `${text} ${'Real page text. '.repeat(20)}`;

// A fake Tavily: pages it can read, and links it reports as failed.
function fakeTavily(pages: Record<string, string>, failing: string[] = []): ExtractFunction & { calls: string[][] } {
  const calls: string[][] = [];
  const fn = vi.fn(async (urls: string[]) => {
    calls.push(urls);
    return {
      results: urls.filter((u) => pages[u] !== undefined).map((u) => ({ url: u, title: null, rawContent: pages[u] })),
      failedResults: urls.filter((u) => failing.includes(u)).map((u) => ({ url: u, error: 'Could not resolve host' })),
    };
  });
  return Object.assign(fn, { calls });
}

describe('finding the About page', () => {
  it('finds a same-site link named like "About", in English or Arabic', () => {
    expect(findAboutLink('https://1pass.app', '[Home](/) [About us](/about-us) [Blog](/blog)')).toBe('https://1pass.app/about-us');
    expect(findAboutLink('https://aajil.sa', '[من نحن](https://www.aajil.sa/ar/who)')).toBe('https://www.aajil.sa/ar/who'); // read as written
  });

  it('ignores About links on other sites', () => {
    expect(findAboutLink('https://1pass.app', '[About Tavily](https://tavily.com/about)')).toBeNull();
  });
});

describe('removing picture tags', () => {
  it('removes pictures and links left empty, keeps the words and real links', () => {
    const page = 'Gain access to 450+ Gyms\n\n![Image 47: horse shoe Shape](https://x.app/a.avif)\n\n\n\n[![Image 2: logo](https://x.app/l.svg)](https://x.app/en)\n[Plans & Pricing](https://x.app/subscription)';
    expect(withoutImages(page)).toBe('Gain access to 450+ Gyms\n\n[logo](https://x.app/en)\n[Plans & Pricing](https://x.app/subscription)');
  });

  it('keeps the link of a clickable badge: App Store, VAT certificate', () => {
    const page = '[![Image 182: apple icon](https://x/apple.svg) ![Image 183: apple text icon](https://x/t.svg)](https://apps.apple.com/sa/app/1pass/id1)\n[![Image 191: vat](https://x/vat.png)](https://x.app/vat_certificate.pdf)';
    expect(withoutImages(page)).toBe('[apple icon apple text icon](https://apps.apple.com/sa/app/1pass/id1)\n[vat](https://x.app/vat_certificate.pdf)');
  });
});

describe('Task 6: reading companies’ own pages', () => {
  it('TC-6.1: reads the homepage, then the About page, in 2 Tavily calls', async () => {
    const tavily = fakeTavily({
      'https://1pass.app': long('One subscription for 400+ gyms. [About](/about)'),
      'https://1pass.app/about': long('1pass is a Saudi company.'),
    });
    const out = await extractPages(['https://1pass.app'], tavily, NOW);
    expect(out.pages[0]).toMatchObject({ url: 'https://1pass.app', about_url: 'https://1pass.app/about', read_at: NOW.toISOString() });
    expect(out.pages[0].text).toContain('400+ gyms');
    expect(out.pages[0].about_text).toContain('Saudi company');
    expect(out.tavily_calls).toBe(2);
  });

  it('TC-6.2: a heavy page that comes back empty is in the failed list with a reason, no crash', async () => {
    const out = await extractPages(['https://www.bayut.sa/'], fakeTavily({ 'https://www.bayut.sa/': '' }), NOW);
    expect(out.failed).toEqual([{ url: 'https://bayut.sa', reason: 'blocked_or_empty' }]);
  });

  it('TC-6.3: a site that does not exist is in the failed list: not reachable', async () => {
    const out = await extractPages(['https://darb-test-nonexistent.sa'], fakeTavily({}, ['https://darb-test-nonexistent.sa']), NOW);
    expect(out.failed[0]).toMatchObject({ url: 'https://darb-test-nonexistent.sa', reason: 'not_reachable' });
  });

  it('TC-6.4: all three together: one broken link never stops the others, all homepages in one call', async () => {
    const tavily = fakeTavily({ 'https://1pass.app': long('Gyms.'), 'https://www.bayut.sa/': long('Homes.') }, ['https://darb-test-nonexistent.sa']);
    const out = await extractPages(['https://1pass.app', 'https://www.bayut.sa/', 'https://darb-test-nonexistent.sa'], tavily, NOW);
    expect(out.pages.map((p) => p.url)).toEqual(['https://1pass.app', 'https://bayut.sa']);
    expect(out.failed.map((f) => f.url)).toEqual(['https://darb-test-nonexistent.sa']);
    expect(tavily.calls).toEqual([['https://1pass.app', 'https://www.bayut.sa/', 'https://darb-test-nonexistent.sa']]); // read exactly as given
  });

  it('TC-6.5: a LinkedIn page is skipped as an excluded source and never opened', async () => {
    const tavily = fakeTavily({});
    const out = await extractPages(['https://www.linkedin.com/company/livsho/'], tavily, NOW);
    expect(out.skipped).toEqual([{ url: 'https://linkedin.com/company/livsho', reason: 'excluded_source' }]);
    expect(tavily).not.toHaveBeenCalled();
    expect(out.tavily_calls).toBe(0);
  });

  it('skips the other excluded sites too: Crunchbase, Google, HungerStation, Dealroom', async () => {
    const urls = ['https://crunchbase.com/x', 'https://maps.google.com/x', 'https://hungerstation.com/x', 'https://dealroom.co/x'];
    const out = await extractPages(urls, fakeTavily({}), NOW);
    expect(out.skipped).toHaveLength(4);
  });

  it('finds the About link even when it is in a footer beyond the 15,000 characters kept', async () => {
    const page = long('Gyms.') + 'x'.repeat(20_000) + ' [About](/about-us)';
    const tavily = fakeTavily({ 'https://1pass.app': page, 'https://1pass.app/about-us': long('About 1pass.') });
    const out = await extractPages(['https://1pass.app'], tavily, NOW);
    expect(out.pages[0].text.length).toBe(15_000);
    expect(out.pages[0].about_url).toBe('https://1pass.app/about-us');
  });

  it('TC-6.6: on a long page, the footer with its CR number is kept (start + end)', async () => {
    const page = long('One subscription for 400+ gyms.') + 'x'.repeat(30_000) + '\nFooter: CR 7012345678';
    const out = await extractPages(['https://1pass.app'], fakeTavily({ 'https://1pass.app': page }), NOW);
    expect(out.pages[0].text.length).toBe(15_000);
    expect(out.pages[0].text).toContain('400+ gyms');
    expect(out.pages[0].text).toContain('7012345678');
  });

  it('TC-6.6: a CR or VAT number in the footer stays in the page text', async () => {
    const page = long('Gyms.') + '\n\nFooter: CR 7012345678 · VAT 300123456700003';
    const out = await extractPages(['https://1pass.app'], fakeTavily({ 'https://1pass.app': page }), NOW);
    expect(out.pages[0].text).toContain('7012345678');
  });

  it('reads exactly the link given (keeps www), but names and counts the page by its cleaned link', async () => {
    const tavily = fakeTavily({ 'https://www.dinar.sa/': long('سجل تجاري رقم (1010742917)') });
    const out = await extractPages(['https://www.dinar.sa/?utm_source=x'], tavily, NOW);
    expect(tavily.calls[0]).toEqual(['https://www.dinar.sa/']);
    expect(out.pages[0].url).toBe('https://dinar.sa');
    expect(out.pages[0].text).toContain('1010742917');
  });

  it('reads each page once, even when the same link is given twice', async () => {
    const tavily = fakeTavily({ 'https://bayut.sa': long('Homes.') });
    const out = await extractPages(['https://bayut.sa', 'https://www.bayut.sa/?utm_source=ads'], tavily, NOW);
    expect(out.pages).toHaveLength(1);
    expect(tavily.calls[0]).toEqual(['https://bayut.sa']);
  });

  it('when Tavily is down or not set up, every link fails with a reason and nothing crashes', async () => {
    const down: ExtractFunction = async () => {
      throw new Error('401 Unauthorized');
    };
    const out = await extractPages(['https://1pass.app'], down, NOW);
    expect(out.failed[0]).toMatchObject({ reason: 'service_unavailable' });
    expect((await extractPages(['https://1pass.app'], null, NOW)).failed[0].reason).toBe('service_unavailable');
  });
});

describe('the Contact page link (read by code only, 16 Nov 2026)', () => {
  it('finds a Contact page in English or Arabic, on the same site only', () => {
    expect(findLink('https://foodics.com', '[Contact us](/contact) [Blog](/blog)', CONTACT_WORDS)).toBe('https://foodics.com/contact');
    expect(findLink('https://x.sa', '[تواصل معنا](https://x.sa/ar/support)', CONTACT_WORDS)).toBe('https://x.sa/ar/support');
    expect(findLink('https://x.sa', '[Contact](https://other.com/contact)', CONTACT_WORDS)).toBeNull();
  });
});

