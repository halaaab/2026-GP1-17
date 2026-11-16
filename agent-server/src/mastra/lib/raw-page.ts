// The company's own pages read directly by Darb's server (Hala, 14 and 15 Nov 2026): its homepage, Arabic page,
// About page and a linked VAT or CR certificate (PDF). Tavily's reads changed from run to run (1pass's certificate
// was read at 19:00 and failed at 21:04), and often left out a site's footer (Dinar's CR number). A page read
// directly gives the same text every run, so the same company gets the same result. Tavily now reads only what
// this could not get (validate-candidate.ts).
//   - free (no Tavily call), and only when the site's robots.txt allows it;
//   - its visible text only (scripts and styles removed), the same kind of text Tavily gives; never saved;
//   - a site that does not answer (domain not found, or a server error such as Cloudflare's 530 "origin down"),
//     twice, is "down": Shgardi's site no longer works since it closed.
// A site built entirely by JavaScript (Aajil, Bayut) has little text in its HTML: Tavily reads those.
import { extractText } from 'unpdf';

export type RawPage =
  | { status: 'ok'; url: string; text: string }
  | { status: 'down'; url: string; reason: string } // domain not found, no answer, or HTTP 5xx, twice
  | { status: 'skipped'; url: string; reason: string }; // robots.txt says no, blocked (403…), or not HTML

export type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal; redirect?: 'follow' }) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  arrayBuffer?(): Promise<ArrayBuffer>;
}>;

const AGENT = 'Mozilla/5.0 (compatible; DarbBot/1.0; university project)';
const TIMEOUT_MS = 15_000;
const MAX_TEXT = 200_000;

// robots.txt: the rules for every robot ("User-agent: *"); the longest matching rule wins, Allow on a tie.
export function robotsAllow(robots: string, path: string): boolean {
  const rules: { allow: boolean; path: string }[] = [];
  let forAll = false;
  let lastWasAgent = false;
  for (const raw of robots.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === 'user-agent') {
      forAll = (lastWasAgent && forAll) || m[2].trim() === '*';
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (forAll && m[2].trim()) rules.push({ allow: key === 'allow', path: m[2].trim() });
  }
  const matches = (rule: string) => new RegExp(`^${rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`).test(path);
  const hit = rules.filter((r) => matches(r.path)).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow))[0];
  return !hit || hit.allow;
}

// HTML to plain text: scripts, styles and tags removed, the common entities decoded. Links are kept as
// "[text](full link)", like Tavily's text, so the About page, a certificate and the app are found on it.
export function htmlToText(html: string, base?: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
      const label = inner.replace(/<[^>]+>/g, ' ').replace(/[[\]]/g, ' ').replace(/\s+/g, ' ').trim();
      if (/^(#|javascript:)/i.test(href.trim())) return ` ${label} `;
      let link = href.trim().replace(/&amp;/g, '&');
      try {
        link = new URL(link, base).toString();
      } catch {
        return ` ${label} `;
      }
      return ` [${label}](${link}) `;
    })
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&copy;/g, '©')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT);
}

const isDown = (status: number) => status >= 500;
const isPdf = (type: string, url: string) => /pdf/i.test(type) || (!type && /\.pdf($|\?)/i.test(url));

async function once(url: string, fetchFn: FetchLike): Promise<{ status: number; type: string; body: string } | { error: string }> {
  try {
    const r = await fetchFn(url, { headers: { 'User-Agent': AGENT, Accept: 'text/html,application/pdf' }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' });
    const type = r.headers.get('content-type') ?? '';
    if (r.status < 400 && isPdf(type, url) && r.arrayBuffer) {
      // A certificate PDF: its text, read by unpdf.
      const { text } = await extractText(new Uint8Array(await r.arrayBuffer()), { mergePages: true });
      return { status: r.status, type: 'application/pdf', body: text };
    }
    return { status: r.status, type, body: r.status < 400 ? await r.text() : '' };
  } catch (error) {
    const code = (error as { cause?: { code?: string } }).cause?.code ?? '';
    return { error: code === 'ENOTFOUND' ? 'domain not found' : code === 'ECONNREFUSED' ? 'connection refused' : 'no answer' };
  }
}

// robots.txt is asked once per site for 10 minutes (a company's homepage, Arabic page, About page and certificate
// are all on the same site).
const ROBOTS_FOR_MS = 10 * 60_000;
const robotsCache = new WeakMap<FetchLike, Map<string, { at: number; answer: ReturnType<typeof once> }>>();
function robotsOf(origin: string, fetchFn: FetchLike) {
  const forFetch = robotsCache.get(fetchFn) ?? new Map();
  robotsCache.set(fetchFn, forFetch);
  const kept = forFetch.get(origin);
  if (kept && Date.now() - kept.at < ROBOTS_FOR_MS) return kept.answer;
  const answer = once(`${origin}/robots.txt`, fetchFn);
  forFetch.set(origin, { at: Date.now(), answer });
  return answer;
}

// Does the site's robots.txt allow Darb to read this page? (No robots.txt, or one that cannot be read: allowed.)
export async function robotsAllowUrl(u: URL, fetchFn: FetchLike = fetch as unknown as FetchLike): Promise<boolean> {
  const robots = await robotsOf(u.origin, fetchFn);
  return !('status' in robots && robots.status === 200 && !/html/i.test(robots.type) && !robotsAllow(robots.body, u.pathname || '/'));
}

export async function readRawPage(url: string, fetchFn: FetchLike = fetch as unknown as FetchLike, waitMs = 3_000): Promise<RawPage> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { status: 'skipped', url, reason: 'not a link' };
  }
  if (!(await robotsAllowUrl(u, fetchFn))) return { status: 'skipped', url, reason: 'robots.txt does not allow it' };
  let page = await once(url, fetchFn);
  const down = (p: typeof page) => 'error' in p || isDown(p.status);
  if (down(page)) {
    await new Promise((r) => setTimeout(r, waitMs)); // a site can be down for a moment: asked again once
    page = await once(url, fetchFn);
  }
  if ('error' in page) return { status: 'down', url, reason: page.error };
  if (isDown(page.status)) return { status: 'down', url, reason: `HTTP ${page.status}` };
  if (page.status >= 400) return { status: 'skipped', url, reason: `HTTP ${page.status}` };
  if (page.type === 'application/pdf') return { status: 'ok', url, text: page.body.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT) };
  if (!/html|text/i.test(page.type)) return { status: 'skipped', url, reason: 'not a web page' };
  return { status: 'ok', url, text: htmlToText(page.body, url) };
}
