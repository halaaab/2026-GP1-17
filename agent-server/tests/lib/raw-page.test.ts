// Tests for the free reads by Darb's server: the homepage's HTML (code checks only) and the app stores.
// A fake fetch: nothing is sent.
import { describe, expect, it } from 'vitest';
import { findOwnApp, playDate, readAppFacts } from '../../src/mastra/lib/app-stores';
import { htmlToText, readRawPage, robotsAllow, type FetchLike } from '../../src/mastra/lib/raw-page';

const fake = (answers: Record<string, { status: number; body?: string; type?: string } | 'ENOTFOUND'>): FetchLike & { asked: string[] } => {
  const asked: string[] = [];
  const fn = async (url: string) => {
    asked.push(url);
    const a = answers[url] ?? { status: 404 };
    if (a === 'ENOTFOUND') throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    return { status: a.status, headers: { get: () => a.type ?? 'text/html' }, text: async () => a.body ?? '' };
  };
  return Object.assign(fn, { asked });
};

describe('robots.txt', () => {
  it('follows the rules for every robot; the longest rule wins', () => {
    const robots = 'User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /private\nAllow: /private/ok\nDisallow: /*.pdf$';
    expect(robotsAllow(robots, '/')).toBe(true);
    expect(robotsAllow(robots, '/private/x')).toBe(false);
    expect(robotsAllow(robots, '/private/ok')).toBe(true);
    expect(robotsAllow(robots, '/files/a.pdf')).toBe(false);
    expect(robotsAllow('User-agent: *\nDisallow: /', '/')).toBe(false);
  });

  it('Google Play allows app pages', () => {
    expect(robotsAllow('User-Agent: *\nAllow: /store/devices\nDisallow: /store/purchase\nDisallow: /apps', '/store/apps/details')).toBe(true);
  });
});

describe('the homepage HTML', () => {
  it('turns HTML into text, without scripts, and keeps links as [text](full link)', () => {
    const text = htmlToText('<p>تحمل سجل تجاري رقم (1010742917)</p><script>var x=1</script><footer>جميع الحقوق محفوظة &copy; 2024</footer><a href="https://apps.apple.com/sa/app/x/id1">App</a><a href="/about"><b>About</b></a><a href="#top">Top</a>', 'https://dinar.sa/');
    expect(text).toBe('تحمل سجل تجاري رقم (1010742917) جميع الحقوق محفوظة © 2024 [App](https://apps.apple.com/sa/app/x/id1) [About](https://dinar.sa/about) Top');
  });

  it('reads the page when robots.txt allows it', async () => {
    const f = fake({ 'https://dinar.sa/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /admin', type: 'text/plain' }, 'https://dinar.sa/': { status: 200, body: '<p>Dinar</p>' } });
    expect(await readRawPage('https://dinar.sa/', f, 0)).toEqual({ status: 'ok', url: 'https://dinar.sa/', text: 'Dinar' });
  });

  it('never reads a page robots.txt forbids', async () => {
    const f = fake({ 'https://x.sa/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /', type: 'text/plain' } });
    expect(await readRawPage('https://x.sa/', f, 0)).toMatchObject({ status: 'skipped', reason: 'robots.txt does not allow it' });
    expect(f.asked).toEqual(['https://x.sa/robots.txt']);
  });

  it('a server error twice (Shgardi: Cloudflare 530) or a domain that no longer exists is "down"', async () => {
    const f = fake({ 'https://shgardi.app/': { status: 530 } });
    expect(await readRawPage('https://shgardi.app/', f, 0)).toEqual({ status: 'down', url: 'https://shgardi.app/', reason: 'HTTP 530' });
    expect(f.asked.filter((u) => u === 'https://shgardi.app/')).toHaveLength(2); // asked again once
    expect(await readRawPage('https://gone.sa/', fake({ 'https://gone.sa/robots.txt': 'ENOTFOUND', 'https://gone.sa/': 'ENOTFOUND' }), 0)).toMatchObject({ status: 'down', reason: 'domain not found' });
  });

  it('a site that blocks robots (403) is not "down"', async () => {
    expect(await readRawPage('https://x.sa/', fake({ 'https://x.sa/': { status: 403 } }), 0)).toMatchObject({ status: 'skipped', reason: 'HTTP 403' });
  });
});

describe('the app stores', () => {
  it('reads Google Play’s "Updated on" date', () => {
    expect(playDate('Updated on Jun 25, 2024 Downloads')).toBe('2024-06-25');
    expect(playDate('no date')).toBeNull();
  });

  it('Apple: the Saudi store’s lookup gives the last update', async () => {
    const f = fake({ 'https://itunes.apple.com/lookup?id=1504036401&country=sa': { status: 200, body: JSON.stringify({ results: [{ trackName: 'Bayut KSA', version: '5.16.0', currentVersionReleaseDate: '2026-11-12T05:45:37Z' }] }) } });
    expect(await readAppFacts('https://apps.apple.com/sa/app/bayut-ksa-real-estate/id1504036401', f)).toMatchObject({ store: 'App Store', listed: true, updated: '2026-11-12' });
  });

  it('an app no longer in the store is "not listed"', async () => {
    const f = fake({ 'https://itunes.apple.com/lookup?id=1&country=sa': { status: 200, body: '{"results":[]}' } });
    expect(await readAppFacts('https://apps.apple.com/sa/app/x/id1', f)).toMatchObject({ listed: false });
    expect(await readAppFacts('https://play.google.com/store/apps/details?id=com.gone', fake({}))).toMatchObject({ listed: false });
  });

  it('Google Play: the app page’s date', async () => {
    const f = fake({ 'https://play.google.com/store/apps/details?id=com.tendegrees.testahel.child&hl=en&gl=SA': { status: 200, body: '<div>Updated on</div><div>Jun 25, 2024</div>' } });
    expect(await readAppFacts('https://play.google.com/store/apps/details?id=com.tendegrees.testahel.child', f)).toMatchObject({ store: 'Google Play', listed: true, updated: '2024-06-25' });
  });
});

describe("the company's own app, when its site does not link one (16 Nov 2026)", () => {
  const search = (results: object[]) => fake({ 'https://itunes.apple.com/search?term=Jahez&country=sa&entity=software&limit=10': { status: 200, body: JSON.stringify({ results }) } });
  it('takes the app whose seller website is the company domain (Jahez)', async () => {
    const f = search([{ trackId: 1, sellerUrl: 'https://other.com' }, { trackId: 2, sellerUrl: 'https://www.jahez.net/ar' }]);
    expect(await findOwnApp(['Jahez'], 'jahez.net', f)).toBe('https://apps.apple.com/sa/app/id2');
  });
  it('never takes an app on its name alone ("Cura: Natural Remedies" is not Cura)', async () => {
    const f = search([{ trackId: 3, trackName: 'Jahez fan app', sellerName: 'Jahez Fans LLC' }]);
    expect(await findOwnApp(['Jahez'], 'jahez.net', f)).toBeNull();
  });
});

