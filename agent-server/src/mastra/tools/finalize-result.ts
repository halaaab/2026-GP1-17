// Tool: the Competitor Agent's last step. It builds the Result in code and returns it.
// Only this tool's output reaches the Conversational Agent (lib/competitor-delegation.ts), never the agent's own text,
// so no competitor, label, score or status can be invented or changed by a model on the way back.
//
// Foundation: no capability is built yet, so it always returns the "capability_pending" result.
// Later it will apply the guardrails (validity checks, policy gate, ranking; design §9, §10) to what the agent found.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { fallbackResult, pendingResult } from '../lib/competitor-result';
import { Handoff, Result } from '../schemas/competitor';

// Set by the delegation hook before the Competitor Agent starts (lib/competitor-delegation.ts).
export const HANDOFF_KEY = 'competitorHandoff';
export const STARTED_AT_KEY = 'competitorStartedAt';

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
    return pendingResult(handoff.data, run);
  },
});
