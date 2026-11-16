// Tool (Task 2): finds the 15 startups in Darb's list closest to an idea, by meaning and by keywords
// (lib/search-corpus.ts). With an idea_id, the idea's profile is saved the first time and reused after,
// so the same idea always gives the same list (design §4, §12). Registered for Studio's Tools tab.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { embedTexts, toPgVector } from '../lib/embeddings';
import { buildIdeaProfile, profileText } from '../lib/idea-profile';
import { searchForIdea, type CorpusRow, type SavedIdeaDeps } from '../lib/search-corpus';
import { getSupabase } from '../lib/supabase';
import { Candidate, IdeaProfile } from '../schemas/competitor';

// pgvector sends a vector back as text like "[0.1,0.2,...]".
const fromPgVector = (value: unknown): number[] | null => {
  if (Array.isArray(value)) return value as number[];
  if (typeof value === 'string' && value.startsWith('[')) return JSON.parse(value) as number[];
  return null;
};

// The real profile maker, embeddings and database, shared with find-competitors (Task 11).
export function liveCorpusDeps(): SavedIdeaDeps {
  const db = getSupabase();
  return {
    buildProfile: buildIdeaProfile,
    toText: profileText,
    embed: async (text) => (await embedTexts([text]))[0],
    searchByVector: async (vector) => {
      const { data, error } = await db.rpc('search_startups_by_profile', { query_embedding: toPgVector(vector) });
      if (error) throw error;
      return data as CorpusRow[];
    },
    loadSaved: async (ideaId) => {
      const { data, error } = await db.from('startup_ideas').select('profile_text, embedding').eq('idea_id', ideaId).maybeSingle();
      if (error) throw error;
      return data ? { profile_text: data.profile_text, embedding: fromPgVector(data.embedding) } : null;
    },
    save: async (ideaId, row) => {
      const { error } = await db.from('startup_ideas').update({ profile_text: row.profile_text, embedding: toPgVector(row.embedding) }).eq('idea_id', ideaId);
      if (error) throw error;
    },
  };
}

export const searchCorpusTool = createTool({
  id: 'search-corpus',
  description:
    "Finds the 15 startups in Darb's list closest to an idea, by meaning (embeddings) and by keywords in English and Arabic. The list only orders startups: it never decides who is a competitor. With an idea_id, the idea's profile is saved once and reused, so the same idea always gives the same list.",
  inputSchema: z
    .object({
      idea_id: z.uuid().optional().describe("The idea's id (startup_ideas). Its saved profile is reused; the first time, it is made and saved."),
      idea_text: z.string().optional().describe('The idea in the founder’s words. Its profile is made first (one small OpenAI call).'),
      idea_profile: IdeaProfile.optional().describe('An idea profile that is already made.'),
    })
    .refine((input) => input.idea_id || input.idea_text?.trim() || input.idea_profile, { message: 'Give idea_id, idea_text or idea_profile.' }),
  outputSchema: z.object({
    idea_profile_text: z.string(),
    reused_saved_profile: z.boolean(),
    shortlist: z.array(
      z.object({
        rank: z.number(),
        startup_id: z.string(),
        name: z.string(),
        similarity: z.number(),
        keyword_matches: z.array(z.string()),
        meaning_rank: z.number(),
        keyword_rank: z.number().nullable(),
      }),
    ),
    candidates: z.array(Candidate),
  }),
  execute: async (input) => searchForIdea(input, liveCorpusDeps()),
});
