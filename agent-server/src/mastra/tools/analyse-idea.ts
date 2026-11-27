// Tool: the Competitor Agent's whole run, in a fixed order, in code.
// understand_idea the idea profile, or the one clarification question
// find_competitors Darb's list, the web when needed, the four validity checks
// judge_candidates whether each valid company competes with the idea
// finalize_result the guardrails, the ranking and the saved Result
// The four steps are the same tools as before; only the model's turns between them are gone. The model always called
// them in this order anyway, and each turn cost a few seconds; it also sometimes skipped finalize_result or called
// find_competitors twice. The Result it returns is finalize_result's, checked by the
// delegation hook like before.
// Each step is also its own row in Studio's trace view, under analyse_idea, with its own time (observability only).
import { SpanType, type TracingContext } from '@mastra/core/observability';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { findCompetitorsAgentTool } from './find-competitors';
import { finalizeResultTool, HANDOFF_KEY } from './finalize-result';
import { judgeCandidatesTool } from './judge-candidates';
import { understandIdeaTool } from './understand-idea';
import { reportProgress } from '../lib/progress';
import { Handoff } from '../schemas/competitor';

type Step = { id: string; execute?: (input: never, context: never) => Promise<unknown> };

// Runs one step inside its own trace span, a child of analyse_idea's span. Nothing about the run changes: the step
// gets the same context (only the span it reports under is its own), its result is returned as it is, and an error
// is passed on as before. The span shows what the step read (the handoff) and what it returned, so Studio's trace view
// has each step's input and output; Mastra's SensitiveDataFilter still runs on every span (index.ts).
async function runStep<T>(step: Step, context: unknown, input: unknown): Promise<T> {
  const parent = (context as { tracingContext?: TracingContext } | undefined)?.tracingContext?.currentSpan;
  const span = parent?.createChildSpan({ type: SpanType.GENERIC, name: step.id, input });
  const stepContext = span ? { ...(context as object), tracingContext: { currentSpan: span } } : context;
  try {
    const result = (await step.execute!({} as never, stepContext as never)) as T;
    span?.end({ output: result });
    return result;
  } catch (error) {
    span?.error({ error: error instanceof Error ? error : new Error(String(error)) });
    throw error;
  }
}

export const analyseIdeaTool = createTool({
  id: 'analyse_idea',
  description: "Runs the whole competitor analysis of the idea in this run and returns the checked result. Call it once, with an empty input.",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    // What Darb is doing now, for the founder's screen (lib/progress.ts); find_competitors reports its own steps.
    const handoff = Handoff.safeParse((context as { requestContext?: { get: (k: string) => unknown } } | undefined)?.requestContext?.get(HANDOFF_KEY));
    // Each step reads the handoff from the run's context: that is the input its span shows.
    const run = <T>(step: Step) => runStep<T>(step, context, handoff.success ? { handoff: handoff.data } : {});
    const progress = (step: Parameters<typeof reportProgress>[1]) => reportProgress(handoff.success ? handoff.data.assessment_id : null, step);
    progress('understanding');
    const understood = await run<{ ready?: boolean }>(understandIdeaTool);
    // Only an idea that is ready is searched; otherwise finalize_result returns the question, the limit or the failure.
    if (understood?.ready) {
      try {
        await run(findCompetitorsAgentTool);
        progress('comparing');
        await run(judgeCandidatesTool);
      } catch (error) {
        console.error('The competitor search failed:', error);
      }
    }
    progress('finishing');
    return run(finalizeResultTool);
  },
});
