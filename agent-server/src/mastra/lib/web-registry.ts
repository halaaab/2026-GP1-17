// The web guard: every page web_search really returned is recorded in the analysis' request context.
// extract_and_verify_profile then opens only pages from this record, so the model cannot send it to any other site.
export type WebResult = {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  method: 'extract' | 'snippet';
  query: string;
};

const KEY = 'darb_web_results';
type ContextLike = { requestContext?: { get: (key: string) => unknown; set: (key: string, value: unknown) => void } };

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const p of [...u.searchParams.keys()]) if (p.startsWith('utm_')) u.searchParams.delete(p);
    return `${u.hostname.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}${u.search}`;
  } catch {
    return url;
  }
}

export function recordWebResults(context: unknown, results: WebResult[]): void {
  const rc = (context as ContextLike)?.requestContext;
  if (!rc) return;
  const registry = (rc.get(KEY) as Map<string, WebResult> | undefined) ?? new Map();
  for (const r of results) registry.set(normalizeUrl(r.url), r);
  rc.set(KEY, registry); // set even when nothing was found, so it counts as "the web was searched"
}

export function webSearchDone(context: unknown): boolean {
  return (context as ContextLike)?.requestContext?.get(KEY) instanceof Map;
}

export function findWebResult(context: unknown, url: string): WebResult | null {
  const registry = (context as ContextLike)?.requestContext?.get(KEY);
  return registry instanceof Map ? ((registry.get(normalizeUrl(url)) as WebResult | undefined) ?? null) : null;
}
