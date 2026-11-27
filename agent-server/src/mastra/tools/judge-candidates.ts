// Tool: the Judge capability. Judges the candidates found so far, one candidate per OpenAI call,
// and keeps the answers in the run state for finalize_result. The agent only sees a short summary, so it can decide
// what to do next (search more, validate, or finish) without being able to change an answer.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { JUDGE_MAX_CALLS, JUDGE_PARALLEL_CALLS, RUN_TIME_LIMIT_MS } from '../config/limits';
import { applyPolicy } from '../lib/competitor-policy';
import { profileFromKnownFacts } from '../lib/competitor-result';
import { getRunState, logStep } from '../lib/competitor-run';
import { judgeCandidate } from '../lib/judge';
import { Handoff, JudgeLabel } from '../schemas/competitor';
import { HANDOFF_KEY, STARTED_AT_KEY } from './finalize-result';

type RequestContextLike = { get: (key: string) => unknown; set: (key: string, value: unknown) => void };

export const judgeCandidatesTool = createTool({
  id: 'judge_candidates',
  description:
    'Judges whether each candidate found so far competes with the idea (same problem, customer and offering). Judges every candidate not judged yet, or only the given candidate_keys. Candidates that failed validation are skipped.',
  inputSchema: z.object({
    candidate_keys: z.array(z.string().min(1)).optional().describe('Only these candidates. Leave out to judge all new ones.'),
  }),
  outputSchema: z.object({
    judged: z.array(z.object({ candidate_key: z.string(), label: JudgeLabel, similarity_score: z.number().int() })),
    failed: z.number().int(),
    skipped_over_limit: z.number().int(),
    judge_calls_left: z.number().int(),
  }),
  execute: async (input, context) => {
    const requestContext = (context as { requestContext?: RequestContextLike } | undefined)?.requestContext;
    const state = getRunState(requestContext);
    const handoff = Handoff.safeParse(requestContext?.get(HANDOFF_KEY));
    const started = Date.now();
    const empty = { judged: [], failed: 0, skipped_over_limit: 0, judge_calls_left: JUDGE_MAX_CALLS - state.judgeCalls };
    if (!handoff.success) return empty;

    const profile = state.profile ?? profileFromKnownFacts(handoff.data);
    const wanted = input.candidate_keys ? new Set(input.candidate_keys) : null;
    const waiting = [...state.candidates.values()].filter(
      (c) =>
        !state.judged.has(c.candidate_key) &&
        (!wanted || wanted.has(c.candidate_key)) &&
        c.validation?.evidence_status !== 'unconfirmed', // never shown, so not worth a call
    );

    // The per-run judge-call cap, enforced in code.
    const room = Math.max(0, JUDGE_MAX_CALLS - state.judgeCalls);
    const toJudge = waiting.slice(0, room);
    let failed = 0;

    // The run's overall time limit: no new judge calls start after it.
    const runStarted = Number(requestContext?.get(STARTED_AT_KEY)) || started;
    let outOfTime = 0;
    for (let i = 0; i < toJudge.length; i += JUDGE_PARALLEL_CALLS) {
      if (Date.now() - runStarted > RUN_TIME_LIMIT_MS) {
        outOfTime = toJudge.length - i;
        state.notes.add('time_limit_reached');
        break;
      }
      const batch = toJudge.slice(i, i + JUDGE_PARALLEL_CALLS);
      state.judgeCalls += batch.length;
      const answers = await Promise.allSettled(
        batch.map((c) => judgeCandidate(profile, c, handoff.data.references ?? [], handoff.data.language)),
      );
      answers.forEach((a, j) => {
        if (a.status === 'fulfilled') state.judged.set(batch[j].candidate_key, a.value);
        else failed += 1; // that candidate is skipped; the run continues
      });
    }
    if (failed > 0) state.notes.add('judge_call_failed');

    const judged = toJudge
      .filter((c) => state.judged.has(c.candidate_key))
      .map((c) => {
        const policy = applyPolicy(state.judged.get(c.candidate_key)!, c, profile);
        return { candidate_key: c.candidate_key, label: policy.label, similarity_score: policy.similarity_score };
      });

    logStep(state, {
      capability: 'judge',
      outcome: toJudge.length === 0 ? 'skipped' : failed === toJudge.length ? 'failed' : 'ok',
      duration_ms: Date.now() - started,
      detail: `judged=${judged.length} failed=${failed} over_limit=${waiting.length - toJudge.length} out_of_time=${outOfTime}`,
    });

    return {
      judged,
      failed,
      skipped_over_limit: waiting.length - toJudge.length + outOfTime,
      judge_calls_left: Math.max(0, JUDGE_MAX_CALLS - state.judgeCalls),
    };
  },
});
