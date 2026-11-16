// Config: every usage limit in one place. Tools import these and enforce them in code,
// so a limit never depends on an agent following its instructions.
// Hard spending caps are set separately in the OpenAI and Tavily dashboards.
// The Competitor Agent's own caps (15 Tavily calls per idea, design §5) are in schemas/competitor.ts and
// lib/competitor-delegation.ts; the judge-call cap and time limit are set during testing (design §16).

// Longest wait for any OpenAI or Tavily call before the tool gives up and reports an error.
export const API_TIMEOUT_MS = 20_000;

// Tavily calls per idea (design §5 and §12: at most 15, searching and page reading together).
// Split approved by Hala on 14 Nov 2026: 10 for searching the web (Task 5), 5 for reading companies'
// own pages (Task 6). Starting values: the exact limits are confirmed during testing (design §16).
export const TAVILY_CALLS_PER_IDEA = 15;
export const TAVILY_SEARCH_CALLS = 10;
export const TAVILY_READ_CALLS = 5;

// The judge reads at most 25 companies per idea: the 15 closest from Darb's list plus up to 10 new ones
// from the web (design §3). So the web search stops once it has 10 new companies.
export const MAX_NEW_WEB_COMPANIES = 10;

// The Competitor Agent's judge (design §9, §12): at most this many judge calls in one run, the 15 closest from Darb's
// list plus up to 10 new ones from the web (explainer §3),
// and at most this many at the same time, so a run stays within OpenAI's rate limits.
export const JUDGE_MAX_CALLS = 25;
// 10 at the same time, not 5 (Hala, 16 Nov 2026): a run judges about 6 to 12 companies, so one batch instead of two.
export const JUDGE_PARALLEL_CALLS = 10;

// Competitor analyses per founder (design §12). A new idea and a what-if each count; follow-up questions and
// re-running an assessment already analysed today do not. Counted from assessments.analysed_at (Saudi time).
export const MAX_ANALYSES_PER_DAY = 5;
export const MAX_ANALYSES_PER_MONTH = 30;

// The overall time limit of one Competitor Agent run: after it, no new judge calls start (design §12).
// 240 s (Hala, 16 Nov 2026): find_competitors alone took 54 to 111 s in the Task 11 runs (D1, D6, N1), so 120 s left
// the judge 10 to 60 s.
export const RUN_TIME_LIMIT_MS = 240_000;
