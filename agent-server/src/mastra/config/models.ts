// Config: the models and scoring settings every agent and tool uses, kept in one place.
// Usage limits (steps, results, timeouts, daily analyses) live in limits.ts.

export const CHAT_MODEL = 'openai/gpt-4o-mini';

// The startups and every search query must use the same model.
// Changing it means re-embedding all startups.
export const EMBEDDING_MODEL = 'text-embedding-3-small';

// Noise floor (cosine similarity): a startup scoring below this is never a competitor.
// Calibrated on 5 Nov 2026 with the sector-share method: below 0.35, a startup's nearest neighbours share
// its sector 29% of the time, barely above the 21% of random pairs; from 0.35 up it is 49% and rising.
// Unrelated founder ideas scored 0.30-0.31 at the bottom, correct matches as low as 0.42.
// To confirm with the G2 retrieval test set.
export const SIMILARITY_THRESHOLD = 0.35;

// When to also search the web: if fewer than MAX_COMPETITORS dataset startups score at least this,
// Darb's dataset does not cover the idea well enough on its own. Code enforces it (similarity_search sets
// needs_web_search, and finalize_competitors will not finish until web_search has run).
export const WEB_SEARCH_THRESHOLD = 0.5;

export const MAX_COMPETITORS = 3;

// The structured idea profile (lib/idea-profile.ts): OpenAI's smaller model, temperature 0 (design §16).
export const PROFILE_MODEL = 'gpt-4o-mini';
