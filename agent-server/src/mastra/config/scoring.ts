// Config: the numbers behind the ISS, the market level and the ranking (design §10), in one place.
// They are starting values: the design sets them during testing on the development set (§16), so change them here
// only after comparing on that set, and note the change in the report.

// How much each judge answer counts towards a competitor's similarity score (0–100).
// Problem weighs most, then customer, then offering (design §10). Business model and geography are not scored.
export const ANSWER_WEIGHTS = { problem: 0.5, customer: 0.3, offering: 0.2 } as const;

// Points for each answer: same = full points, partly = half, anything else = none (design §10).
export const ANSWER_POINTS = { same: 1, partly: 0.5, different: 0, unknown: 0, conflicting: 0 } as const;

// The ISS combines the top 3 competitors with the closest counting most, so an exact clone is never hidden by an average.
export const ISS_RANK_WEIGHTS = [0.6, 0.25, 0.15] as const;

// A Likely competitor (one source only, or weak Saudi signals) counts slightly less than a Confirmed one.
export const LIKELY_FACTOR = 0.9;

// Market level (Definition 4): the number of valid direct competitors, one per company. Below COMPETITIVE it is "open".
export const MARKET_LEVEL_MIN = { competitive: 3, crowded: 6 } as const;

// The words shown next to the ISS (explainer §9: "Higher similarity"). The website uses the same cut-offs
// (frontend/pages/founder/chatbot/panel.js, ISS_BANDS): change both together.
export const ISS_BANDS = { higher: 70, moderate: 40 } as const;

// Most competitors shown to the founder (design §10).
export const MAX_SHOWN = 3;
