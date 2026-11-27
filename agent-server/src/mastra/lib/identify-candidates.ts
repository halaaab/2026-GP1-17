// Task 7: turns raw search results into a clean list of companies (the shared Candidate format).
//
//   1. Clean every link: lowercase, no "www.", no tracking parts, so the same site is recognised.
//   2. Clean every name for comparing: no legal words (company, LLC, شركة, مؤسسة ...), unified Arabic letters.
//   3. What is not a company's own site becomes evidence, not a company: news, social media, government,
// directory and reference pages (encyclopedias, document sites, official tourism sites).
//      News titles are also returned as leads (e.g. "GetMuv raises $1.5 million"), so the agent can look for that
//      company's own site. Only the Saudi App Store (/sa/) counts as an app store page. A company's own site is
//      always kept, even when its page is a list (a list there is usually the company's own product, e.g. a gym
//      day-pass platform listing its gyms). Anything unclear is kept: the judge's "is it a company?" catches it.
//   4. Merge duplicates: same website = one company (all names kept as aliases); an app store page joins the
//      company with the same name; same name on different websites stays two companies; never merge by guess.
//   5. Remove the founder's own startup and the companies they used as an analogy ("like Talabat").
import type { Candidate, Source, SourceType } from '../schemas/competitor';

// ---------------------------------------------------------------------------
// What goes in and what comes out
// ---------------------------------------------------------------------------

export type RawResult = {
  source_type: 'corpus' | 'web';
  startup_id?: string; // for a result from Darb's list
  name?: string; // the company name, when the search step knows it
  url: string;
  title?: string; // the page title
  text?: string; // the page text or snippet
  accessed_at?: string;
  published_date?: string; // the page's date, when the search gives one (news articles); used by Task 8's Active check
};

export type RemovedResult = {
  name: string | null;
  url: string;
  reason: 'founder_startup' | 'reference' | 'not_a_link' | 'no_company_name' | 'not_saudi_app_store';
};

export type EvidencePage = {
  url: string;
  domain: string;
  kind: 'government' | 'directory' | 'news' | 'social' | 'reference';
  title: string | null;
  published_date?: string; // only when the search gave the page's date
};

// leads: titles of news pages, which often name a company worth looking for (its own site is found separately).
export type IdentifyOutput = { candidates: Candidate[]; evidence: EvidencePage[]; leads: string[]; removed: RemovedResult[] };

// ---------------------------------------------------------------------------
// 1. Links
// ---------------------------------------------------------------------------

// Tracking parts added by ads and newsletters: they never change which page it is.
const TRACKING = /^(utm_\w+|gclid|gbraid|wbraid|gad_source|gad_campaignid|fbclid|msclkid|ref|source)$/i;

// The site of a link, without "www." ("https://www.Bayut.sa/x?utm_source=ads" → "bayut.sa"). null when not a link.
export function siteOf(url: string): string | null {
  try {
    const link = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
    return link.hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

// The link as it is kept as a source: lowercase site, no "www.", no tracking parts, no "#..." part.
export function cleanLink(url: string): string | null {
  try {
    const link = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
    link.hostname = link.hostname.toLowerCase().replace(/^www\./, '');
    for (const key of [...link.searchParams.keys()]) if (TRACKING.test(key)) link.searchParams.delete(key);
    link.hash = '';
    return link.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Kinds of sites, from the source groups of the domain audit. Every site not listed is treated as
// a company's own site.
// ---------------------------------------------------------------------------

const APP_STORES = ['apps.apple.com', 'play.google.com', 'apps.salla.sa', 'apps.zid.sa'];
const NEWS = [
  'wamda.com', 'menabytes.com', 'menastartupdigest.com', 'arabnews.com', 'argaam.com', 'sharikatmubasher.com',
  'forbesmiddleeast.com', 'entrepreneur.com', 'enterpriseam.com', 'saudigazette.com.sa', 'aitnews.com',
];
const DIRECTORIES = [
  'ecosystemsa.com', 'startupblink.com', 'magnitt.com', 'producthunt.com', 'ycombinator.com', 'crunchbase.com',
  'dealroom.co', 'tracxn.com', 'wellfound.com', 'startup.google.com', 'svc.com.sa', 'stv.vc', 'raed.vc',
  'sanabil.com', 'halaventures.com', '500.co', 'endeavor.org', 'flat6labs.com', 'thegarage.sa', 'misk.org.sa',
  'kaust.edu.sa', 'fintechsaudi.sa', 'saudiexchange.sa', 'biban.com.sa', 'onegiantleap.com', 'g2.com',
  'capterra.com', 'saashub.com', 'alternativeto.net', 'theresanaiforthat.com', 'futurepedia.io', 'linkedin.com',
];

// Reference and document sites: encyclopedias, document sharing, forums, official tourism portals.
const REFERENCE = [
  'wikipedia.org', 'saudipedia.com', 'scribd.com', 'medium.com', 'quora.com', 'reddit.com', 'slideshare.net',
  'visitsaudi.com', 'experiencealula.com',
];
const SOCIAL = ['instagram.com', 'x.com', 'twitter.com', 'facebook.com', 'tiktok.com', 'youtube.com', 'snapchat.com', 'threads.net'];

const onSite = (site: string, list: string[]) => list.some((d) => site === d || site.endsWith(`.${d}`));

export type SiteKind = 'app_store' | 'news' | 'government' | 'directory' | 'social' | 'reference' | 'company';

export function siteKind(site: string): SiteKind {
  if (onSite(site, APP_STORES)) return 'app_store';
  if (onSite(site, SOCIAL)) return 'social';
  if (onSite(site, REFERENCE)) return 'reference';
  if (site.endsWith('.gov.sa')) return 'government';
  if (onSite(site, NEWS)) return 'news';
  if (onSite(site, DIRECTORIES)) return 'directory';
  return 'company';
}

const SOURCE_TYPE: Record<SiteKind, SourceType> = {
  app_store: 'app_store',
  news: 'news',
  government: 'government',
  directory: 'ecosystem',
  social: 'news',
  reference: 'news',
  company: 'official_site',
};

// ---------------------------------------------------------------------------
// 2. Names
// ---------------------------------------------------------------------------

// Legal and filler words, in English and Arabic, removed before names are compared.
const LEGAL_WORDS = [
  'company', 'co', 'corp', 'corporation', 'llc', 'ltd', 'limited', 'inc', 'est', 'establishment', 'holding', 'group',
  'شركة', 'شركه', 'مؤسسة', 'مؤسسه', 'للتقنية', 'للتقنيه', 'لتقنية', 'لتقنيه', 'المحدودة', 'المحدوده', 'القابضة', 'القابضه',
];

// Hidden direction marks that app stores put around names ("‏‫تطبيق 1Pass‬").
export const BIDI_MARKS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
// Words that describe the product, not its name: "تطبيق 1Pass" and "1Pass App" are both 1Pass.
const PRODUCT_WORDS = ['app', 'application', 'تطبيق', 'منصة'];

// "شركة ون باس للتقنية" → "ونباس"; "1pass Co." → "1pass"; "‏‫تطبيق 1Pass‬" → "1pass". Used only for comparing.
export function cleanName(name: string): string {
  const words = name
    .replace(BIDI_MARKS, '')
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '') // Arabic diacritics and tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .split(/[^a-z0-9؀-ۿ]+/)
    .filter((w) => w && !LEGAL_WORDS.includes(w) && !PRODUCT_WORDS.includes(w));
  return words.join('').replace(/ة/g, 'ه');
}


// ---------------------------------------------------------------------------
// The whole step
// ---------------------------------------------------------------------------

type Group = {
  key: string; // corpus:ST_073, web:1pass.app or name:1pass
  source_type: 'corpus' | 'web';
  startup_id: string | null;
  names: string[]; // first one is the name shown
  site: string | null; // the company's own site, when known
  website: string | null;
  texts: string[];
  sources: Source[];
};

const MAX_EVIDENCE_CHARS = 6000;

// Adds a page's text and link to a company, once per link.
function addEvidence(group: Group, text: string, source: Source) {
  if (group.sources.some((s) => s.url === source.url)) return;
  group.texts.push(text);
  group.sources.push(source);
}

export function identifyCandidates(
  results: RawResult[],
  context: { founder_startup?: { name?: string; website?: string }; references?: string[] } = {},
  now = new Date(),
): IdentifyOutput {
  const removed: RemovedResult[] = [];
  const evidence: EvidencePage[] = [];
  const leads: string[] = [];
  const groups = new Map<string, Group>();
  const accessedAt = (r: RawResult) => r.accessed_at ?? now.toISOString();

  const founderSite = context.founder_startup?.website ? siteOf(context.founder_startup.website) : null;
  const founderName = context.founder_startup?.name ? cleanName(context.founder_startup.name) : null;
  const referenceNames = new Set((context.references ?? []).map(cleanName).filter(Boolean));

  // Pages that are not the company's own site: identified by the company name only.
  const nameOnly: { result: RawResult; link: string; kind: SiteKind }[] = [];

  for (const r of results) {
    const link = cleanLink(r.url);
    const site = link ? siteOf(link) : null;
    if (!link || !site) {
      removed.push({ name: r.name ?? null, url: r.url, reason: 'not_a_link' });
      continue;
    }
    const kind = r.source_type === 'corpus' ? 'company' : siteKind(site);
    const name = r.name?.trim() || null;

    // 3. Not a company's own site: evidence (news titles are leads too), or removed.
    if (r.source_type === 'web' && (kind === 'news' || kind === 'social' || kind === 'government' || kind === 'directory' || kind === 'reference')) {
      evidence.push({ url: link, domain: site, kind, title: r.title ?? null, ...(r.published_date ? { published_date: r.published_date } : {}) });
      if (kind === 'news' && r.title?.trim()) leads.push(r.title.trim());
      continue;
    }
    if (kind === 'app_store' && site === 'apps.apple.com' && !new URL(link).pathname.startsWith('/sa/')) {
      removed.push({ name, url: link, reason: 'not_saudi_app_store' });
      continue;
    }

    // 5. The founder's own startup, and their analogies.
    const nameKey = name ? cleanName(name) : '';
    if ((kind === 'company' && founderSite && site === founderSite) || (founderName && nameKey === founderName)) {
      removed.push({ name, url: link, reason: 'founder_startup' });
      continue;
    }
    if (nameKey && referenceNames.has(nameKey)) {
      removed.push({ name, url: link, reason: 'reference' });
      continue;
    }

    const source: Source = { url: link, source_type: SOURCE_TYPE[kind], accessed_at: accessedAt(r) };
    const text = [r.title, r.text].filter(Boolean).join('\n');

    // 4. Same website = one company. Darb's own list keeps its id.
    if (kind === 'company') {
      const existing = [...groups.values()].find((g) => g.site === site);
      const group: Group =
        existing ??
        (() => {
          const g: Group = {
            key: r.source_type === 'corpus' && r.startup_id ? `corpus:${r.startup_id}` : `web:${site}`,
            source_type: r.source_type,
            startup_id: r.source_type === 'corpus' ? (r.startup_id ?? null) : null,
            names: [],
            site,
            website: `https://${site}`,
            texts: [],
            sources: [],
          };
          groups.set(g.key, g);
          return g;
        })();
      if (r.source_type === 'corpus' && existing && existing.source_type === 'web' && r.startup_id) {
        // A web result came first for a startup in Darb's list: the list's id wins.
        groups.delete(existing.key);
        Object.assign(existing, { key: `corpus:${r.startup_id}`, source_type: 'corpus', startup_id: r.startup_id });
        groups.set(existing.key, existing);
      }
      // The name in Darb's list is the name shown; other spellings become aliases.
      if (name && r.source_type === 'corpus') group.names.unshift(name);
      else if (name) group.names.push(name);
      addEvidence(group, text, source);
    } else {
      nameOnly.push({ result: r, link, kind });
    }
  }

  // 4. Pages on other sites (app stores, news) join the one company with the same name; otherwise they stay
  //    their own candidate. When two companies share the name, the page is not merged: never by guess.
  for (const { result, link, kind } of nameOnly) {
    const name = result.name?.trim();
    const source: Source = { url: link, source_type: SOURCE_TYPE[kind], accessed_at: accessedAt(result) };
    const text = [result.title, result.text].filter(Boolean).join('\n');
    if (!name) {
      removed.push({ name: null, url: link, reason: 'no_company_name' });
      continue;
    }
    const key = cleanName(name);
    const sameName = [...groups.values()].filter((g) => g.names.some((n) => cleanName(n) === key));
    if (sameName.length === 1) {
      const g = sameName[0];
      if (!g.names.includes(name)) g.names.push(name);
      addEvidence(g, text, source);
      continue;
    }
    const own: Group = {
      key: sameName.length === 0 ? `name:${key}` : `name:${key}:${link}`,
      source_type: 'web',
      startup_id: null,
      names: [name],
      site: null,
      website: null,
      texts: [text],
      sources: [source],
    };
    const twin = groups.get(own.key);
    if (twin) addEvidence(twin, text, source);
    else groups.set(own.key, own);
  }

  const candidates: Candidate[] = [...groups.values()].map((g) => {
    const [name = g.site ?? 'Unknown', ...others] = [...new Set(g.names)];
    const aliases = [...new Set(others.filter((n) => n !== name))];
    return {
      candidate_key: g.key,
      source_type: g.source_type,
      startup_id: g.startup_id,
      name,
      name_aliases: aliases,
      website: g.website,
      domain: g.site,
      evidence_text: g.texts.filter(Boolean).join('\n\n').slice(0, MAX_EVIDENCE_CHARS),
      sources: g.sources,
    };
  });

  return { candidates, evidence, leads: [...new Set(leads)], removed };
}
