// What one Competitor Agent run has gathered so far, shared by its capabilities (tools) through the request context.
// The delegation hook starts a fresh one for every run (lib/competitor-delegation.ts), so nothing leaks between runs,
// and finalize_result builds the Result from it in code. The model only ever sees short summaries, never this state.
//
//   Understand  sets profile, ideaEmbedding, and clarification when the idea is too vague to search
//   Discover / Identify / Validate (Member 1) add candidates, count tavilyCalls, raise notes and log a "discover" step
//   Judge       adds judged answers and counts judgeCalls
import type { Candidate, IdeaProfile, JudgeOutput, NoteCode, RunLogStep } from '../schemas/competitor';
import type { Clarification } from './understand';

export const RUN_STATE_KEY = 'competitorRunState';

export type RunState = {
  profile: IdeaProfile | null;
  // The embedding of the structured profile (also saved in startup_ideas.embedding), for the corpus search.
  ideaEmbedding: number[] | null;
  // Set when the idea lacks the problem or the offering: finalize_result then asks this one question.
  clarification: Clarification | null;
  candidates: Map<string, Candidate>; // by candidate_key
  judged: Map<string, JudgeOutput>; // by candidate_key
  judgeCalls: number;
  tavilyCalls: number;
  notes: Set<NoteCode>;
  steps: RunLogStep[];
};

export function newRunState(): RunState {
  return {
    profile: null,
    ideaEmbedding: null,
    clarification: null,
    candidates: new Map(),
    judged: new Map(),
    judgeCalls: 0,
    tavilyCalls: 0,
    notes: new Set(),
    steps: [],
  };
}

type RequestContextLike = { get: (key: string) => unknown; set: (key: string, value: unknown) => void };

// This run's state. Outside a delegation (for example running a tool by hand in Studio) a new empty one is started.
export function getRunState(requestContext: RequestContextLike | undefined): RunState {
  const existing = requestContext?.get(RUN_STATE_KEY) as RunState | undefined;
  if (existing) return existing;
  const state = newRunState();
  requestContext?.set(RUN_STATE_KEY, state);
  return state;
}

// Records one capability step for the run log (ids, counts and codes only, never founder text).
export function logStep(state: RunState, step: RunLogStep): void {
  state.steps.push(step);
}
