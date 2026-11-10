// The checks around every delegation from the Conversational Agent to the Competitor Agent.
// They use Mastra's delegation hooks (supervisor pattern, @mastra/core 1.80):
//
//   onDelegationStart     before the Competitor Agent runs: checks the handoff the supervisor wrote against the
//                         Handoff schema, and adds assessment_id and idea_id from the server, never from the model.
//   messageFilter         the Competitor Agent sees only the handoff, not the founder's chat (design §2).
//   onDelegationComplete  after it runs: takes the Result from finalize_result, checks it with the Result schema
//                         (or builds a valid fallback), and adds the notes as sentences in the founder's language.
//                         The supervisor sees only this, never the Competitor Agent's own text.
import type { DelegationCompleteContext, DelegationConfig, DelegationStartContext, DelegationStartResult } from '@mastra/core/agent';
import { z } from 'zod';
import { Handoff, Result } from '../schemas/competitor';
import { HANDOFF_KEY, STARTED_AT_KEY } from '../tools/finalize-result';
import { getUserId, loadOwnedAssessment } from './assessments';
import { fallbackResult } from './competitor-result';
import { noteSentences } from './competitor-notes';

export const COMPETITOR_AGENT_ID = 'competitor-agent';

// Most steps the Competitor Agent may take in one run. The foundation needs 2 (finalize_result, then a short reply).
export const COMPETITOR_MAX_STEPS = 4;

// What the supervisor writes. The ids are left out: the server adds them.
export const SupervisorHandoff = Handoff.omit({ assessment_id: true, idea_id: true });

// What the supervisor sees after a delegation.
export type DelegationReply = { result: Result; note_sentences: string[] };

// Handoffs of the delegations still running, by tool call id (both hooks receive it).
const running = new Map<string, { handoff: Handoff; startedAt: number }>();

// The JSON object inside the supervisor's message (it may wrap it in a code block).
export function jsonInside(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

const reject = (reason: string): DelegationStartResult => ({ proceed: false, rejectionReason: reason });

export async function onCompetitorDelegationStart(ctx: DelegationStartContext): Promise<DelegationStartResult | void> {
  if (ctx.primitiveId !== COMPETITOR_AGENT_ID) return;

  const assessmentId = ctx.requestContext.get('assessmentId');
  const userId = getUserId({ requestContext: ctx.requestContext }) ?? ctx.resourceId ?? null;
  if (typeof assessmentId !== 'string' || !assessmentId || !userId) {
    return reject('No assessment has been started for this conversation, so the analysis cannot run.');
  }

  const written = SupervisorHandoff.safeParse(jsonInside(ctx.prompt));
  if (!written.success) {
    return reject(
      `The handoff is not valid. Send one JSON object with mode, language, idea_text and only the optional fields that apply.\n${z.prettifyError(written.error)}`,
    );
  }

  const assessment = await loadOwnedAssessment(assessmentId, userId);
  if (!assessment) return reject('That assessment does not exist for this founder.');

  const handoff = Handoff.parse({ ...written.data, assessment_id: assessment.assessment_id, idea_id: assessment.idea_id });
  const startedAt = Date.now();
  running.set(ctx.toolCallId, { handoff, startedAt });
  ctx.requestContext.set(HANDOFF_KEY, handoff);
  ctx.requestContext.set(STARTED_AT_KEY, startedAt);

  return {
    proceed: true,
    modifiedPrompt: `Handoff:\n${JSON.stringify(handoff)}`,
    modifiedMaxSteps: COMPETITOR_MAX_STEPS,
  };
}

export function onCompetitorDelegationComplete(ctx: DelegationCompleteContext): { resultText: string } | void {
  if (ctx.primitiveId !== COMPETITOR_AGENT_ID) return;
  const started = running.get(ctx.toolCallId);
  running.delete(ctx.toolCallId);
  if (!started) return; // the delegation was rejected before it started: keep the rejection message

  const fromTool = ctx.result?.subAgentToolResults?.find((r) => r.toolName === 'finalize_result' && !r.isError);
  const checked = Result.safeParse(fromTool?.result);
  const result = checked.success
    ? checked.data
    : fallbackResult(started.handoff, { durationMs: Date.now() - started.startedAt, traceId: null });

  const reply: DelegationReply = { result, note_sentences: noteSentences(result.notes, started.handoff.language) };
  return { resultText: JSON.stringify(reply) };
}

export const competitorDelegation: DelegationConfig = {
  onDelegationStart: onCompetitorDelegationStart,
  onDelegationComplete: onCompetitorDelegationComplete,
  messageFilter: ({ primitiveId, messages }) => (primitiveId === COMPETITOR_AGENT_ID ? [] : messages),
  // A failing check stops the delegation instead of letting an unchecked handoff or result through.
  hookErrorStrategy: 'throw',
};
