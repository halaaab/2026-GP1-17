// Task 6: reads the homepage and the About page of companies' own websites, with Tavily Extract.
// Only the targeted pages are read.
//
//   1. Links on excluded sites (config/excluded-sources.ts) are never opened: "skipped".
//   2. Repeats are removed, so no page is paid for twice. The page read is exactly the link given (only tracking
// parts removed): "www.dinar.sa" and "dinar.sa" can serve different pages. The cleaned link
//      (Task 7: no "www.") is used only to recognise the same page twice, and as the page's name in the output.
//   3. One Tavily request reads all the homepages together (one call per 20 links), in "advanced" mode.
//   4. In each homepage, a link on the same site named like an About page is found; one more request reads
//      all the About pages together. So a batch of up to 20 companies costs at most 2 Tavily calls.
//   5. Each link gets its own result: read, failed (with the reason) or skipped. One broken link never
// stops the others. Page text is used during the run only: it is never saved (Tavily terms).
import { tavily } from '@tavily/core';
import { isExcludedSite } from '../config/excluded-sources';
import { cleanLink, siteOf } from './identify-candidates';

// Most characters kept from one page, so one huge page cannot crowd out the rest.
export const MAX_PAGE_CHARS = 15_000;
// For a longer page: the start (what the company does) and the end (the footer: CR or VAT number, address,
// phone) are kept, so a footer number still reaches Task 8.
const FOOTER_CHARS = 3_000;
const GAP = '\n\n[…]\n\n';

// Picture tags carry no information ("![Image 47: horse shoe Shape](https://…avif)"), so they are removed before
// a page is cut, leaving room for more real text. A picture that is a link keeps its link
// (an App Store badge, a VAT certificate), because the link itself is evidence for the validity checks (Task 8).
// Empty links and runs of blank lines are removed too.
export function withoutImages(text: string): string {
  return text
    // A picture that is a link (a badge you click) keeps its link, with the picture's words:
    // "[![Image 191: vat](…png)](…vat_certificate.pdf)" → "[vat](…vat_certificate.pdf)". Those links are evidence.
    .replace(/\[((?:\s*!\[[^\]]*\]\([^)]*\))+)\s*\]\(([^)]*)\)/g, (_all, pictures: string, link: string) => {
      const words = [...pictures.matchAll(/!\[([^\]]*)\]/g)].map((m) => m[1].replace(/^Image \d+:\s*/i, '').trim()).filter(Boolean);
      return `[${[...new Set(words)].join(' ') || 'link'}](${link})`;
    })
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\s*\]\([^)]*\)/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function keepStartAndEnd(text: string): string {
  if (text.length <= MAX_PAGE_CHARS) return text;
  return text.slice(0, MAX_PAGE_CHARS - FOOTER_CHARS - GAP.length) + GAP + text.slice(-FOOTER_CHARS);
}
// Tavily Extract reads at most 20 links per request.
const LINKS_PER_REQUEST = 20;
// A page with less text than this is treated as blocked or empty (a login wall, a script-only page).
const MIN_PAGE_CHARS = 200;

export type ReadPage = {
  url: string;
  title: string | null;
  text: string;
  about_url: string | null;
  about_text: string | null;
  read_at: string;
};
export type FailedPage = { url: string; reason: 'not_reachable' | 'blocked_or_empty' | 'not_a_link' | 'service_unavailable'; detail?: string };
export type SkippedPage = { url: string; reason: 'excluded_source' };
export type ExtractOutput = { pages: ReadPage[]; failed: FailedPage[]; skipped: SkippedPage[]; tavily_calls: number };

// What Darb needs from Tavily Extract. Tests pass a fake one.
export type ExtractFunction = (
  urls: string[],
) => Promise<{ results: { url: string; title: string | null; rawContent: string }[]; failedResults: { url: string; error: string }[] }>;

export function tavilyExtract(): ExtractFunction {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error('TAVILY_API_KEY must be set in .env');
  const client = tavily({ apiKey });
  // Always "advanced": it runs the page's scripts like a browser. "basic" saw nothing
  // on script-built sites such as 1pass.app, and retrying would use more of the 15 Tavily calls per idea.
  return (urls) => client.extract(urls, { extractDepth: 'advanced', format: 'markdown', timeout: 30 });
}

// Names an About page goes by, in its link text or its address.
const ABOUT_WORDS = /\babout\b|about-?us|who-?we-?are|our-?story|من نحن|عن الشركة|نبذة عن/i;

// The link as it is read: exactly as given, minus tracking parts (utm_…) and the "#…" part. Unlike cleanLink, it keeps
// "www." and the address's case, because some sites serve a different page without them.
export function readableLink(url: string): string | null {
  const clean = cleanLink(url);
  if (!clean) return null;
  const link = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
  const kept = new URL(clean);
  link.search = kept.search;
  link.hash = '';
  // A bare site keeps the form it was given in: "https://1pass.app" stays without a final "/".
  const given = url.trim().split(/[?#]/)[0];
  const text = link.toString();
  return !given.endsWith('/') && text.endsWith('/') && link.pathname === '/' && !link.search ? text.slice(0, -1) : text;
}

// Names a Contact page goes by: big companies keep their email, phone and address there.
export const CONTACT_WORDS = /\bcontact\b|contact-?us|تواصل معنا|اتصل بنا|اتصل|تواصل/i;

// The About page of a homepage: a link on the same site whose text or address looks like "About".
export function findAboutLink(homepageUrl: string, markdown: string, words: RegExp = ABOUT_WORDS): string | null {
  const site = siteOf(homepageUrl);
  for (const [, label, target] of markdown.matchAll(/\[([^\]]{0,80})\]\(([^)\s]+)/g)) {
    let link: string;
    try {
      link = new URL(target, homepageUrl).toString();
    } catch {
      continue;
    }
    if (siteOf(link) !== site || cleanLink(link) === cleanLink(homepageUrl)) continue;
    if (words.test(label) || words.test(new URL(link).pathname)) return readableLink(link);
  }
  return null;
}

const chunks = <T>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

// Reads a list of links (as given) in as few Tavily requests as possible. What was read and what failed is
// returned under each link's cleaned form, so it can be matched however the link was written.
async function readAll(links: string[], extract: ExtractFunction) {
  const read = new Map<string, { title: string | null; text: string; aboutLink: string | null }>();
  const failed = new Map<string, FailedPage>();
  let calls = 0;
  for (const batch of chunks(links, LINKS_PER_REQUEST)) {
    calls++;
    try {
      const answer = await extract(batch);
      for (const r of answer.results) {
        const key = cleanLink(r.url) ?? r.url;
        const text = (r.rawContent ?? '').trim();
        if (text.length < MIN_PAGE_CHARS) failed.set(key, { url: key, reason: 'blocked_or_empty' });
        // The About link is looked for in the whole, original page (it is often in the footer); then picture tags
        // are removed and the page is cut.
        else read.set(key, { title: r.title ?? null, text: keepStartAndEnd(withoutImages(text)), aboutLink: findAboutLink(key, text) });
      }
      for (const f of answer.failedResults) {
        const key = cleanLink(f.url) ?? f.url;
        failed.set(key, { url: key, reason: 'not_reachable', detail: f.error });
      }
    } catch (error) {
      for (const link of batch) {
        const key = cleanLink(link) ?? link;
        failed.set(key, { url: key, reason: 'service_unavailable', detail: (error as Error).message });
      }
    }
    // A link Tavily neither read nor reported: treated as not reachable.
    for (const link of batch) {
      const key = cleanLink(link) ?? link;
      if (!read.has(key) && !failed.has(key)) failed.set(key, { url: key, reason: 'not_reachable' });
    }
  }
  return { read, failed, calls };
}

// options.about = false reads only the links given, without their About pages (Task 8 uses it for App Store pages).
export async function extractPages(urls: string[], extract: ExtractFunction | null, now = new Date(), options: { about?: boolean } = {}): Promise<ExtractOutput> {
  const skipped: SkippedPage[] = [];
  const failed: FailedPage[] = [];
  const links: string[] = []; // each page's cleaned link (its name)
  const toRead = new Map<string, string>(); // cleaned link → the link exactly as it is read

  // 1 and 2. Excluded sites are skipped; repeats are removed; each page is read as given.
  for (const url of urls) {
    const link = cleanLink(url);
    const readable = readableLink(url);
    const site = link ? siteOf(link) : null;
    if (!link || !readable || !site) failed.push({ url, reason: 'not_a_link' });
    else if (isExcludedSite(site)) skipped.push({ url: link, reason: 'excluded_source' });
    else if (!links.includes(link)) {
      links.push(link);
      toRead.set(link, readable);
    }
  }
  if (links.length === 0) return { pages: [], failed, skipped, tavily_calls: 0 };
  if (!extract) {
    for (const link of links) failed.push({ url: link, reason: 'service_unavailable', detail: 'Tavily is not set up.' });
    return { pages: [], failed, skipped, tavily_calls: 0 };
  }

  // 3. The homepages.
  const home = await readAll(links.map((l) => toRead.get(l)!), extract);

  // 4. The About pages found in them.
  const aboutOf = new Map<string, string>();
  if (options.about !== false) for (const [link, page] of home.read) if (page.aboutLink) aboutOf.set(link, page.aboutLink);
  const about = aboutOf.size ? await readAll([...new Set(aboutOf.values())], extract) : { read: new Map(), failed: new Map(), calls: 0 };

  // 5. One result per link.
  const pages: ReadPage[] = [];
  for (const link of links) {
    const page = home.read.get(link);
    if (!page) {
      failed.push(home.failed.get(link) ?? { url: link, reason: 'not_reachable' });
      continue;
    }
    const aboutUrl = aboutOf.get(link) ?? null;
    const aboutKey = aboutUrl ? cleanLink(aboutUrl) : null;
    const aboutPage = aboutKey ? about.read.get(aboutKey) : undefined;
    pages.push({
      url: link,
      title: page.title,
      text: page.text,
      about_url: aboutPage ? aboutKey : null,
      about_text: aboutPage?.text ?? null,
      read_at: now.toISOString(),
    });
  }
  return { pages, failed, skipped, tavily_calls: home.calls + about.calls };
}
