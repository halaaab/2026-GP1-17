// Builds the Competitor Agent's Result in code. For now (the foundation), no capability is built yet,
// so every run returns an empty result with the note "capability_pending". The guardrails that will later
// check, rank and gate competitors (design §9, §10) belong here too.
import { Result, type Handoff, type IdeaProfile, type NoteCode } from '../schemas/competitor';

// The idea profile from what the founder stated, before the Understand capability exists.
// Stated facts keep origin "stated"; everything else is "unknown", never a guess.
export function profileFromKnownFacts(handoff: Pick<Handoff, 'known_facts'> | null): IdeaProfile {
  const facts = handoff?.known_facts ?? {};
  const part = (value: string | undefined) => (value ? { value, origin: 'stated' as const } : { value: null, origin: 'unknown' as const });
  return {
    problem: part(facts.problem),
    customer: part(facts.customer),
    offering: part(facts.offering),
    market: part(facts.market),
    sector: { isic_section: null, isic_division: null },
    business_model: null,
    keywords_en: [],
    keywords_ar: [],
  };
}

type RunInfo = { durationMs: number; traceId: string | null; tavilyCalls?: number };

function emptyResult(handoff: Handoff | null, notes: NoteCode[], status: Result['status'], run: RunInfo, clarification?: Result['clarification']): Result {
  return Result.parse({
    status,
    ...(clarification ? { clarification } : {}),
    idea_profile: profileFromKnownFacts(handoff),
    competitors: [],
    iss: null,
    iss_basis: null,
    market_level: null,
    notes,
    usage: { tavily_calls: run.tavilyCalls ?? 0, duration_ms: Math.max(0, Math.round(run.durationMs)), trace_id: run.traceId },
  });
}

// The foundation's answer to every valid handoff.
export function pendingResult(handoff: Handoff, run: RunInfo): Result {
  return emptyResult(handoff, ['capability_pending'], 'complete', run);
}

// After Member 1's part has run (find-competitors, Task 11), before the judge exists: the valid companies are in the
// trace, but none is shown as a competitor yet, so the note stays "capability_pending". A web search that failed
// adds "web_search_failed"; an idea missing its problem or offering returns the clarification question instead.
export function discoveryResult(
  handoff: Handoff,
  found: { status: 'complete' | 'partial' | 'needs_clarification'; clarification?: { question: string; missing_field: 'problem' | 'offering' }; notes: NoteCode[]; tavily_calls: number },
  run: RunInfo,
): Result {
  const withCalls = { ...run, tavilyCalls: found.tavily_calls };
  if (found.status === 'needs_clarification' && found.clarification) {
    return emptyResult(handoff, [], 'needs_clarification', withCalls, found.clarification);
  }
  return emptyResult(handoff, ['capability_pending', ...found.notes], found.notes.length ? 'partial' : 'complete', withCalls);
}

// Used when a run did not return a valid Result: still a valid Result, never a crash (design §12).
export function fallbackResult(handoff: Handoff | null, run: RunInfo): Result {
  return emptyResult(handoff, ['analysis_incomplete'], 'partial', run);
}
