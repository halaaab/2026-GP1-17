// Config: every usage limit in one place. Tools import these and enforce them in code,
// so a limit never depends on an agent following its instructions.
// Hard spending caps are set separately in the OpenAI and Tavily dashboards.
// The Competitor Agent's own caps (15 Tavily calls per idea, design §5) are in schemas/competitor.ts and
// lib/competitor-delegation.ts; the judge-call cap and time limit are set during testing (design §16).

// Longest wait for any OpenAI or Tavily call before the tool gives up and reports an error.
export const API_TIMEOUT_MS = 20_000;

// The Competitor Agent's judge (design §9, §12): at most this many judge calls in one run (about 20 candidates per idea),
// and at most this many at the same time, so a run stays within OpenAI's rate limits.
export const JUDGE_MAX_CALLS = 20;
export const JUDGE_PARALLEL_CALLS = 5;

// Competitor analyses per founder (design §12). A new idea and a what-if each count; follow-up questions and
// re-running an assessment already analysed today do not. Counted from assessments.analysed_at (Saudi time).
export const MAX_ANALYSES_PER_DAY = 5;
export const MAX_ANALYSES_PER_MONTH = 30;

// The overall time limit of one Competitor Agent run: after it, no new judge calls start (design §12).
export const RUN_TIME_LIMIT_MS = 120_000;
