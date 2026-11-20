// The Competitor Agent's contracts, in one place (design: Darb_Competitor_Agent_Design, Version 4).
// Every agent, tool and test imports these shapes, so a field is defined only once.
//
//   Handoff      Conversational Agent → Competitor Agent   (design §4)
//   IdeaProfile  the idea broken into parts, built by the agent        (design §4, §16)
//   Candidate    a possible competitor, from discovery/validation to the judge (design §6, §7, §8)
//   JudgeOutput  the judge's answer for one candidate                  (design §9)
//   Result       Competitor Agent → Conversational Agent               (design §10, §11)
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

export const Language = z.enum(['ar', 'en']);
export type Language = z.infer<typeof Language>;

// new: a new idea. what_if: a changed version (a new assessment). rerun: the same assessment again.
// check: only read the idea (Understand), with no search, nothing saved and no analysis used. Darb uses it to
// understand an idea before the founder agrees to a competitor analysis (consent, lib/analysis-consent.ts).
export const HandoffMode = z.enum(['new', 'what_if', 'rerun', 'check']);
export type HandoffMode = z.infer<typeof HandoffMode>;

// The four core parts of an idea. The supervisor may only pass what the founder stated.
const KnownFacts = z
  .object({
    problem: z.string().min(1).optional(),
    customer: z.string().min(1).optional(),
    offering: z.string().min(1).optional(),
    market: z.string().min(1).optional(),
  })
  .strict();

// How a profile value was found: said by the founder, worked out by the agent, or not known.
export const Origin = z.enum(['stated', 'inferred', 'unknown']);
export type Origin = z.infer<typeof Origin>;

// The judge's answer to one question (same problem? same customer? same offering?).
export const Answer = z.enum(['same', 'partly', 'different', 'unknown', 'conflicting']);
export type Answer = z.infer<typeof Answer>;

// The result of one validity check (design §7).
export const CheckOutcome = z.enum(['pass', 'fail', 'unknown']);
export type CheckOutcome = z.infer<typeof CheckOutcome>;

// Where a piece of evidence came from (source registry groups, design §5).
export const SourceType = z.enum(['official_site', 'app_store', 'ecosystem', 'news', 'government']);
export type SourceType = z.infer<typeof SourceType>;

export const Source = z
  .object({
    url: z.url(),
    source_type: SourceType,
    accessed_at: z.iso.datetime({ offset: true }),
  })
  .strict();
export type Source = z.infer<typeof Source>;

// corpus: Darb's startups table (EcosystemSA). web: found with Tavily.
export const CandidateSource = z.enum(['corpus', 'web']);
export type CandidateSource = z.infer<typeof CandidateSource>;

// ---------------------------------------------------------------------------
// a) Handoff: Conversational Agent → Competitor Agent (design §4)
// ---------------------------------------------------------------------------

export const Handoff = z
  .object({
    assessment_id: z.uuid(),
    idea_id: z.uuid(),
    mode: HandoffMode,
    language: Language,
    // The founder's own words, combined from all their messages.
    idea_text: z.string().trim().min(1),
    // Stated facts only, never the supervisor's guesses.
    known_facts: KnownFacts.optional(),
    // The founder's own startup, so it is never shown as a competitor.
    founder_startup: z
      .object({ name: z.string().min(1).optional(), website: z.string().min(1).optional() })
      .strict()
      .optional(),
    // Companies the founder mentioned: validated like any other candidate.
    named_competitors: z.array(z.string().min(1)).optional(),
    // Analogies ("like Talabat"): never returned as results.
    references: z.array(z.string().min(1)).optional(),
    // A what-if only: a short name for the change, in the founder's language ("Jeddah instead of Riyadh").
    scenario_label: z.string().trim().min(1).max(120).optional(),
    // On a re-call: the question the Competitor Agent asked, and the founder's answer.
    clarification: z.object({ question: z.string().min(1), answer: z.string().min(1) }).strict().optional(),
  })
  .strict();
export type Handoff = z.infer<typeof Handoff>;

// ---------------------------------------------------------------------------
// b) Idea profile (design §4 idea template, §16 embedded text)
// ---------------------------------------------------------------------------

// One core part of the idea. "unknown" has no value; every other origin has one.
export const ProfileField = z
  .object({
    value: z.string().min(1).nullable(),
    origin: Origin,
  })
  .strict()
  .refine((f) => (f.origin === 'unknown') === (f.value === null), {
    message: 'value must be null exactly when origin is "unknown"',
  });
export type ProfileField = z.infer<typeof ProfileField>;

export const IdeaProfile = z
  .object({
    problem: ProfileField,
    customer: ProfileField,
    offering: ProfileField,
    market: ProfileField,
    // The Saudi classification (SSIC, based on ISIC4): section letter and 2-digit division, null when not clear.
    sector: z
      .object({
        isic_section: z.string().regex(/^[A-U]$/).nullable(),
        isic_division: z.string().regex(/^\d{2}$/).nullable(),
      })
      .strict(),
    business_model: z.string().min(1).nullable(),
    keywords_en: z.array(z.string().min(1)),
    keywords_ar: z.array(z.string().min(1)),
  })
  .strict();
export type IdeaProfile = z.infer<typeof IdeaProfile>;

// ---------------------------------------------------------------------------
// c) Candidate: from discovery/validation to the judge (design §6, §7, §8)
// ---------------------------------------------------------------------------

// confirmed / likely / unconfirmed (design §8). Only confirmed and likely are ever shown.
export const EvidenceStatus = z.enum(['confirmed', 'likely', 'unconfirmed']);
export type EvidenceStatus = z.infer<typeof EvidenceStatus>;

export const Validation = z
  .object({
    real_entity: CheckOutcome,
    real_offering: CheckOutcome,
    active: CheckOutcome,
    saudi_reach: CheckOutcome,
    evidence_status: EvidenceStatus,
    checked_at: z.iso.datetime({ offset: true }),
  })
  .strict();
export type Validation = z.infer<typeof Validation>;

export const Candidate = z
  .object({
    candidate_key: z.string().min(1),
    source_type: CandidateSource,
    // startups.startup_id (text in the database). Required for a corpus candidate.
    startup_id: z.string().min(1).nullable(),
    name: z.string().min(1),
    name_aliases: z.array(z.string().min(1)),
    website: z.string().min(1).nullable(),
    domain: z.string().min(1).nullable(),
    // Page text or corpus profile shown to the judge. Used live only, never stored (Tavily terms, design §5).
    evidence_text: z.string(),
    // Shown on the competitor card (design §11, §15). A short description in Darb's own words (never copied page
    // text, Tavily terms) and the city or region. A candidate with no description is never shown.
    description: z.string().min(1).nullable().optional(),
    city_region: z.string().min(1).nullable().optional(),
    sources: z.array(Source),
    // Missing until the validation step has run.
    validation: Validation.optional(),
  })
  .strict()
  .refine((c) => c.source_type !== 'corpus' || c.startup_id !== null, {
    message: 'a corpus candidate needs its startup_id',
    path: ['startup_id'],
  });
export type Candidate = z.infer<typeof Candidate>;

// ---------------------------------------------------------------------------
// d) Judge output: one candidate per call (design §9)
// ---------------------------------------------------------------------------

export const JudgeAnswer = z
  .object({
    answer: Answer,
    note: z.string(),
    source_url: z.url().optional(),
    // The exact sentence from the evidence that supports the answer (explainer §4). Code checks it is really there.
    quote: z.string().trim().min(1).optional(),
  })
  .strict();
export type JudgeAnswer = z.infer<typeof JudgeAnswer>;

export const JudgeLabel = z.enum(['direct', 'indirect', 'not_competitor']);
export type JudgeLabel = z.infer<typeof JudgeLabel>;

export const JudgeOutput = z
  .object({
    candidate_key: z.string().min(1),
    is_company: z.boolean(), // false for an article, a list or a directory page
    problem: JudgeAnswer,
    customer: JudgeAnswer,
    offering: JudgeAnswer,
    label: JudgeLabel, // only a proposal: code applies the policy rules
    reason: z.string().trim().min(1), // one founder-facing sentence
    // One sentence on how the idea differs from this candidate, or "none" (competitive opportunities, explainer §6).
    difference: z.string().trim().min(1).optional(),
  })
  .strict();
export type JudgeOutput = z.infer<typeof JudgeOutput>;

// ---------------------------------------------------------------------------
// e) Result: Competitor Agent → Conversational Agent (design §10, §11)
// ---------------------------------------------------------------------------

// understood: a "check" run read the idea and it has enough to search; nothing was searched or saved.
export const ResultStatus = z.enum(['complete', 'partial', 'needs_clarification', 'understood']);
export type ResultStatus = z.infer<typeof ResultStatus>;

// Notes are codes, never sentences: the supervisor turns them into Arabic or English (lib/competitor-notes.ts).
export const NOTE_CODES = [
  'capability_pending', // this part of the agent is not built yet
  'none_found', // no confirmed competitors in our sources (design §10)
  'fewer_than_three',
  'only_indirect',
  'customer_unknown', // ISS on problem and offering only (iss_basis = problem_offering_only)
  'web_search_failed', // Tavily slow or down: partial results (design §12)
  'judge_call_failed', // a failed judge call skipped a candidate (design §12)
  'web_changed', // the web changed since the stored result (design §12)
  'temporarily_unavailable', // OpenAI or Tavily spending limit reached (design §12)
  'analysis_incomplete', // the run did not return a valid result; code returned this instead
  'daily_limit_reached', // the founder used today's analyses (design §12); nothing was searched
  'monthly_limit_reached', // the founder used this month's analyses (design §12); nothing was searched
  'time_limit_reached', // the run hit its overall time limit: only what was checked in time is shown (design §12)
] as const;
export const NoteCode = z.enum(NOTE_CODES);
export type NoteCode = z.infer<typeof NoteCode>;

export const ComparisonCell = z.object({ answer: Answer, note: z.string() }).strict();

// Competitive opportunities (explainer §6): four fixed rules in code turn the judge's answers into one of these,
// each with a fixed next step. Darb never says "where you will win".
export const OPPORTUNITY_KINDS = ['proven_difference', 'possible_customer_difference', 'possible_difference', 'no_clear_difference', 'not_enough_evidence'] as const;
export const OpportunityKind = z.enum(OPPORTUNITY_KINDS);
export type OpportunityKind = z.infer<typeof OpportunityKind>;

export const ResultCompetitor = z
  .object({
    rank: z.number().int().min(1).max(3),
    name: z.string().min(1),
    website: z.string().min(1).nullable(),
    description: z.string().min(1), // Darb's own words
    city_region: z.string().min(1).nullable(),
    source_type: CandidateSource,
    startup_id: z.string().min(1).optional(),
    label: z.enum(['direct', 'indirect']),
    evidence_status: z.enum(['confirmed', 'likely']), // unconfirmed is never shown
    reason: z.string().trim().min(1),
    comparison: z.object({ problem: ComparisonCell, customer: ComparisonCell, offering: ComparisonCell }).strict(),
    sources: z.array(Source).min(1), // every competitor has a working source link
    similarity_score: z.number().int().min(0).max(100),
    opportunity: OpportunityKind.optional(),
    difference: z.string().min(1).nullable().optional(), // the judge's one sentence, for a possible difference
  })
  .strict()
  .refine((c) => c.source_type !== 'corpus' || c.startup_id !== undefined, {
    message: 'a corpus competitor needs its startup_id',
    path: ['startup_id'],
  });
export type ResultCompetitor = z.infer<typeof ResultCompetitor>;

// The design's per-run cap: 15 Tavily calls per idea (design §5, §12).
export const MAX_TAVILY_CALLS = 15;

export const Result = z
  .object({
    status: ResultStatus,
    clarification: z
      .object({ question: z.string().trim().min(1), missing_field: z.enum(['problem', 'offering']) })
      .strict()
      .optional(),
    idea_profile: IdeaProfile,
    competitors: z.array(ResultCompetitor).max(3),
    iss: z.number().int().min(0).max(100).nullable(),
    iss_basis: z.enum(['full', 'problem_offering_only']).nullable(),
    market_level: z.enum(['open', 'competitive', 'crowded']).nullable(),
    notes: z.array(NoteCode),
    usage: z
      .object({
        tavily_calls: z.number().int().min(0).max(MAX_TAVILY_CALLS),
        duration_ms: z.number().int().min(0),
        trace_id: z.string().min(1).nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((r, ctx) => {
    const issue = (message: string, path: (string | number)[]) => ctx.addIssue({ code: 'custom', message, path });

    // A clarification question exactly when the status asks for one.
    if ((r.status === 'needs_clarification') !== (r.clarification !== undefined)) {
      issue('clarification is required exactly when status is needs_clarification', ['clarification']);
    }
    // Ranks are 1, 2, 3 in order, one per competitor.
    r.competitors.forEach((c, i) => {
      if (c.rank !== i + 1) issue(`competitor ${i + 1} must have rank ${i + 1}`, ['competitors', i, 'rank']);
    });
    // No ISS when nothing is found; the ISS and its basis always come together.
    if (r.competitors.length === 0 && r.iss !== null) issue('iss must be null when no competitors are found', ['iss']);
    if ((r.iss === null) !== (r.iss_basis === null)) issue('iss and iss_basis must both be set or both be null', ['iss_basis']);
    // An understood idea was only read: it has no competitors and no score.
    if (r.status === 'understood' && (r.competitors.length > 0 || r.iss !== null || r.market_level !== null)) {
      issue('an understood result has no competitors, ISS or market level', ['status']);
    }
    // The same note never twice.
    if (new Set(r.notes).size !== r.notes.length) issue('a note code appears twice', ['notes']);
  });
export type Result = z.infer<typeof Result>;

// ---------------------------------------------------------------------------
// f) Run log: one line per Competitor Agent run (design §11 usage, §12 tracing, §18 shared log format)
// Ids, codes and timings only: never the founder's idea text (idea privacy, design §5).
// ---------------------------------------------------------------------------

export const CAPABILITIES = ['understand', 'discover', 'identify', 'validate', 'judge', 'analyze', 'guardrails'] as const;
export const Capability = z.enum(CAPABILITIES);
export type Capability = z.infer<typeof Capability>;

export const RunLogStep = z
  .object({
    capability: Capability,
    outcome: z.enum(['ok', 'skipped', 'failed']),
    duration_ms: z.number().int().min(0),
    detail: z.string().optional(), // a short code or count, never founder text
  })
  .strict();
export type RunLogStep = z.infer<typeof RunLogStep>;

export const RunLog = z
  .object({
    event: z.literal('competitor_run'),
    trace_id: z.string().min(1).nullable(),
    assessment_id: z.uuid(),
    idea_id: z.uuid(),
    mode: HandoffMode,
    language: Language,
    started_at: z.iso.datetime({ offset: true }),
    duration_ms: z.number().int().min(0),
    status: ResultStatus,
    result_valid: z.boolean(), // false when the run's own result failed the check and the fallback was used
    competitors_shown: z.number().int().min(0).max(3),
    iss: z.number().int().min(0).max(100).nullable(),
    notes: z.array(NoteCode),
    dropped_known_facts: z.array(z.enum(['problem', 'customer', 'offering', 'market'])), // guesses removed by code
    tavily_calls: z.number().int().min(0).max(MAX_TAVILY_CALLS),
    judge_calls: z.number().int().min(0),
    steps: z.array(RunLogStep),
  })
  .strict();
export type RunLog = z.infer<typeof RunLog>;
