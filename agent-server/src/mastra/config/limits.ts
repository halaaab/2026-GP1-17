// Config: every usage limit in one place. Tools import these and enforce them in code,
// so a limit never depends on an agent following its instructions.
// Hard spending caps are set separately in the OpenAI and Tavily dashboards.

// Most tool calls the Competitor Agent may make in one analysis.
export const MAX_TOOL_STEPS = 12;

// similarity_search: how many startups one search may return.
export const DEFAULT_SIMILARITY_K = 10;
export const MAX_SIMILARITY_K = 50;

// web_search: calls per analysis, queries per call, and results Tavily returns for each query.
export const MAX_WEB_SEARCH_CALLS = 2;
export const MAX_WEB_QUERIES = 3;
export const MAX_RESULTS_PER_QUERY = 5;

// extract_and_verify_profile: pages opened per analysis, companies taken from one page, and page text kept.
export const MAX_PAGES_PER_ANALYSIS = 4;
export const MAX_PROFILES_PER_PAGE = 5;
export const MAX_PAGE_CHARS = 15_000;

// embed-startups script: how many startups are sent to OpenAI in one request.
export const EMBED_BATCH_SIZE = 100;

// Longest wait for any OpenAI or Tavily call before the tool gives up and reports an error.
export const API_TIMEOUT_MS = 20_000;

// Competitor analyses one founder may run per day, counted in Supabase by delegate_competitor_analysis.
export const MAX_ANALYSES_PER_DAY = 5;
