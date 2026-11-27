// Config: every usage limit in one place. Tools import these and enforce them in code,
// so a limit never depends on an agent following its instructions.
// Hard spending caps are set separately in the OpenAI and Tavily dashboards.
// The Competitor Agent's own caps (15 Tavily calls per idea) are in schemas/competitor.ts and
// lib/competitor-delegation.ts; the judge-call cap and time limit are set during testing.

// Longest wait for any OpenAI or Tavily call before the tool gives up and reports an error.
export const API_TIMEOUT_MS = 20_000;

// Tavily calls per idea (at most 15, searching and page reading together).
// Split: 10 for searching the web (Task 5), 5 for reading companies'
// own pages (Task 6). Starting values: the exact limits are confirmed during testing.
export const TAVILY_CALLS_PER_IDEA = 15;
export const TAVILY_SEARCH_CALLS = 10;
export const TAVILY_READ_CALLS = 5;

// The judge reads at most 25 companies per idea: the 15 closest from Darb's list plus up to 10 new ones
// from the web. So the web search stops once it has 10 new companies.
export const MAX_NEW_WEB_COMPANIES = 10;

// The Competitor Agent's judge: at most this many judge calls in one run, the 15 closest from Darb's
// list plus up to 10 new ones from the web,
// and at most this many at the same time, so a run stays within OpenAI's rate limits.
export const JUDGE_MAX_CALLS = 25;
// All of them at the same time: a run with web search judged 18 companies in two rounds (9.6 s); one round is
// enough, and 25 calls at once stay far within OpenAI's rate limit (500 requests a minute at the lowest tier).
export const JUDGE_PARALLEL_CALLS = JUDGE_MAX_CALLS;

// Competitor analyses per founder. A new idea and a what-if each count; follow-up questions and
// re-running an assessment already analysed today do not. Counted from assessments.analysed_at (Saudi time).
export const MAX_ANALYSES_PER_DAY = 5;
export const MAX_ANALYSES_PER_MONTH = 30;

// The overall time limit of one Competitor Agent run: after it, no new judge calls start.
// 240 s: find_competitors alone took 54 to 111 s, so 120 s left
// the judge 10 to 60 s.
export const RUN_TIME_LIMIT_MS = 240_000;
