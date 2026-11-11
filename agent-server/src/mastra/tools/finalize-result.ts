// Tool: the Competitor Agent's last step. It builds the Result in code and returns it.
// Only this tool's output reaches the Conversational Agent (lib/competitor-delegation.ts), never the agent's own text,
// so no competitor, label, score or status can be invented or changed by a model on the way back.
//
// It applies the guardrails (validity checks, policy gate, ranking, ISS, market level; design §9, §10,
// lib/competitor-policy.ts) to what the run gathered (lib/competitor-run.ts). Until a Discover step has run
// (not built yet), it returns the "capability_pending" result.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { applyPolicy, buildResult, clarificationResult, limitResult, type Judged } from '../lib/competitor-policy';
import { fallbackResult, pendingResult, profileFromKnownFacts } from '../lib/competitor-result';
import { getRunState, logStep } from '../lib/competitor-run';
import { saveResult } from '../lib/competitor-store';
import { Handoff, MAX_TAVILY_CALLS, Result } from '../schemas/competitor';

// Set by the delegation hook before the Competitor Agent starts (lib/competitor-delegation.ts).
export const HANDOFF_KEY = 'competitorHandoff';
export const STARTED_AT_KEY = 'competitorStartedAt';

type RequestContextLike = { get: (key: string) => unknown; set: (key: string, value: unknown) => void };
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

    const state = getRunState(ctx?.requestContext);
    const usage = () => ({
      tavily_calls: Math.min(state.tavilyCalls, MAX_TAVILY_CALLS),
      duration_ms: Math.max(0, Math.round(Date.now() - startedAt)),
      trace_id: run.traceId,
    });

    // The founder has used their analyses: nothing was searched.
    if (state.limitNote) return limitResult(state.profile ?? profileFromKnownFacts(handoff.data), state.limitNote, usage());
    // The idea could not be read (OpenAI failed): the analysis did not finish, and the founder can retry.
    if (state.steps.some((s) => s.capability === 'understand' && s.outcome === 'failed')) return fallbackResult(handoff.data, run);
    // The idea lacks the problem or the offering: ask the one question Understand chose (design §4, PBI 34).
    if (state.clarification && state.profile) return clarificationResult(state.profile, state.clarification, usage());

    // No search has run (Discover is not built yet): saying "no competitors found" would not be true.
    if (!state.steps.some((s) => s.capability === 'discover')) return pendingResult(handoff.data, run);

    const finalizeStarted = Date.now();
    const profile = state.profile ?? profileFromKnownFacts(handoff.data);
    const judged: Judged[] = [...state.judged.values()]
      .filter((j) => state.candidates.has(j.candidate_key))
      .map((j) => {
        const candidate = state.candidates.get(j.candidate_key)!;
        return { candidate, policy: applyPolicy(j, candidate, profile) };
      });

    try {
      const result = buildResult({
        handoff: handoff.data,
        profile,
        judged,
        runNotes: [...state.notes],
        usage: usage(),
      });
      // Saved for follow-up questions, the result screen, History and the report (design §11). A failed save is
      // logged, and the founder still sees the result.
      let saved = 'saved';
      try {
        await saveResult(handoff.data.assessment_id, result);
      } catch (error) {
        console.error('Saving the competitor result failed:', error);
        saved = 'save_failed';
      }
      logStep(state, { capability: 'guardrails', outcome: 'ok', duration_ms: Date.now() - finalizeStarted, detail: `shown=${result.competitors.length} ${saved}` });
      return result;
    } catch {
      logStep(state, { capability: 'guardrails', outcome: 'failed', duration_ms: Date.now() - finalizeStarted });
      return fallbackResult(handoff.data, run);
    }
  },
});
