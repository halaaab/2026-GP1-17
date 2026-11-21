// Tool: the Competitor Agent's whole run, in a fixed order, in code (Hala, 16 Nov 2026).
//   understand_idea   (Member 2) the idea profile, or the one clarification question
//   find_competitors  (Member 1) Darb's list, the web when needed, the four validity checks
//   judge_candidates  (Member 2) whether each valid company competes with the idea
//   finalize_result   (Member 2) the guardrails, the ranking and the saved Result
// The four steps are the same tools as before; only the model's turns between them are gone. The model always called
// them in this order anyway, and each turn cost a few seconds; it also sometimes skipped finalize_result or called
// find_competitors twice (Sprint 2 website test). The Result it returns is finalize_result's, checked by the
// delegation hook like before.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { findCompetitorsAgentTool } from './find-competitors';
import { finalizeResultTool } from './finalize-result';
import { judgeCandidatesTool } from './judge-candidates';
import { understandIdeaTool } from './understand-idea';

export const analyseIdeaTool = createTool({
  id: 'analyse_idea',
  description: "Runs the whole competitor analysis of the idea in this run and returns the checked result. Call it once, with an empty input.",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const run = <T>(tool: { execute?: (input: never, context: never) => Promise<T> }) => tool.execute!({} as never, context as never);
    const understood = (await run(understandIdeaTool)) as { ready?: boolean };
    // Only an idea that is ready is searched; otherwise finalize_result returns the question, the limit or the failure.
    if (understood?.ready) {
      try {
        await run(findCompetitorsAgentTool);
        await run(judgeCandidatesTool);
      } catch (error) {
        console.error('The competitor search failed:', error);
      }
    }
    return run(finalizeResultTool);
  },
});
