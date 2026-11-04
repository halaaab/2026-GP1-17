// Tool: picks the final top competitors, computes the Idea Similarity Score (ISS) and saves the results.
// Code only, with no AI inside, so no number in Darb can be invented by a model.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { MAX_COMPETITORS, SIMILARITY_THRESHOLD } from '../config/models';
import { type Competitor, DelegateCompetitorOutput, StartupCandidate } from '../contracts';
import { getSupabase } from '../lib/supabase';

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
function isSameCompany(a: StartupCandidate, b: StartupCandidate): boolean {
  if (a.startup_id === b.startup_id) return true;
  // Dataset ids are reliable, so two dataset rows with different ids are different companies.
  if (a.source === 'dataset' && b.source === 'dataset') return false;
  const domainA = normalizeDomain(a.website);
  if (domainA && domainA === normalizeDomain(b.website)) return true;
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
    'Call this exactly once at the end, with every relevant candidate from similarity_search. It picks the final top competitors, computes the ISS and saves the result.',
  inputSchema: z.object({
    assessment_id: z.uuid(),
    candidates: z.array(StartupCandidate),
  }),
  outputSchema: DelegateCompetitorOutput,
  execute: async ({ assessment_id, candidates }) => {
    const { competitors, iss } = selectCompetitors(candidates);

    // Step 5: save. Old rows go first, so a retry never leaves duplicates.
    // Web competitors are returned but not saved yet: the table only accepts startups in public.startups.
    try {
      const supabase = getSupabase();
      const removed = await supabase.from('similar_startup_results').delete().eq('assessment_id', assessment_id);
      if (removed.error) throw removed.error;

      const rows = competitors
        .filter((c) => c.source === 'dataset')
        .map((c) => ({ assessment_id, startup_id: c.startup_id, similarity_score: c.similarity, rank: c.rank }));
      if (rows.length > 0) {
        const inserted = await supabase.from('similar_startup_results').insert(rows);
        if (inserted.error) throw inserted.error;
      }
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
  },
});
