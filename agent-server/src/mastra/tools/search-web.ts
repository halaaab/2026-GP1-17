// Tool (Task 5): searches the web for competitors outside Darb's list (lib/search-web.ts).
// The AI writes the queries from the idea's profile only; code checks them; at most 10 Tavily calls.
// Registered in Mastra so it can be run alone in Studio's Tools tab.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { embedTexts, toPgVector } from '../lib/embeddings';
import { buildIdeaProfile, profileText } from '../lib/idea-profile';
import { openAiQueryWriter, searchWeb, tavilySearch, type SearchWebDeps } from '../lib/search-web';
import { getSupabase } from '../lib/supabase';
import { Candidate, IdeaProfile } from '../schemas/competitor';

// The idea's profile text: the saved one (idea_id), the one given, or made from the text and saved.
async function ideaProfileText(input: { idea_id?: string; idea_text?: string; idea_profile?: IdeaProfile }): Promise<string> {
  const db = getSupabase();
  if (input.idea_id) {
    const { data, error } = await db.from('startup_ideas').select('profile_text').eq('idea_id', input.idea_id).maybeSingle();
    if (error) throw error;
    if (data?.profile_text) return data.profile_text;
  }
  const profile = input.idea_profile ?? (input.idea_text?.trim() ? await buildIdeaProfile(input.idea_text) : null);
  if (!profile) throw new Error('Give idea_text or idea_profile (this idea has no saved profile yet).');
  const text = profileText(profile);
  if (input.idea_id) {
    const [vector] = await embedTexts([text]);
    const { error } = await db.from('startup_ideas').update({ profile_text: text, embedding: toPgVector(vector) }).eq('idea_id', input.idea_id);
    if (error) throw error;
  }
  return text;
}

// The real query writer and Tavily search, shared with find-competitors (Task 11).
export function liveWebDeps(): SearchWebDeps {
  let search: SearchWebDeps['search'];
  try {
    search = tavilySearch();
  } catch (error) {
    search = async () => {
      throw error; // no Tavily key: the search becomes "partial" with web_search_failed
    };
  }
  return { writeQueries: openAiQueryWriter(), search };
}

export const searchWebTool = createTool({
  id: 'search-web',
  description:
    "Searches the web for competitors outside Darb's list, with Tavily: the AI writes short generic queries from the idea's profile (never the founder's own words), in Saudi Arabia, preferred Saudi sources first, excluded sites never used, at most 10 Tavily calls. Results are cleaned into companies; companies already found are not counted as new.",
  inputSchema: z
    .object({
      idea_id: z.uuid().optional().describe("The idea's id: its saved profile is used."),
      idea_text: z.string().optional().describe('The idea in the founder’s words (only used to make the profile and to check no query repeats it).'),
      idea_profile: IdeaProfile.optional(),
      known_domains: z.array(z.string()).optional().describe('Websites of companies already found, e.g. from search-corpus.'),
      founder_startup: z.object({ name: z.string().optional(), website: z.string().optional() }).optional(),
      references: z.array(z.string()).optional(),
    })
    .refine((i) => i.idea_id || i.idea_text?.trim() || i.idea_profile, { message: 'Give idea_id, idea_text or idea_profile.' }),
  outputSchema: z.object({
    status: z.enum(['complete', 'partial']),
    notes: z.array(z.literal('web_search_failed')),
    stopped_because: z.enum(['nothing_new', 'enough_companies', 'call_limit', 'no_queries']),
    queries: z.array(z.object({ round: z.number(), text: z.string(), language: z.enum(['ar', 'en']) })),
    dropped_queries: z.array(z.object({ text: z.string(), reason: z.string() })),
    tavily_calls: z.number(),
    candidates: z.array(Candidate),
    evidence: z.array(z.object({ url: z.string(), domain: z.string(), kind: z.enum(['government', 'directory', 'news', 'social', 'reference']), title: z.string().nullable(), published_date: z.string().optional() })),
    leads: z.array(z.string()),
    removed: z.array(z.object({ name: z.string().nullable(), url: z.string(), reason: z.string() })),
  }),
  execute: async (input) => {
    const profile_text = await ideaProfileText(input);
    return searchWeb(
      { profile_text, founder_text: input.idea_text, known_domains: input.known_domains, founder_startup: input.founder_startup, references: input.references },
      liveWebDeps(),
    );
  },
});
