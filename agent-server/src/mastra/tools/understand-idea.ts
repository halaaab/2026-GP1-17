// Tool: the Understand capability (design §4). Turns the founder's idea into the structured idea profile, keeps the
// facts they stated, and decides in code whether there is enough to search (problem and offering). When there is,
// it embeds the profile once and saves it on the idea (startup_ideas.embedding, design §16) for the corpus search.
// The agent sees only a short summary: whether it is ready, what is missing, and the search keywords.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { profileFromKnownFacts } from '../lib/competitor-result';
import { getRunState, logStep } from '../lib/competitor-run';
import { embedTexts, toPgVector } from '../lib/embeddings';
import { buildIdeaProfile, profileText } from '../lib/idea-profile';
import { nameIdea } from '../lib/idea-title';
import { getSupabase } from '../lib/supabase';
import { clarificationFor, understandText, withStatedFacts } from '../lib/understand';
import { Handoff, Origin } from '../schemas/competitor';
import { HANDOFF_KEY } from './finalize-result';

type RequestContextLike = { get: (key: string) => unknown; set: (key: string, value: unknown) => void };

// Saves the idea's embedding. A failure is only logged: the search can still use keywords.
async function saveEmbedding(ideaId: string, text: string): Promise<number[] | null> {
  try {
    const [embedding] = await embedTexts([text]);
    const { error } = await getSupabase().from('startup_ideas').update({ embedding: toPgVector(embedding) }).eq('idea_id', ideaId);
    if (error) throw error;
    return embedding;
  } catch {
    return null;
  }
}

export const understandIdeaTool = createTool({
  id: 'understand_idea',
  description:
    "Reads the founder's idea into a structured profile (problem, customer, offering, market) and says whether there is enough to search for competitors. Call it first.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    ready: z.boolean(),
    error: z.enum(['no_handoff', 'profile_failed', 'limit_reached']).optional(),
    missing_field: z.enum(['problem', 'offering']).optional(),
    origins: z.object({ problem: Origin, customer: Origin, offering: Origin, market: Origin }).optional(),
    isic_section: z.string().nullable().optional(),
    keywords_en: z.array(z.string()).optional(),
    keywords_ar: z.array(z.string()).optional(),
  }),
  execute: async (_input, context) => {
    const requestContext = (context as { requestContext?: RequestContextLike } | undefined)?.requestContext;
    const handoff = Handoff.safeParse(requestContext?.get(HANDOFF_KEY));
    if (!handoff.success) return { ready: false, error: 'no_handoff' as const };
    const state = getRunState(requestContext);
    const started = Date.now();
    // The founder has used their analyses: nothing is read or paid for.
    if (state.limitNote) return { ready: false, error: 'limit_reached' as const };

    let profile;
    try {
      profile = withStatedFacts(await buildIdeaProfile(understandText(handoff.data), { founderIdea: true }), handoff.data);
    } catch {
      // OpenAI failed: keep only what the founder stated, and let finalize_result say the analysis did not finish.
      state.profile = profileFromKnownFacts(handoff.data);
      logStep(state, { capability: 'understand', outcome: 'failed', duration_ms: Date.now() - started, detail: 'profile_failed' });
      return { ready: false, error: 'profile_failed' as const };
    }
    state.profile = profile;

    const clarification = clarificationFor(profile, handoff.data);
    state.clarification = clarification;
    if (!clarification) {
      // the conversation's formal name and the idea in the founder's language, written beside the search (not awaited:
      // the founder never waits for it). A what-if keeps the name of the analysis it varies.
      if (handoff.data.mode !== 'what_if') void nameIdea(handoff.data.idea_id, profile, handoff.data.language);
      state.ideaEmbedding = await saveEmbedding(handoff.data.idea_id, profileText(profile));
    }

    logStep(state, {
      capability: 'understand',
      outcome: 'ok',
      duration_ms: Date.now() - started,
      detail: clarification ? `needs_${clarification.missing_field}` : state.ideaEmbedding ? 'ready' : 'ready_embedding_failed',
    });

    return {
      ready: clarification === null,
      ...(clarification ? { missing_field: clarification.missing_field } : {}),
      origins: { problem: profile.problem.origin, customer: profile.customer.origin, offering: profile.offering.origin, market: profile.market.origin },
      isic_section: profile.sector.isic_section,
      keywords_en: profile.keywords_en,
      keywords_ar: profile.keywords_ar,
    };
  },
});
