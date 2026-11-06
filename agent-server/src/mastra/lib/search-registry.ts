// The code guard: during one analysis, every startup that similarity_search really returned is recorded here,
// in the request context the analysis shares. finalize_competitors then accepts only startups from this record,
// with the record's own name, description and score, so the model cannot add, rename or re-score a competitor.
import type { StartupCandidate } from '../contracts';

const REGISTRY_KEY = 'darb_search_results';

type ContextLike = { requestContext?: { get: (key: string) => unknown; set: (key: string, value: unknown) => void } };

export function recordSearchResults(context: unknown, candidates: StartupCandidate[]): void {
  const requestContext = (context as ContextLike)?.requestContext;
  if (!requestContext) return;
  const registry = (requestContext.get(REGISTRY_KEY) as Map<string, StartupCandidate> | undefined) ?? new Map();
  for (const candidate of candidates) {
    const existing = registry.get(candidate.startup_id);
    // A startup found by several searches keeps its best score.
    if (!existing || candidate.similarity > existing.similarity) registry.set(candidate.startup_id, candidate);
  }
  requestContext.set(REGISTRY_KEY, registry);
}

// null when there is no record (for example a tool run by hand in Studio).
export function getSearchRegistry(context: unknown): Map<string, StartupCandidate> | null {
  const value = (context as ContextLike)?.requestContext?.get(REGISTRY_KEY);
  return value instanceof Map ? (value as Map<string, StartupCandidate>) : null;
}

// True when the startups found so far include fewer than `needed` strong matches (score >= threshold).
export function needsWebSearch(context: unknown, threshold: number, needed: number): boolean {
  const registry = getSearchRegistry(context);
  if (!registry) return false;
  const strong = [...registry.values()].filter((c) => c.source === 'dataset' && c.similarity >= threshold).length;
  return strong < needed;
}
