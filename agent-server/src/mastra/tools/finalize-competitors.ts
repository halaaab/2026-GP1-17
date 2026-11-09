// Tool: picks the final top competitors, computes the Idea Similarity Score (ISS) and saves the results.
// Code only, with no AI inside, so no number in Darb can be invented by a model.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { MAX_COMPETITORS, SIMILARITY_THRESHOLD, WEB_SEARCH_THRESHOLD } from '../config/models';
import { type Competitor, DelegateCompetitorOutput, StartupCandidate } from '../contracts';
import { getSearchRegistry, needsWebSearch } from '../lib/search-registry';
import { webSearchDone } from '../lib/web-registry';
import { getSupabase } from '../lib/supabase';

// Where the result is left for delegate_competitor_analysis, so it never has to trust the model's own text.
export const FINALIZE_OUTPUT_KEY = 'darb_finalize_output';

// Makes two spellings of the same name compare equal: lowercase, no diacritics,
// one form of alef, taa marbuta as haa, and single spaces.
export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // Latin accents
    .replace(/[ً-ٰٟـ]/g, '') // Arabic diacritics and tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// "https://www.Jahez.net/about" and "jahez.net" both become "jahez.net".
export function normalizeDomain(website: string | null): string | null {
  if (!website) return null;
  try {
    const url = new URL(website.includes('://') ? website : `https://${website}`);
    return url.hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

function namesOf(candidate: StartupCandidate): string[] {
  return [candidate.name, candidate.name_ar].filter((n): n is string => !!n).map(normalizeName).filter(Boolean);
}

// True when two candidates are the same company.
// Sites that host many unrelated companies, so sharing one says nothing about being the same company.
const SHARED_HOSTS = new Set([
  'linktr.ee', 'apps.apple.com', 'play.google.com', 'instagram.com', 'x.com', 'twitter.com', 'linkedin.com',
  'facebook.com', 'tiktok.com', 'wa.me', 'sites.google.com', 'bit.ly', 'notion.site', 'youtube.com',
]);

function isSameCompany(a: StartupCandidate, b: StartupCandidate): boolean {
  if (a.startup_id === b.startup_id) return true;
  // The same website means the same company, even for two dataset rows: the dataset has some
  // companies entered more than once (e.g. four rows for misraj.sa).
  const domainA = normalizeDomain(a.website);
  if (domainA && !SHARED_HOSTS.has(domainA) && domainA === normalizeDomain(b.website)) return true;
  // Otherwise two dataset rows with different ids are different companies.
  if (a.source === 'dataset' && b.source === 'dataset') return false;
  const namesB = namesOf(b);
  return namesOf(a).some((name) => namesB.includes(name));
}

// Steps 1 to 4: filter, remove duplicates, rank, and compute the ISS.
export function selectCompetitors(candidates: StartupCandidate[]): { competitors: Competitor[]; iss: number | null } {
  // Best first; on equal similarity the dataset version comes first, so it is the one kept.
  const sorted = candidates
    .filter((c) => c.similarity >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity || (a.source === 'dataset' ? -1 : 0) - (b.source === 'dataset' ? -1 : 0));

  const unique: StartupCandidate[] = [];
  for (const candidate of sorted) {
    if (!unique.some((kept) => isSameCompany(kept, candidate))) unique.push(candidate);
  }

  const competitors = unique.slice(0, MAX_COMPETITORS).map((c, i) => ({ ...c, rank: i + 1 }));
  if (competitors.length === 0) return { competitors, iss: null };

  const mean = competitors.reduce((sum, c) => sum + c.similarity, 0) / competitors.length;
  return { competitors, iss: Math.round(mean * 1000) / 10 };
}

export const finalizeCompetitorsTool = createTool({
  id: 'finalize_competitors',
  description:
    'Call this exactly once at the end, with the startup_id of every relevant startup that similarity_search returned. It picks the final top competitors, computes the ISS and saves the result.',
  inputSchema: z.object({
    assessment_id: z.string().optional().describe('The assessment_id you were given, if any. Leave it out when you were given none.'),
    startup_ids: z.array(z.string()).optional().describe('The startup_id of each relevant startup from similarity_search.'),
    candidates: z.array(StartupCandidate).optional().describe('Only for testing by hand: full candidates instead of ids.'),
  }),
  outputSchema: DelegateCompetitorOutput,
  execute: async (input, context) => {
    // The 0.50 rule, enforced in code: if Darb's dataset has fewer than 3 strong matches, the web must be
    // searched before the analysis can finish. (Skipped when no web search key is set.)
    if (process.env.TAVILY_API_KEY && needsWebSearch(context, WEB_SEARCH_THRESHOLD, MAX_COMPETITORS) && !webSearchDone(context)) {
      throw new Error(
        'Darb\'s dataset has fewer than 3 strong matches for this idea, so search the web first: call web_search, open the promising pages with extract_and_verify_profile, then call finalize_competitors again.',
      );
    }
    const result = await finalize(input, context);
    // Left in the shared request context for delegate_competitor_analysis to read.
    (context as { requestContext?: { set: (k: string, v: unknown) => void } })?.requestContext?.set(FINALIZE_OUTPUT_KEY, result);
    return result;
  },
});

// The code guard: only startups that a search really returned can become competitors, with the search's own data.
async function trustedCandidates(
  startupIds: string[],
  candidates: StartupCandidate[],
  context: unknown,
): Promise<StartupCandidate[]> {
  const registry = getSearchRegistry(context);
  if (registry) {
    // During an analysis: look each id up in what similarity_search returned, and drop anything it never returned.
    const ids = new Set([...startupIds, ...candidates.map((c) => c.startup_id)]);
    return [...ids].map((id) => registry.get(id)).filter((c): c is StartupCandidate => !!c);
  }

  // Run by hand (no search in this run): dataset candidates must at least exist in public.startups.
  const datasetIds = candidates.filter((c) => c.source === 'dataset').map((c) => c.startup_id);
  if (datasetIds.length === 0) return candidates;
  const { data, error } = await getSupabase().from('startups').select('startup_id').in('startup_id', datasetIds);
  if (error) throw error;
  const known = new Set((data ?? []).map((row) => row.startup_id));
  return candidates.filter((c) => c.source !== 'dataset' || known.has(c.startup_id));
}

async function finalize(
  input: { assessment_id?: string; startup_ids?: string[]; candidates?: StartupCandidate[] },
  context: unknown,
): Promise<DelegateCompetitorOutput> {
  // Which assessment to save to. During an analysis, delegate_competitor_analysis sets it in the request context.
  // When an agent calls this tool without one (for example someone chatting with the Competitor Agent in Studio),
  // the id the model typed is never trusted: the result is returned as a preview and nothing is saved.
  // Only a person running the tool by hand (no agent) may give the id directly.
  const ctx = context as { agent?: unknown; requestContext?: { get: (k: string) => unknown } };
  const fromContext = ctx?.requestContext?.get('assessmentId');
  const byHand = !ctx?.agent && z.uuid().safeParse(input.assessment_id).success ? input.assessment_id! : null;
  const saveTo = typeof fromContext === 'string' ? fromContext : byHand;
  const assessment_id = saveTo ?? '';

  let competitors: Competitor[];
  let iss: number | null;
  try {
    const trusted = await trustedCandidates(input.startup_ids ?? [], input.candidates ?? [], context);
    ({ competitors, iss } = selectCompetitors(trusted));
  } catch (error) {
    console.error('finalize_competitors could not check the candidates:', error);
    return { status: 'error', assessment_id, competitors: [], iss: null, competitors_found: 0, message: 'The candidates could not be checked.' };
  }

  if (saveTo === null) {
    return {
      status: competitors.length > 0 ? 'ok' : 'no_results',
      assessment_id,
      competitors,
      iss,
      competitors_found: competitors.length,
      message: 'Preview only: nothing was saved, because this run has no assessment.',
    };
  }

  // Step 5: save. Old rows go first, so a retry never leaves duplicates.
  // A dataset competitor points to its row in public.startups. A web competitor has no such row,
  // so it keeps its own name, description, website and the page it was verified on (migration 0024).
  try {
    const supabase = getSupabase();
    const removed = await supabase.from('similar_startup_results').delete().eq('assessment_id', assessment_id);
    if (removed.error) throw removed.error;

    const rows = competitors.map((c) =>
      c.source === 'dataset'
        ? { assessment_id, source_type: 'database', startup_id: c.startup_id, similarity_score: c.similarity, rank: c.rank }
        : {
            assessment_id,
            source_type: 'web',
            startup_id: null,
            competitor_name: c.name,
            description: c.description,
            website: c.website,
            source_url: c.source_url ?? c.website,
            similarity_score: c.similarity,
            rank: c.rank,
          },
    );
    if (rows.length > 0) {
      const inserted = await supabase.from('similar_startup_results').insert(rows);
      if (inserted.error) throw inserted.error;
    }

    // The ISS is saved on the assessment too, so what-if comparisons and history read the same number.
    const saved = await supabase
      .from('assessments')
      .update({ iss, analysed_at: new Date().toISOString() })
      .eq('assessment_id', assessment_id);
    if (saved.error) throw saved.error;
  } catch (error) {
    console.error('finalize_competitors could not save results:', error);
    return {
      status: 'error' as const,
      assessment_id,
      competitors: [],
      iss: null,
      competitors_found: 0,
      message: 'The competitors could not be saved.',
    };
  }

  // Step 6: the result.
  if (competitors.length === 0) {
    return {
      status: 'no_results' as const,
      assessment_id,
      competitors,
      iss: null,
      competitors_found: 0,
      message: 'No close competitors were found.',
    };
  }
  return {
    status: 'ok' as const,
    assessment_id,
    competitors,
    iss,
    competitors_found: competitors.length,
    message: `Found ${competitors.length} competitor(s).`,
  };
}
