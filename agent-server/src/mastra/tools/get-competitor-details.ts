// Tool: reads the stored facts about one competitor already shown to the founder,
// so follow-up answers ("tell me more", "why is it relevant?") come from the database, not from memory.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSupabase } from '../lib/supabase';

// Every fact Darb holds about a dataset startup. null means Darb does not have it.
const CompetitorDetails = z.object({
  startup_id: z.string(),
  rank: z.number(),
  similarity_percent: z.number(),
  name: z.string(),
  name_ar: z.string().nullable(),
  description: z.string().nullable(),
  description_ar: z.string().nullable(),
  sector: z.string().nullable(),
  target_market: z.string().nullable(),
  products_services: z.string().nullable(),
  stage: z.string().nullable(),
  region: z.string().nullable(),
  country: z.string().nullable(),
  tags: z.string().nullable(),
  website: z.string().nullable(),
  profile_url: z.string().nullable(),
});

export const getCompetitorDetailsTool = createTool({
  id: 'get_competitor_details',
  description:
    'Use this whenever the founder asks for more details about one of the competitors you showed, or why it is relevant. Returns only the facts Darb has stored about it.',
  inputSchema: z.object({
    assessment_id: z.uuid(),
    startup_id: z.string().describe('The startup_id of the competitor, from the competitor analysis result.'),
  }),
  outputSchema: z.object({
    status: z.enum(['ok', 'not_in_results', 'error']),
    details: CompetitorDetails.nullable(),
  }),
  execute: async ({ assessment_id, startup_id }) => {
    try {
      // Read through the saved results, so only a competitor from this assessment can be described.
      const { data, error } = await getSupabase()
        .from('similar_startup_results')
        .select(
          'rank, similarity_score, startups (startup_id, startup_name, startup_name_ar, startup_description, startup_description_ar, sector, target_market, products_services, stage, region, country, tags, website, ecosystemsa_profile_url)',
        )
        .eq('assessment_id', assessment_id)
        .eq('startup_id', startup_id)
        .maybeSingle();
      if (error) throw error;

      const s = data?.startups as unknown as Record<string, string | null> | null;
      if (!data || !s) return { status: 'not_in_results' as const, details: null };

      return {
        status: 'ok' as const,
        details: {
          startup_id: s.startup_id!,
          rank: data.rank,
          similarity_percent: Math.round(Number(data.similarity_score) * 1000) / 10,
          name: s.startup_name!,
          name_ar: s.startup_name_ar ?? null,
          description: s.startup_description ?? null,
          description_ar: s.startup_description_ar ?? null,
          sector: s.sector ?? null,
          target_market: s.target_market ?? null,
          products_services: s.products_services ?? null,
          stage: s.stage ?? null,
          region: s.region ?? null,
          country: s.country ?? null,
          tags: s.tags ?? null,
          website: s.website ?? null,
          profile_url: s.ecosystemsa_profile_url ?? null,
        },
      };
    } catch (error) {
      console.error('get_competitor_details failed:', error);
      return { status: 'error' as const, details: null };
    }
  },
});
