// Tool: searches the approved websites with Tavily. It only finds pages; it never opens them
// (that is extract_and_verify_profile's job). Code re-checks every result against the approved list.
import { tavily } from '@tavily/core';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { API_TIMEOUT_MS, MAX_RESULTS_PER_QUERY, MAX_WEB_QUERIES, MAX_WEB_SEARCH_CALLS } from '../config/limits';
import { approvedDomainOf, domainsForSection } from '../config/approved-domains';
import { normalizeUrl, recordWebResults, type WebResult } from '../lib/web-registry';

const WebResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  domain: z.string(),
  method: z.enum(['extract', 'snippet']),
  query: z.string(),
});

type SearchFn = (query: string, options: Record<string, unknown>) => Promise<{ results: { title: string; url: string; content: string }[] }>;

let client: { search: SearchFn } | undefined;
function getTavily(): { search: SearchFn } {
  if (!client) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) throw new Error('TAVILY_API_KEY must be set in .env');
    client = tavily({ apiKey }) as unknown as { search: SearchFn };
  }
  return client;
}

// Keeps only results on an approved site, and each page once.
export function keepApproved(raw: { title: string; url: string; content: string }[], query: string, seen: Set<string>): WebResult[] {
  const kept: WebResult[] = [];
  for (const r of raw) {
    const site = approvedDomainOf(r.url);
    if (!site || site.method === 'none') continue; // off the list, or a lookalike such as wamda.com.evil.io
    const key = normalizeUrl(r.url);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push({
      title: r.title ?? '',
      url: r.url,
      snippet: (r.content ?? '').slice(0, 1200),
      domain: site.domain,
      method: site.method as 'extract' | 'snippet',
      query,
    });
  }
  return kept;
}

export const webSearchTool = createTool({
  id: 'web_search',
  description:
    "Searches Darb's approved websites (Saudi startup directories, investors, news, app stores, regulators) for companies like the founder's idea. Use it when similarity_search says needs_web_search, or does not cover the idea. It only lists pages; open a promising one with extract_and_verify_profile.",
  inputSchema: z.object({
    queries: z
      .array(z.string().min(3))
      .min(1)
      .max(MAX_WEB_QUERIES)
      .describe('1 to 3 short English searches, each describing the kind of business, e.g. "Saudi startup BNPL school fees".'),
  }),
  outputSchema: z.object({ results: z.array(WebResultSchema), message: z.string() }),
  execute: async ({ queries }, context) => {
    // At most MAX_WEB_SEARCH_CALLS searches per analysis, counted in code.
    const rc = (context as { requestContext?: { get: (k: string) => unknown; set: (k: string, v: unknown) => void } })?.requestContext;
    const calls = (rc?.get('darb_web_search_calls') as number | undefined) ?? 0;
    if (calls >= MAX_WEB_SEARCH_CALLS) {
      return { results: [], message: `The web was already searched ${MAX_WEB_SEARCH_CALLS} times in this analysis. Use the results you have and call finalize_competitors.` };
    }
    rc?.set('darb_web_search_calls', calls + 1);

    // The founder's ISIC4 section adds the sector-specific sites (set by delegate_competitor_analysis).
    const section = (context as { requestContext?: { get: (k: string) => unknown } })?.requestContext?.get('isicSection');
    const includeDomains = domainsForSection(typeof section === 'string' ? section : null).map((d) => d.domain);

    const seen = new Set<string>();
    const results: WebResult[] = [];
    for (const query of queries) {
      const response = await getTavily().search(query, {
        searchDepth: 'basic',
        maxResults: MAX_RESULTS_PER_QUERY,
        includeDomains,
        timeout: Math.round(API_TIMEOUT_MS / 1000),
      });
      results.push(...keepApproved(response.results ?? [], query, seen));
    }

    recordWebResults(context, results);
    return { results, message: `${results.length} pages found on approved sites.` };
  },
});
