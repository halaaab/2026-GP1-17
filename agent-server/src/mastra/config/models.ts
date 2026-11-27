// Config: the models every agent and tool uses, kept in one place.
// Usage limits (timeouts) live in limits.ts.

export const CHAT_MODEL = 'openai/gpt-4o-mini';

// The startups and every idea must use the same embedding model.
// Changing it means re-embedding all startups.
export const EMBEDDING_MODEL = 'text-embedding-3-small';

// The structured idea profile (lib/idea-profile.ts): OpenAI's smaller model, temperature 0.
export const PROFILE_MODEL = 'gpt-4o-mini';

// The judge (lib/judge.ts): one candidate per call, temperature 0. Starts with the smaller model;
// the stronger one replaces it only if it is clearly more accurate on the development set.
export const JUDGE_MODEL = 'gpt-4o-mini';
