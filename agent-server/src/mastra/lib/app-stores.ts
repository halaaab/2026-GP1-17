// The company's app, read by code (Hala, 14 Nov 2026): is it listed, and when was it last updated?
// Tavily gives App Store and Google Play pages without their dates (Apple's version history has none in its text,
// and a Google Play page comes back as headings only), and the AI missed "Install" and "Updated on" (Testahel,
// PureGym KSA). So code reads them from the stores directly, for free:
//   - Apple: its public lookup service (itunes.apple.com/lookup, Saudi store), which gives the latest version date.
//   - Google Play: the app's page (allowed by play.google.com/robots.txt), whose "Updated on" date is in its HTML.
// A listed app = the product can be downloaded now (Real offering). Its last update = a date for Active.
import { htmlToText, type FetchLike } from './raw-page';

// text: the app's own words in the store (its description, release notes, seller), read like a page (15 Nov 2026).
// seller: the App Store's seller name. For a company's developer account, Apple shows the legal entity's name there,
// after checking it through its D-U-N-S number (Dun & Bradstreet); no trade names, DBAs or branches. A one-person
// account shows the person's own name (developer.apple.com/support/enrollment, /support/D-U-N-S). Used for Real entity
// in lib/validate-candidate.ts (sellerIsTheCompany).
export type AppFacts = { store: 'App Store' | 'Google Play'; listed: boolean; updated: string | null; quote: string; url: string; text?: string; seller?: string };

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

// "Jun 25, 2024" → "2024-06-25".
export function playDate(text: string): string | null {
  const m = text.match(/Updated on\s+([A-Z][a-z]{2})[a-z]*\.? (\d{1,2}), (\d{4})/);
  if (!m || !MONTHS[m[1].toLowerCase()]) return null;
  return `${m[3]}-${MONTHS[m[1].toLowerCase()]}-${m[2].padStart(2, '0')}`;
}

export async function readAppFacts(url: string, fetchFn: FetchLike = fetch as unknown as FetchLike): Promise<AppFacts | null> {
  const get = async (link: string) => {
    try {
      const r = await fetchFn(link, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DarbBot/1.0; university project)' }, signal: AbortSignal.timeout(15_000), redirect: 'follow' });
      return { status: r.status, body: r.status < 400 ? await r.text() : '' };
    } catch {
      return null;
    }
  };
  const apple = url.match(/apps\.apple\.com\/.*\/id(\d+)/i);
  if (apple) {
    const r = await get(`https://itunes.apple.com/lookup?id=${apple[1]}&country=sa`);
    if (!r || r.status !== 200) return null;
    type Apple = { trackName?: string; version?: string; currentVersionReleaseDate?: string; sellerName?: string; description?: string; releaseNotes?: string };
    const app = (JSON.parse(r.body) as { results?: Apple[] }).results?.[0];
    if (!app) return { store: 'App Store', listed: false, updated: null, quote: 'not found in the Saudi App Store', url };
    const text = [app.trackName, app.sellerName && `Seller: ${app.sellerName}`, app.description, app.releaseNotes && `What's New: ${app.releaseNotes}`].filter(Boolean).join('\n');
    return { store: 'App Store', listed: true, updated: app.currentVersionReleaseDate?.slice(0, 10) ?? null, quote: `${app.trackName ?? 'app'} version ${app.version ?? '?'}, released ${app.currentVersionReleaseDate?.slice(0, 10) ?? '?'}`, url, text, seller: app.sellerName?.trim() || undefined };
  }
  const play = url.match(/play\.google\.com\/store\/apps\/details\?id=([\w.]+)/i);
  if (play) {
    const r = await get(`https://play.google.com/store/apps/details?id=${play[1]}&hl=en&gl=SA`);
    if (!r) return null;
    if (r.status === 404) return { store: 'Google Play', listed: false, updated: null, quote: 'not found on Google Play', url };
    if (r.status !== 200) return null;
    const updated = playDate(r.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')); // the whole page, not cut
    return { store: 'Google Play', listed: true, updated, quote: updated ? `Updated on ${updated}` : 'listed on Google Play', url, text: htmlToText(r.body, url) };
  }
  return null;
}
