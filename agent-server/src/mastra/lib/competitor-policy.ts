// The guardrails (design §9, §10): everything that decides what the founder sees is done here, in code.
//
//   applyPolicy     the policy rules on one judge answer: citation check, Direct / Indirect / not a competitor,
//                   the competitor's similarity score from the answers (the judge never writes numbers),
//                   and its competitive opportunity (explainer §6)
//   rankCompetitors the policy gate: only valid companies with evidence, one per company, never the founder's own
//                   startup or a reference; the strongest overlap first, then Confirmed before Likely
//   computeIss      the Idea Similarity Score from the top 3, the closest counting most
//   marketLevel     open / competitive / crowded from the number of valid direct competitors
//   buildResult     the Result the supervisor receives, with the notes as codes
//   clarificationResult  the Result that asks the founder one question instead
import { ANSWER_POINTS, ANSWER_WEIGHTS, ISS_RANK_WEIGHTS, LIKELY_FACTOR, MARKET_LEVEL_MIN, MAX_SHOWN } from '../config/scoring';
import {
  Result,
  type Answer,
  type Candidate,
  type Handoff,
  type IdeaProfile,
  type JudgeAnswer,
  type JudgeOutput,
  type Language,
  type NoteCode,
  type OpportunityKind,
  type ResultCompetitor,
} from '../schemas/competitor';
import type { Clarification } from './understand';

export type IssBasis = 'full' | 'problem_offering_only';
export type FinalLabel = 'direct' | 'indirect' | 'not_competitor';

export type PolicyOutcome = {
  candidate_key: string;
  label: FinalLabel;
  // Why the label differs from the judge's proposal, as a short code for the run log (never founder text).
  changed_by?: 'not_a_company' | 'judge_not_competitor' | 'problem_not_shared' | 'direct_needs_same_problem_and_stated_customer';
  problem: JudgeAnswer;
  customer: JudgeAnswer;
  offering: JudgeAnswer;
  similarity_score: number;
  reason: string;
  opportunity: OpportunityKind;
  difference: string | null; // the judge's sentence, or null for "none"
  description: string | null; // the card's description in the founder's language, or null (then the candidate's own)
};

// The ISS uses the customer only when the founder's customer is known (design §10, "Customer unknown").
export function issBasis(profile: IdeaProfile): IssBasis {
  return profile.customer.origin === 'unknown' ? 'problem_offering_only' : 'full';
}

// "www.Example.com" and "example.com" are the same site.
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

// Citation check: a supporting source must be one of this candidate's own pages, never another site.
export function citesCandidate(url: string | undefined, candidate: Candidate): boolean {
  const host = hostOf(url);
  if (!host) return false;
  const own = [candidate.domain, candidate.website, ...candidate.sources.map((s) => s.url)].map(hostOf);
  return candidate.sources.some((s) => s.url === url) || own.includes(host);
}

// The quote check: the quoted sentence must really be in this candidate's evidence (spaces and letter case aside),
// so a "same" can never rest on a sentence the judge made up.
export function quoteInEvidence(quote: string | undefined, evidence: string): boolean {
  const squash = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();
  return Boolean(quote && squash(quote).length >= 8 && squash(evidence).includes(squash(quote)));
}

// Competitive opportunities: four fixed rules on ONE competitor's answers (explainer §6), checked from top to
// bottom; the first that matches wins, so a customer difference wins over an offering difference.
//   customer different                      → proven difference
//   customer partly the same                → possible difference about the customer (interview customers)
//   offering partly the same or different   → possible difference about the offering (validate it), in the judge's words
//   problem, customer and offering the same → no clear difference
//   anything else (mostly unknown)          → not enough evidence yet
// Conflicting evidence counts as unknown here: contradictory evidence never produces a difference.
export function opportunityFor(judged: Record<'problem' | 'customer' | 'offering', Answer>): OpportunityKind {
  const known = (a: Answer): Answer => (a === 'conflicting' ? 'unknown' : a);
  const answers = { problem: known(judged.problem), customer: known(judged.customer), offering: known(judged.offering) };
  if (answers.customer === 'different') return 'proven_difference';
  if (answers.customer === 'partly') return 'possible_customer_difference';
  if (['different', 'partly'].includes(answers.offering)) return 'possible_difference';
  if (answers.problem === 'same' && answers.customer === 'same' && answers.offering === 'same') return 'no_clear_difference';
  return 'not_enough_evidence';
}

// A competitor's similarity score, 0–100: same = full points, partly = half, the rest none (design §10).
export function similarityScore(answers: Record<'problem' | 'customer' | 'offering', Answer>, basis: IssBasis): number {
  const parts = basis === 'full' ? (['problem', 'customer', 'offering'] as const) : (['problem', 'offering'] as const);
  const total = parts.reduce((sum, p) => sum + ANSWER_WEIGHTS[p], 0);
  const earned = parts.reduce((sum, p) => sum + ANSWER_WEIGHTS[p] * ANSWER_POINTS[answers[p]], 0);
  return Math.round((100 * earned) / total);
}

// The policy rules on one judge answer (design §9).
export function applyPolicy(judge: JudgeOutput, candidate: Candidate, profile: IdeaProfile): PolicyOutcome {
  // A "same" answer needs a source from this candidate and a quote that is really in its evidence; otherwise "unknown".
  const checked = (a: JudgeAnswer): JudgeAnswer =>
    a.answer === 'same' && !(citesCandidate(a.source_url, candidate) && quoteInEvidence(a.quote, candidate.evidence_text))
      ? { answer: 'unknown', note: a.note }
      : a;
  const problem = checked(judge.problem);
  const customer = checked(judge.customer);
  const offering = checked(judge.offering);
  const answers = { problem: problem.answer, customer: customer.answer, offering: offering.answer };

  const outcome = (label: FinalLabel, changed_by?: PolicyOutcome['changed_by']): PolicyOutcome => ({
    candidate_key: candidate.candidate_key,
    label,
    ...(changed_by ? { changed_by } : {}),
    problem,
    customer,
    offering,
    similarity_score: label === 'not_competitor' ? 0 : similarityScore(answers, issBasis(profile)),
    reason: judge.reason.trim(),
    opportunity: opportunityFor(answers),
    difference: judge.difference && !/^none\.?$/i.test(judge.difference.trim()) ? judge.difference.trim() : null,
    description: judge.description?.trim() || null,
  });

  // Articles, lists and directory pages are never results.
  if (!judge.is_company) return outcome('not_competitor', 'not_a_company');
  if (judge.label === 'not_competitor') return outcome('not_competitor');
  // Same sector or topic only is never a competitor: a competitor shares at least part of the problem.
  if (problem.answer !== 'same' && problem.answer !== 'partly') return outcome('not_competitor', 'problem_not_shared');

  // Direct needs the same problem, the same customer and a customer the founder stated; any conflict blocks it.
  if (judge.label === 'direct') {
    const conflicting = Object.values(answers).includes('conflicting');
    const direct = problem.answer === 'same' && customer.answer === 'same' && profile.customer.origin === 'stated' && !conflicting;
    if (!direct) return outcome('indirect', 'direct_needs_same_problem_and_stated_customer');
  }
  return outcome(judge.label);
}

// ---------------------------------------------------------------------------
// Policy gate and ranking (design §10)
// ---------------------------------------------------------------------------

// Lowercase, no diacritics or punctuation, Arabic letter forms unified. A backstop only: the full Arabic and English
// name matching (aliases, legal words) is done in the Identify step.
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^a-z0-9؀-ۿ]+/g, '');
}

export type Judged = { candidate: Candidate; policy: PolicyOutcome };

type Exclusions = Pick<Handoff, 'founder_startup' | 'references'>;

// The founder's own startup and the references ("like Talabat") are never results (design §6, §13).
export function isExcluded(candidate: Candidate, exclude: Exclusions): boolean {
  const names = [candidate.name, ...candidate.name_aliases].map(normalizeName);
  const ownName = exclude.founder_startup?.name ? normalizeName(exclude.founder_startup.name) : null;
  const ownHost = hostOf(exclude.founder_startup?.website);
  if (ownName && names.includes(ownName)) return true;
  if (ownHost && [candidate.domain, candidate.website].map(hostOf).includes(ownHost)) return true;
  return (exclude.references ?? []).some((ref) => names.includes(normalizeName(ref)));
}

// Only valid competitors can be shown: a direct or indirect label, Confirmed or Likely evidence,
// a working source link and Darb's own description. Weak evidence means abstaining, never guessing.
function showable(j: Judged, exclude: Exclusions): boolean {
  const status = j.candidate.validation?.evidence_status;
  return (
    j.policy.label !== 'not_competitor' &&
    (status === 'confirmed' || status === 'likely') &&
    j.candidate.sources.length > 0 &&
    Boolean(j.candidate.description) &&
    !isExcluded(j.candidate, exclude)
  );
}

// The same company is shown once: same website domain, or the same name after normalizing.
function companyKey(c: Candidate): string {
  return hostOf(c.domain ?? c.website) ?? `name:${normalizeName(c.name)}`;
}

// The strongest overlap with the idea first, then Confirmed before Likely, then candidate_key keeps equal ones in a
// fixed order (Hala, 18 Nov 2026: Confirmed first put Lugmety, fine dining, above Jahez for a food delivery app only
// because Jahez's registration was not matched; closeness to the idea is what the founder needs first).
function compare(a: Judged, b: Judged): number {
  const rank = (j: Judged) => (j.candidate.validation?.evidence_status === 'confirmed' ? 0 : 1);
  return (
    b.policy.similarity_score - a.policy.similarity_score ||
    rank(a) - rank(b) ||
    a.candidate.candidate_key.localeCompare(b.candidate.candidate_key)
  );
}

// Every valid competitor, best first, one per company (before the top 3 are cut).
export function rankCompetitors(judged: readonly Judged[], exclude: Exclusions): Judged[] {
  const best = new Map<string, Judged>();
  for (const j of [...judged].filter((j) => showable(j, exclude)).sort(compare)) {
    const key = companyKey(j.candidate);
    if (!best.has(key)) best.set(key, j);
  }
  return [...best.values()];
}

// ---------------------------------------------------------------------------
// ISS and market level (design §10)
// ---------------------------------------------------------------------------

// The top 3 combined, the closest counting most; Likely counts slightly less. null when nothing is found.
export function computeIss(shown: readonly { similarity_score: number; evidence_status: 'confirmed' | 'likely' }[]): number | null {
  if (shown.length === 0) return null;
  const scores = shown
    .slice(0, MAX_SHOWN)
    .map((c) => c.similarity_score * (c.evidence_status === 'likely' ? LIKELY_FACTOR : 1))
    .sort((a, b) => b - a);
  const weights = ISS_RANK_WEIGHTS.slice(0, scores.length);
  const total = weights.reduce((sum, w) => sum + w, 0);
  return Math.round(scores.reduce((sum, s, i) => sum + s * weights[i], 0) / total);
}

// The number of valid direct competitors, one per company, gives the level. A lower bound: "open" never means none exist.
export function marketLevel(valid: readonly Judged[]): 'open' | 'competitive' | 'crowded' {
  const direct = valid.filter((j) => j.policy.label === 'direct').length;
  if (direct >= MARKET_LEVEL_MIN.crowded) return 'crowded';
  if (direct >= MARKET_LEVEL_MIN.competitive) return 'competitive';
  return 'open';
}

// ---------------------------------------------------------------------------
// The Result (design §11)
// ---------------------------------------------------------------------------

// The name shown on the card, in the founder's language when the company has one (18 Nov 2026): an Arabic chat
// shows "مرسول" and "عشق القهوة", an English chat "Mrsool" and "Eshq Coffee". Only names the company really uses:
// Darb's list (its Arabic name) or its own pages; never a translation.
const ARABIC = /[\u0600-\u06FF]/;
export function displayName(candidate: Pick<Candidate, 'name' | 'name_aliases'>, language: Language): string {
  const all = [candidate.name, ...candidate.name_aliases];
  const wanted = all.find((n) => (language === 'ar' ? ARABIC.test(n) : !ARABIC.test(n)));
  return wanted ?? candidate.name;
}

// The company's other names inside a sentence become the name on its card (Hala, 18 Nov 2026: an Arabic card said
// "تتناول Lugmety ..." under the title "لقمتي"). Its own names only (Darb's list, its pages, its web address);
// a name the company does not use is never made up, and the judge's wording is otherwise left as it is.
export function withCardName(sentence: string, candidate: Pick<Candidate, 'name' | 'name_aliases' | 'domain'>, cardName: string): string {
  const label = (candidate.domain ?? '').replace(/^www\./, '').split('.')[0];
  const others = [candidate.name, ...candidate.name_aliases, label.length >= 4 ? label : '']
    .map((n) => n.trim())
    // only names in the other script: an Arabic card's English names, an English card's Arabic names
    .filter((n) => n && n !== cardName && ARABIC.test(n) !== ARABIC.test(cardName))
    .sort((x, y) => y.length - x.length);
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // the card name already in the sentence is set aside first, so "بنك D360" never becomes "بنك بنك D360"
  const KEEP = '\u0000';
  let out = sentence.split(cardName).join(KEEP);
  for (const other of others) {
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escape(other)}(?![\\p{L}\\p{N}])`, 'giu'), KEEP);
  }
  return out.split(KEEP).join(cardName);
}

function toCompetitor(j: Judged, rank: number, language: Language): ResultCompetitor {
  const c = j.candidate;
  const name = displayName(c, language);
  const named = (sentence: string) => withCardName(sentence, c, name);
  // The proof sentence is kept only when it is really in this competitor's evidence and its link is the competitor's own.
  // Only for companies found on the web: the evidence of a startup from Darb's list is Darb's own summary of it
  // ("Problem: ..."), not a sentence from the company's page (live check, 18 Nov 2026).
  const proven = (a: JudgeAnswer) =>
    c.source_type === 'web' &&
    (a.answer === 'same' || a.answer === 'partly') && a.quote && a.source_url && quoteInEvidence(a.quote, c.evidence_text) && citesCandidate(a.source_url, c);
  const cell = (a: JudgeAnswer) => ({ answer: a.answer, note: a.note, ...(proven(a) ? { quote: a.quote!.trim(), source_url: a.source_url! } : {}) });
  return {
    rank,
    name,
    website: c.website,
    description: named(j.policy.description ?? c.description!),
    city_region: c.city_region ?? null,
    source_type: c.source_type,
    ...(c.startup_id ? { startup_id: c.startup_id } : {}),
    label: j.policy.label as 'direct' | 'indirect',
    evidence_status: c.validation!.evidence_status as 'confirmed' | 'likely',
    reason: named(j.policy.reason),
    comparison: { problem: cell(j.policy.problem), customer: cell(j.policy.customer), offering: cell(j.policy.offering) },
    sources: c.sources,
    similarity_score: j.policy.similarity_score,
    opportunity: j.policy.opportunity,
    difference: j.policy.difference ? named(j.policy.difference) : j.policy.difference,
  };
}

export type BuildInput = {
  handoff: Handoff;
  profile: IdeaProfile;
  judged: readonly Judged[];
  // Notes the capabilities raised during the run: web_search_failed, judge_call_failed, web_changed, temporarily_unavailable.
  runNotes: readonly NoteCode[];
  usage: Result['usage'];
};

// The founder has used their analyses: nothing was searched, and the note says when they can run another.
export function limitResult(profile: IdeaProfile, note: NoteCode, usage: Result['usage']): Result {
  return Result.parse({ status: 'complete', idea_profile: profile, competitors: [], iss: null, iss_basis: null, market_level: null, notes: [note], usage });
}

// The idea is too vague to search: one question, no competitors and no scores (design §4).
export function clarificationResult(profile: IdeaProfile, clarification: Clarification, usage: Result['usage']): Result {
  return Result.parse({
    status: 'needs_clarification',
    clarification,
    idea_profile: profile,
    competitors: [],
    iss: null,
    iss_basis: null,
    market_level: null,
    notes: [],
    usage,
  });
}

// The checked Result: up to 3 competitors, the ISS and its basis, the market level and the notes.
export function buildResult({ handoff, profile, judged, runNotes, usage }: BuildInput): Result {
  const valid = rankCompetitors(judged, handoff);
  const competitors = valid.slice(0, MAX_SHOWN).map((j, i) => toCompetitor(j, i + 1, handoff.language));
  const basis = issBasis(profile);
  const found = competitors.length > 0;

  const notes: NoteCode[] = [];
  if (!found) notes.push('none_found');
  if (found && competitors.length < MAX_SHOWN) notes.push('fewer_than_three');
  if (found && competitors.every((c) => c.label === 'indirect')) notes.push('only_indirect');
  if (found && basis === 'problem_offering_only') notes.push('customer_unknown');
  notes.push(...runNotes);

  // Partial when a part of the run failed (design §12); the result is still shown.
  const failed = runNotes.some((n) => (['web_search_failed', 'judge_call_failed', 'temporarily_unavailable', 'time_limit_reached'] as NoteCode[]).includes(n));

  return Result.parse({
    status: failed ? 'partial' : 'complete',
    idea_profile: profile,
    competitors,
    iss: computeIss(competitors),
    iss_basis: found ? basis : null,
    market_level: found ? marketLevel(valid) : null,
    notes: [...new Set(notes)],
    usage,
  });
}
