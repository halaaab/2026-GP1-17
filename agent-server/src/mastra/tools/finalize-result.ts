// Tool: the Competitor Agent's last step. It builds the Result in code and returns it.
// Only this tool's output reaches the Conversational Agent (lib/competitor-delegation.ts), never the agent's own text,
// so no competitor, label, score or status can be invented or changed by a model on the way back.
//
// Member 1's part (find-competitors) runs before it; the judge and scores (Member 2) are not connected yet, so the
// result still has no competitors and the note "capability_pending".
// Later it will apply the guardrails (validity checks, policy gate, ranking; design §9, §10) to what the agent found.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { discoveryResult, fallbackResult, pendingResult } from '../lib/competitor-result';
import { Handoff, Result } from '../schemas/competitor';

// Set by the delegation hook before the Competitor Agent starts (lib/competitor-delegation.ts).
export const HANDOFF_KEY = 'competitorHandoff';
export const STARTED_AT_KEY = 'competitorStartedAt';
// Set by find-competitors (tools/find-competitors.ts). Defined here so the two tools do not import each other.
export const FOUND_KEY = 'competitorFound';

type RequestContextLike = { get: (key: string) => unknown };
type ToolContextLike = {
  requestContext?: RequestContextLike;
  tracingContext?: { currentSpan?: { traceId?: string } };
};

export const finalizeResultTool = createTool({
  id: 'finalize_result',
  description: 'Ends the competitor analysis and returns the checked result. Call it exactly once, as your last step.',
  inputSchema: z.object({}),
  outputSchema: Result,
  execute: async (_input, context) => {
    const ctx = context as ToolContextLike | undefined;
    const startedAt = Number(ctx?.requestContext?.get(STARTED_AT_KEY)) || Date.now();
    const run = { durationMs: Date.now() - startedAt, traceId: ctx?.tracingContext?.currentSpan?.traceId ?? null };

    // The handoff was already checked by the delegation hook; it is checked again here, in case the tool is run another way.
    const handoff = Handoff.safeParse(ctx?.requestContext?.get(HANDOFF_KEY));
    if (!handoff.success) return fallbackResult(null, run);
    // What find-competitors (Member 1, Task 11) found in this run, if it ran. The judge (Member 2) is not connected
    // yet, so no competitor is shown: the result carries the Tavily calls, a failed-search note or a clarification.
    const found = ctx?.requestContext?.get(FOUND_KEY) as Parameters<typeof discoveryResult>[1] | undefined;
    return found ? discoveryResult(handoff.data, found, run) : pendingResult(handoff.data, run);
  },
});
