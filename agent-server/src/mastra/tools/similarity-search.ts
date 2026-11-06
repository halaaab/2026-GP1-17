// Tool: finds the startups in Darb's dataset whose descriptions are closest in meaning to a query.
// It embeds the query with the same model as the startups and asks the database for the nearest ones.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { DEFAULT_SIMILARITY_K, MAX_SIMILARITY_K } from '../config/limits';
import { MAX_COMPETITORS, SIMILARITY_THRESHOLD, WEB_SEARCH_THRESHOLD } from '../config/models';
import { StartupCandidate } from '../contracts';
import { embedTexts, toPgVector } from '../lib/embeddings';
import { needsWebSearch, recordSearchResults } from '../lib/search-registry';
import { toEnglish } from '../lib/startup-text';
import { getSupabase } from '../lib/supabase';

type MatchRow = {
  startup_id: string;
  startup_name: string;
  startup_name_ar: string | null;
  startup_description: string | null;
  sector: string | null;
  region: string | null;
  stage: string | null;
  website: string | null;
  similarity: number;
};

// Renames the database columns to the shared StartupCandidate shape.
export function toCandidate(row: MatchRow): StartupCandidate {
  return {
    startup_id: row.startup_id,
    name: row.startup_name,
    name_ar: row.startup_name_ar,
    description: row.startup_description ?? '',
    sector: row.sector,
    region: row.region,
    stage: row.stage,
    website: row.website,
    similarity: Math.min(1, Math.max(0, Number(row.similarity))),
    source: 'dataset',
  };
}

export const similaritySearchTool = createTool({
  id: 'similarity_search',
  description:
    "Searches Darb's dataset of Saudi startups for the ones closest in meaning to query_text. Write query_text as a short description of a business, in English.",
  inputSchema: z.object({
    query_text: z.string().min(3).describe('A short description of the kind of business to look for, in English.'),
    k: z.number().int().min(1).max(MAX_SIMILARITY_K).default(DEFAULT_SIMILARITY_K).describe('How many startups to return.'),
  }),
  outputSchema: z.object({
    candidates: z.array(StartupCandidate),
    // True when, across every search so far, fewer than 3 dataset startups score at least WEB_SEARCH_THRESHOLD.
    needs_web_search: z.boolean(),
  }),
  execute: async ({ query_text, k }, context) => {
    // The query is the description of the business only, in English. Adding the founder's ISIC4 activity
    // was tested on 6 Nov 2026 and made matching worse: the shared category words outweighed the idea itself.
    const english = await toEnglish(query_text);
    const [embedding] = await embedTexts([english]);
    const { data, error } = await getSupabase().rpc('match_startups', {
      query_embedding: toPgVector(embedding),
      match_count: k ?? DEFAULT_SIMILARITY_K,
      min_similarity: SIMILARITY_THRESHOLD,
    });
    if (error) throw new Error(`match_startups failed: ${error.message}`);

    const candidates = ((data ?? []) as MatchRow[]).map(toCandidate);
    recordSearchResults(context, candidates);
    const strongHere = candidates.filter((c) => c.similarity >= WEB_SEARCH_THRESHOLD).length;
    const hasRecord = !!(context as { requestContext?: unknown })?.requestContext;
    return {
      candidates,
      needs_web_search: hasRecord ? needsWebSearch(context, WEB_SEARCH_THRESHOLD, MAX_COMPETITORS) : strongHere < MAX_COMPETITORS,
    };
  },
});
