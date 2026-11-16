// Tool (Task 11): Member 1's whole part in one step: Darb's list, the web when needed, a clean list of companies,
// and the four validity checks, within 15 Tavily calls (lib/find-competitors.ts).
//   - In the Competitor Agent, it uses the handoff the delegation hook checked (lib/competitor-delegation.ts), never
//     what the model passes, and leaves its result for finalize_result. The model's input is used only when the
//     agent is run alone in Studio's Agents tab, where there is no checked handoff.
//   - In Studio's Tools tab, it can be run alone with an idea (and web "off" or "always" for TC-11.14).
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { findCompetitors, type FindInput, type FindOutput } from '../lib/find-competitors';
import { getSupabase } from '../lib/supabase';
import { Handoff, IdeaProfile } from '../schemas/competitor';
import { FOUND_KEY, HANDOFF_KEY } from './finalize-result';
import { liveCorpusDeps } from './search-corpus';
import { liveWebDeps } from './search-web';
import { liveValidateDeps } from './validate-candidate';

type RequestContextLike = { get: (key: string) => unknown; set: (key: string, value: unknown) => void };

export const findCompetitorsTool = createTool({
  id: 'find-competitors',
  description:
    "Finds the valid competitors of the idea in the handoff: Darb's startup list first, the web only when the list gives fewer than 3 valid, close startups, then the four validity checks (real, offering, active, Saudi reach). Returns the Confirmed and Likely companies for the judge. Call it once, with the handoff's idea_text, language, founder_startup and references.",
  inputSchema: z.object({
    idea_text: z.string().optional().describe('The idea. In a real chat, the checked handoff is used instead.'),
    idea_id: z.uuid().optional(),
    language: z.enum(['ar', 'en']).optional(),
    idea_profile: IdeaProfile.optional().describe('Studio only: a fixed profile (tests/fixtures/dev-ideas.json).'),
    founder_startup: z.object({ name: z.string().optional(), website: z.string().optional() }).optional(),
    references: z.array(z.string()).optional(),
    web: z.enum(['auto', 'off', 'always']).optional().describe('auto (default): the web rule. off / always: for TC-11.14.'),
    dry_run: z.boolean().optional().describe('Studio only: true = the validation results are not saved to startups.'),
  }),
  execute: async (input, context): Promise<FindOutput> => {
    const ctx = (context as { requestContext?: RequestContextLike } | undefined)?.requestContext;
    const handoff = Handoff.safeParse(ctx?.get(HANDOFF_KEY));
    const find: FindInput | null = handoff.success
      ? {
          idea_text: [handoff.data.idea_text, handoff.data.clarification ? `${handoff.data.clarification.question} ${handoff.data.clarification.answer}` : ''].filter(Boolean).join('\n'),
          idea_id: handoff.data.idea_id,
          language: handoff.data.language,
          founder_startup: handoff.data.founder_startup,
          references: handoff.data.references,
        }
      : input.idea_text?.trim() || input.idea_profile
        ? { ...input, idea_text: input.idea_text ?? '' }
        : null;
    if (!find) throw new Error('Give idea_text or idea_profile (or run it inside the Competitor Agent).');

    const db = getSupabase();
    const out = await findCompetitors(find, {
      corpus: liveCorpusDeps(),
      web: liveWebDeps(),
      validate: input.dry_run && !handoff.success ? { ...liveValidateDeps(), save: undefined } : liveValidateDeps(),
      storedChecks: async (ids) => {
        const { data, error } = await db.from('startups').select('startup_id, validation_status, evidence_status, validated_at').in('startup_id', ids);
        if (error) throw error;
        return new Map(data.map((r) => [r.startup_id, { validation_status: r.validation_status, evidence_status: r.evidence_status, validated_at: r.validated_at }]));
      },
    });
    ctx?.set(FOUND_KEY, out);
    return out;
  },
});
