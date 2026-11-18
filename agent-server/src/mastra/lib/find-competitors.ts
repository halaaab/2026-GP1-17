// Task 11: Member 1's whole part in one step for the Competitor Agent: Discover (Darb's list, then the web when
// needed), Identify (a clean list of companies) and Validate (the four checks), within 15 Tavily calls per idea.
// The result is the list of valid companies (Confirmed or Likely) the judge will read (Member 2, design §9);
// until the judge is connected, the Competitor Agent returns the "capability_pending" note with it.
//
//   0. The idea needs at least its problem and its offering (design §4). If one is unknown, nothing is searched:
//      the status is needs_clarification with one question.
//   1. Darb's list (Task 2): the 15 closest startups. The founder's own startup, their analogies and startups less
//      close than MIN_SIMILARITY (0.55) are removed.
//   2. Their stored checks (Task 9) are used when they are less than 90 days old: pass is valid, fail never appears,
//      empty is not shown. The top 6 without a recent check are checked now (Task 8) and the result is saved.
//   3. The web (Task 5) is searched only when Darb's list gives fewer than 3 valid startups that are close to
//      the idea. "Close" is a closeness (cosine similarity) of at least 0.75: a stand-in until the judge decides
//      which startups really compete (design §5 "web only when the corpus results are weak"). With 0.75, D1 and
//      N1 search the web and D5 does not (TC-11.1 to 11.3).
//   4. The new web companies are checked (Task 8), with the news pages the search found (their dates count for
//      Active). Up to 6 new web companies are checked. Only Confirmed and Likely companies are passed on.
//   5. Tavily calls are counted across every step, and never go over 15.
import { TAVILY_CALLS_PER_IDEA, TAVILY_READ_CALLS } from '../config/limits';
import type { ProgressStep } from './progress';
import type { Candidate, IdeaProfile } from '../schemas/competitor';
import type { RunState } from './competitor-run';
import { cleanName, siteOf } from './identify-candidates';
import { CHECK_VALID_DAYS } from './recheck-startups';
import type { SavedIdeaDeps, SearchCorpusOutput } from './search-corpus';
import { searchForIdea } from './search-corpus';
import type { SearchWebDeps, SearchWebOutput } from './search-web';
import { searchWeb } from './search-web';
import { validateCompanies, type CompanyResult, type ValidateDeps } from './validate-candidate';

// Closeness that counts a startup from Darb's list as close to the idea (stand-in for the judge, see step 3).
export const CLOSE_SIMILARITY = 0.75;
// The web is searched when Darb's list gives fewer valid, close startups than this (test plan TC-11.1).
export const ENOUGH_VALID = 3;
// Startups from Darb's list checked live in one run (one reading batch).
// 6, not 10 (Hala, 16 Nov 2026): only 3 competitors are ever shown, and checking fewer startups and web companies cut
// a cold run from 125 to 54 s and from 173 to 84 s (with the 25 s page budget), with the same competitors found.
const CORPUS_TO_CHECK = 6;
const WEB_TO_CHECK = 6;
// A startup from Darb's list less close to the idea than this is not checked or passed on (Hala, 16 Nov 2026).
// Checking far startups cost time and gave the judge junk: N1 (falcon photography) checked Unifonic, SDM and ZORY
// at 0.40 to 0.45, and took 283 s. In the Task 10 and 11 runs, every relevant startup was above it (1pass 0.80,
// OTO 0.79, Supermile 0.63, Bayut and 5050 0.87). It does not change the web rule (CLOSE_SIMILARITY).
export const MIN_SIMILARITY = 0.55;
// Reading calls kept for checking the web companies (homepages + About pages + app pages).
const READ_RESERVE = 3;

export type FindInput = {
  idea_text: string;
  idea_id?: string;
  language?: 'ar' | 'en';
  idea_profile?: IdeaProfile; // a profile already made (the fixtures), instead of making one from the text
  founder_startup?: { name?: string; website?: string };
  references?: string[];
  web?: 'auto' | 'off' | 'always'; // auto: the rule in step 3. off / always: for TC-11.14 (list only vs list + web)
  onProgress?: (step: ProgressStep) => void; // what Darb is doing now, for the founder's screen (lib/progress.ts)
};

export type FoundCompany = Candidate & {
  evidence_status: 'confirmed' | 'likely';
  checked: 'now' | 'stored'; // checked in this run, or a stored check from the last 90 days
  similarity: number | null; // closeness to the idea, for startups from Darb's list
};

export type FindOutput = {
  status: 'complete' | 'partial' | 'needs_clarification';
  clarification?: { question: string; missing_field: 'problem' | 'offering' };
  notes: ('web_search_failed')[];
  idea_profile_text: string | null;
  web: { searched: boolean; why: string; queries: string[]; stopped_because: SearchWebOutput['stopped_because'] | null };
  companies: FoundCompany[]; // Confirmed first, then Likely; what the judge reads
  not_shown: { name: string; source: 'corpus' | 'web'; why: string }[];
  tavily_calls: number;
};

export type FindDeps = {
  corpus: SavedIdeaDeps;
  web: SearchWebDeps;
  validate: ValidateDeps;
  // The stored checks of startups from Darb's list (Task 9).
  // evidence_status: Confirmed or Likely, saved with a pass since migration 0039 (empty before it: shown as Likely).
  storedChecks: (ids: string[]) => Promise<Map<string, { validation_status: 'pass' | 'fail' | null; evidence_status?: 'confirmed' | 'likely' | null; validated_at: string | null }>>;
};

// Asked when the problem or the offering is unknown (design §4). Member 2 owns the wording of clarification questions.
const QUESTIONS = {
  problem: { en: 'Thank you for sharing your idea 😊 Could you tell me what problem it solves, and for whom?', ar: 'شكرًا لمشاركتك فكرتك 😊 هل يمكنك أن توضّح لي المشكلة التي تحلّها، ولمن؟' },
  offering: { en: 'Thank you for sharing your idea 😊 Could you tell me what you will offer: an app, a service or a product?', ar: 'شكرًا لمشاركتك فكرتك 😊 هل يمكنك أن توضّح لي ما ستقدّمه: تطبيق أم خدمة أم منتج؟' },
};

class NeedsClarification extends Error {
  constructor(public missing: 'problem' | 'offering') {
    super(`needs ${missing}`);
  }
}

export function missingCore(profile: IdeaProfile): 'problem' | 'offering' | null {
  if (profile.problem.origin === 'unknown') return 'problem';
  if (profile.offering.origin === 'unknown') return 'offering';
  return null;
}

// The founder's own startup, or a company they used as an analogy ("like Talabat").
function isFounderOrReference(c: Pick<Candidate, 'name' | 'name_aliases' | 'domain'>, input: FindInput): string | null {
  const names = [c.name, ...c.name_aliases].map(cleanName);
  const own = input.founder_startup;
  if (own?.website && c.domain && siteOf(own.website) === c.domain) return "the founder's own startup";
  if (own?.name && names.includes(cleanName(own.name))) return "the founder's own startup";
  if ((input.references ?? []).some((r) => names.includes(cleanName(r)))) return 'an analogy the founder used, not a competitor';
  return null;
}

const failedChecks = (r: CompanyResult) =>
  (['real_entity', 'real_offering', 'active', 'saudi_reach'] as const).filter((k) => r[k] !== 'pass').map((k) => `${k} ${r[k]}: ${r.reasons[k]}`).join(' | ');

export async function findCompetitors(input: FindInput, deps: FindDeps, now = new Date()): Promise<FindOutput> {
  const language = input.language ?? 'en';
  const progress = (step: ProgressStep) => input.onProgress?.(step);
  progress('searching_list');
  const notes: FindOutput['notes'] = [];
  const not_shown: FindOutput['not_shown'] = [];
  const companies: FoundCompany[] = [];
  let calls = 0;

  // 0 and 1. The profile (with the clarification check) and Darb's list.
  let corpus: SearchCorpusOutput;
  try {
    const buildProfile = async (text: string) => {
      const profile = await deps.corpus.buildProfile(text);
      const missing = missingCore(profile);
      if (missing) throw new NeedsClarification(missing);
      return profile;
    };
    if (input.idea_profile) {
      const missing = missingCore(input.idea_profile);
      if (missing) throw new NeedsClarification(missing);
    }
    corpus = await searchForIdea({ idea_id: input.idea_id, idea_text: input.idea_text, idea_profile: input.idea_profile }, { ...deps.corpus, buildProfile }, now);
  } catch (error) {
    if (!(error instanceof NeedsClarification)) throw error;
    return {
      status: 'needs_clarification',
      clarification: { question: QUESTIONS[error.missing][language], missing_field: error.missing },
      notes,
      idea_profile_text: null,
      web: { searched: false, why: 'the idea needs clarification first', queries: [], stopped_because: null },
      companies: [],
      not_shown: [],
      tavily_calls: 0,
    };
  }

  const similarity = new Map(corpus.shortlist.map((s) => [s.startup_id, s.similarity]));
  const shortlist = corpus.candidates.filter((c) => {
    const close = similarity.get(c.startup_id!) ?? 0;
    const why = isFounderOrReference(c, input) ?? (close < MIN_SIMILARITY ? `not close enough to the idea (${close.toFixed(2)}, below ${MIN_SIMILARITY})` : null);
    if (why) not_shown.push({ name: c.name, source: 'corpus', why });
    return !why;
  });

  // 2. Stored checks, then the top 6 without a recent one are checked now.
  const stored = await deps.storedChecks(shortlist.map((c) => c.startup_id!));
  const recent = (at: string | null) => !!at && now.getTime() - new Date(at).getTime() < CHECK_VALID_DAYS * 86_400_000;
  const toCheck: Candidate[] = [];
  for (const c of shortlist) {
    const s = stored.get(c.startup_id!);
    if (s && recent(s.validated_at) && s.validation_status === 'pass') {
      // A stored pass means all four checks passed (Task 9). The judge and the guardrails need it as a validation.
      const evidence_status = s.evidence_status ?? 'likely';
      const validation = { real_entity: 'pass', real_offering: 'pass', active: 'pass', saudi_reach: 'pass', evidence_status, checked_at: new Date(s.validated_at!).toISOString() } as const;
      companies.push({ ...c, validation, evidence_status, checked: 'stored', similarity: similarity.get(c.startup_id!) ?? null });
    } else if (s && recent(s.validated_at)) {
      not_shown.push({ name: c.name, source: 'corpus', why: `its check of ${s.validated_at!.slice(0, 10)} found nothing definite` });
    } else if (toCheck.length < CORPUS_TO_CHECK) {
      toCheck.push(c);
    }
  }
  const results = new Map<string, CompanyResult>();
  if (toCheck.length) {
    progress('checking_companies');
    const checked = await validateCompanies(
      toCheck.map((c) => ({ name: c.name, aliases: c.name_aliases, website: c.website, startup_id: c.startup_id, description: c.evidence_text })),
      { ...deps.validate, maxCalls: TAVILY_READ_CALLS - READ_RESERVE },
      now,
    );
    calls += checked.tavily_calls;
    toCheck.forEach((c, i) => results.set(c.candidate_key, checked.results[i]));
  }
  const keep = (c: Candidate, r: CompanyResult, source: 'corpus' | 'web') => {
    if (r.evidence_status === 'unconfirmed') return not_shown.push({ name: c.name, source, why: `Unconfirmed: ${failedChecks(r)}` });
    // A web company's name: its own name as its pages write it, not one guessed from its web address or a page title
    // (Hala, 18 Nov 2026: eshq.coffee was "Coffee"; its pages say "عشق القهوة"). Both spellings are kept, so the card
    // can show the one in the founder's language (lib/competitor-policy.ts, displayName).
    const own = source === 'web' ? [r.page_names?.en, r.page_names?.ar].filter((n): n is string => !!n) : [];
    const name = own[0] ?? c.name;
    const name_aliases = [...new Set([...own.slice(1), c.name, ...c.name_aliases])].filter((n) => n !== name);
    companies.push({
      ...c,
      name,
      name_aliases,
      description: c.description ?? r.description ?? null, // a web company: the AI's sentence from its own page
      validation: { real_entity: r.real_entity, real_offering: r.real_offering, active: r.active, saudi_reach: r.saudi_reach, evidence_status: r.evidence_status, checked_at: r.checked_at },
      evidence_status: r.evidence_status,
      checked: 'now',
      similarity: c.startup_id ? (similarity.get(c.startup_id) ?? null) : null,
    });
  };
  for (const c of toCheck) keep(c, results.get(c.candidate_key)!, 'corpus');

  // 3. The web rule.
  const closeValid = companies.filter((c) => (c.similarity ?? 0) >= CLOSE_SIMILARITY).length;
  const mode = input.web ?? 'auto';
  const searchTheWeb = mode === 'always' || (mode === 'auto' && closeValid < ENOUGH_VALID);
  const why =
    mode === 'off' ? 'web search turned off for this run'
    : mode === 'always' ? 'web search turned on for this run'
    : searchTheWeb ? `only ${closeValid} valid startup(s) from Darb's list are close to the idea (fewer than ${ENOUGH_VALID})`
    : `${closeValid} valid startups from Darb's list are close to the idea: no web search needed`;

  let web: SearchWebOutput | null = null;
  const searchCalls = TAVILY_CALLS_PER_IDEA - calls - READ_RESERVE;
  if (searchTheWeb && searchCalls > 0) {
    progress('searching_web');
    web = await searchWeb(
      {
        profile_text: corpus.idea_profile_text,
        founder_text: input.idea_text,
        known_domains: corpus.candidates.map((c) => c.domain).filter((d): d is string => !!d),
        founder_startup: input.founder_startup,
        references: input.references,
      },
      deps.web,
      { calls: Math.min(searchCalls, TAVILY_CALLS_PER_IDEA), newCompanies: WEB_TO_CHECK },
    );
    calls += web.tavily_calls;
    notes.push(...web.notes);

    // 4. The new web companies, with the news the search found.
    const news = web.evidence.filter((e) => e.kind === 'news').map((e) => ({ url: e.url, title: e.title, published_date: e.published_date ?? null }));
    // A web company that is already in Darb's list is dropped by its name too, not only its website (Hala,
    // 15 Nov 2026): "1Pass App" and "تطبيق 1Pass" came from App Store links, so their domain was not 1pass.app.
    const listNames = new Set(corpus.candidates.flatMap((c) => [c.name, ...c.name_aliases]).map(cleanName).filter(Boolean));
    const newOnes = web.candidates.filter((c) => {
      const w = isFounderOrReference(c, input) ?? ([c.name, ...c.name_aliases].map(cleanName).some((n) => listNames.has(n)) ? "already in Darb's list" : null);
      if (w) not_shown.push({ name: c.name, source: 'web', why: w });
      return !w;
    });
    if (newOnes.length) {
      progress('checking_companies');
      const checked = await validateCompanies(
        newOnes.map((c) => ({
          name: c.name,
          aliases: c.name_aliases,
          website: c.website,
          app_store_url: c.sources.find((s) => s.source_type === 'app_store')?.url ?? null,
          news,
        })),
        { ...deps.validate, maxCalls: TAVILY_CALLS_PER_IDEA - calls },
        now,
      );
      calls += checked.tavily_calls;
      newOnes.forEach((c, i) => keep(c, checked.results[i], 'web'));
    }
  }

  const order = { confirmed: 0, likely: 1 };
  companies.sort((a, b) => order[a.evidence_status] - order[b.evidence_status] || (b.similarity ?? 0) - (a.similarity ?? 0));
  return {
    status: notes.length ? 'partial' : 'complete',
    notes,
    idea_profile_text: corpus.idea_profile_text,
    web: { searched: !!web, why, queries: web?.queries.map((q) => q.text) ?? [], stopped_because: web?.stopped_because ?? null },
    companies: companies.slice(0, 25),
    not_shown,
    tavily_calls: calls,
  };
}

// In the Competitor Agent: hands what was found to the run state the other capabilities share (lib/competitor-run.ts,
// Member 2's contract): the valid companies as candidates for the judge, the Tavily calls, the notes and a "discover"
// step for the run log. Only the shared candidate fields are kept (the Candidate schema is strict).
export function addToRunState(state: RunState, out: FindOutput, durationMs: number): void {
  for (const { evidence_status: _status, checked: _checked, similarity: _similarity, ...candidate } of out.companies) {
    state.candidates.set(candidate.candidate_key, candidate);
  }
  state.tavilyCalls += out.tavily_calls;
  for (const note of out.notes) state.notes.add(note);
  state.steps.push({
    capability: 'discover',
    outcome: 'ok',
    duration_ms: Math.max(0, Math.round(durationMs)),
    detail: `valid=${out.companies.length} not_shown=${out.not_shown.length} web=${out.web.searched ? 'yes' : 'no'} tavily=${out.tavily_calls}`,
  });
}
