// Config: the models and scoring settings every agent and tool uses, kept in one place.
// Usage limits (steps, results, timeouts, daily analyses) live in limits.ts.

export const CHAT_MODEL = 'openai/gpt-4o-mini';

// The startups and every search query must use the same model.
// Changing it means re-embedding all startups.
export const EMBEDDING_MODEL = 'text-embedding-3-small';

// Placeholder until calibrated with the sector-share method.
export const SIMILARITY_THRESHOLD = 0;

export const MAX_COMPETITORS = 3;
