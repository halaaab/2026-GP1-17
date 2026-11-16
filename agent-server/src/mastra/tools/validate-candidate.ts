// Tool (Task 8): checks that each company is real, active and serving Saudi Arabia, and gives it an evidence
// status (lib/validate-candidate.ts). Confirmed only with a matching CR number; Unconfirmed is never shown.
// Registered in Mastra so it can be run alone in Studio's Tools tab.
import { createTool } from '@mastra/core/tools';
import { tavily } from '@tavily/core';
import { z } from 'zod';
import { EXCLUDED_SOURCES } from '../config/excluded-sources';
import { API_TIMEOUT_MS } from '../config/limits';
import { readAppFacts, findOwnApp } from '../lib/app-stores';
import { extractPages, tavilyExtract } from '../lib/extract-pages';
import { readRawPage } from '../lib/raw-page';
import { readWithBrowser } from '../lib/browser-page';
import { getSupabase } from '../lib/supabase';
import { newsAboutCompany, openAiSignals, validateCompanies, type ValidateDeps } from '../lib/validate-candidate';

// The monthly re-check's news search for a site that gave almost no text (Task 9): one Tavily news search on the
// company's name, the last 12 months only (no news is not evidence of anything, so older news is not searched).
export function tavilyNewsSearch(): NonNullable<ValidateDeps['findNews']> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error('TAVILY_API_KEY must be set in .env');
  const client = tavily({ apiKey });
  return async (company) => {
    const answer = await client.search(`"${company.name}" Saudi`, {
      topic: 'news',
      timeRange: 'year',
      maxResults: 5,
      timeout: Math.round(API_TIMEOUT_MS / 1000),
      excludeDomains: EXCLUDED_SOURCES,
    });
    const hits = answer.results.map((r) => ({ url: r.url, title: r.title, content: r.content, ...(r.publishedDate ? { date: r.publishedDate } : {}) }));
    return { news: newsAboutCompany(company, hits), tavily_calls: 1 };
  };
}

const outcome = z.enum(['pass', 'fail', 'unknown']);

// The real reader, AI and database, shared by this tool, the monthly re-check (Task 9) and find-competitors (Task 11).
export function liveValidateDeps(maxCalls?: number): ValidateDeps {
  let extract = null;
  try {
    extract = tavilyExtract();
  } catch {
    // No Tavily key: nothing can be read, so every check is unknown and every company Unconfirmed.
  }
  return {
    read: (urls, options) => extractPages(urls, extract, new Date(), options),
    askAi: openAiSignals(),
    save: async (startupId, row) => {
      const { error } = await getSupabase().from('startups').update(row).eq('startup_id', startupId);
      if (error) throw error;
    },
    maxCalls,
    readRaw: (url) => readRawPage(url),
    readBrowser: (url) => readWithBrowser(url),
    appFacts: (url) => readAppFacts(url),
    findApp: (names, domain) => findOwnApp(names, domain),
  };
}

export const validateCandidateTool = createTool({
  id: 'validate-candidate',
  description:
    "Checks that each company is real, has a product available now, was active in the last 12 months and serves Saudi Arabia, from its own pages (homepage, About, Arabic page, its App Store or Google Play page) and news dates. Gives an evidence status: confirmed (all four + a CR number matching the Ministry of Commerce list), likely, or unconfirmed (never shown).",
  inputSchema: z.object({
    companies: z
      .array(
        z.object({
          name: z.string().min(1),
          website: z.string().optional(),
          startup_id: z.string().optional().describe("For a startup in Darb's list, e.g. ST_073: its result is saved."),
          aliases: z.array(z.string()).optional(),
          description: z.string().optional().describe("What the company is known to do. For a startup in Darb's list, it is read from the list."),
          app_store_url: z.string().optional().describe('Its Saudi App Store or Google Play page: read for its last update, and instead of a website that cannot be read.'),
          news: z
            .array(z.object({ url: z.string(), title: z.string().nullable(), published_date: z.string().nullable().optional() }))
            .optional()
            .describe('News pages about it (from search-web evidence): their dates count for Active.'),
        }),
      )
      .min(1)
      .max(10),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        name: z.string(),
        website: z.string().nullable(),
        startup_id: z.string().nullable(),
        real_entity: outcome,
        real_offering: outcome,
        active: outcome,
        saudi_reach: outcome,
        evidence_status: z.enum(['confirmed', 'likely', 'unconfirmed']),
        checked_at: z.string(),
        reasons: z.object({ real_entity: z.string(), real_offering: z.string(), active: z.string(), saudi_reach: z.string() }),
        cr: z.object({ result: z.enum(['match', 'unknown']), number_checked: z.string(), number_type: z.string(), reason: z.string(), url: z.string() }).passthrough().nullable(),
        signals: z.array(z.object({ check: z.string(), signal: z.string(), kind: z.string(), quote: z.string(), url: z.string(), by: z.enum(['code', 'ai']) })),
        pages_read: z.array(z.string()),
        pages_failed: z.array(z.string()),
        notes: z.array(z.string()),
      }),
    ),
    tavily_calls: z.number(),
  }),
  execute: async ({ companies }) => {
    // A startup from Darb's list: its description is read from the list, so the AI can tell whether its site sells
    // that same product (a site that belongs to another company fails Real entity).
    const ids = companies.map((c) => c.startup_id).filter((id): id is string => !!id);
    const described = new Map<string, string | null>();
    if (ids.length) {
      const { data, error } = await getSupabase().from('startups').select('startup_id, startup_description').in('startup_id', ids);
      if (error) throw error;
      for (const r of data) described.set(r.startup_id, r.startup_description);
    }
    return validateCompanies(
      companies.map((c) => ({ ...c, description: c.description ?? (c.startup_id ? described.get(c.startup_id) ?? null : null) })),
      liveValidateDeps(),
    );
  },
});
