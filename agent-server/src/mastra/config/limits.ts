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
