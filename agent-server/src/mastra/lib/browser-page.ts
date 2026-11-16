// A company's page opened in a real browser on Darb's server (Hala, 15 Nov 2026), for sites built by JavaScript.
// Some sites send an almost empty page and build everything in the visitor's browser: Aajil's footer
// ("© 2026 Aajil") and its legal name are never in its HTML, and Tavily returns one sentence. Here Chromium
// (Playwright) opens the page like a visitor, waits for it to load, and Darb reads the finished page's text.
//   - only for pages that Darb's plain read could not use (almost no text, or a server error such as 503);
//   - free (no Tavily call), and only when the site's robots.txt allows it;
//   - the same kind of text as the plain read (htmlToText), never saved;
//   - one browser for the whole run, closed after a minute without use (or by closeBrowser at the end of a script).
import type { Browser } from 'playwright';
import { htmlToText, robotsAllowUrl, type RawPage } from './raw-page';

const AGENT = 'Mozilla/5.0 (compatible; DarbBot/1.0; university project)';
const LOAD_MS = 20_000;
const SETTLE_MS = 1_500; // after the page loads, a moment for its scripts to fill in the footer
const IDLE_MS = 60_000;

let browser: Promise<Browser> | null = null;
let idle: NodeJS.Timeout | null = null;

async function open(): Promise<Browser> {
  if (!browser) browser = import('playwright').then(({ chromium }) => chromium.launch({ headless: true }));
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (idle) clearTimeout(idle);
  idle = null;
  const b = browser;
  browser = null;
  if (b) await (await b).close().catch(() => {});
}

export async function readWithBrowser(url: string): Promise<RawPage> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { status: 'skipped', url, reason: 'not a link' };
  }
  if (!(await robotsAllowUrl(u))) return { status: 'skipped', url, reason: 'robots.txt does not allow it' };
  if (idle) clearTimeout(idle);
  let context;
  try {
    context = await (await open()).newContext({ userAgent: AGENT, locale: u.pathname.startsWith('/ar') ? 'ar-SA' : 'en-US' });
    const page = await context.newPage();
    const answer = await page.goto(url, { waitUntil: 'networkidle', timeout: LOAD_MS }).catch(() => page.goto(url, { waitUntil: 'load', timeout: LOAD_MS }));
    const status = answer?.status() ?? 0;
    if (status >= 500) return { status: 'down', url, reason: `HTTP ${status}` };
    if (status >= 400) return { status: 'skipped', url, reason: `HTTP ${status}` };
    await page.waitForTimeout(SETTLE_MS);
    return { status: 'ok', url: page.url(), text: htmlToText(await page.content(), page.url()) };
  } catch (error) {
    return { status: 'skipped', url, reason: `browser: ${(error as Error).message.split('\n')[0].slice(0, 80)}` };
  } finally {
    await context?.close().catch(() => {});
    idle = setTimeout(() => void closeBrowser(), IDLE_MS);
    idle.unref();
  }
}
