// The Competitor Agent's results in Supabase (migration 0032), written and read only by code:
//
//   saveResult        replaces the assessment's competitors (similar_startup_results, with their links in
//                     result_sources) and saves its ISS, basis, market level, notes and analysed_at.
// Only Darb's own outputs are saved, never page text.
//   loadStoredResult  what was saved, for follow-up questions (PBI 36) and the result screen
// analysisLimit the founder's daily and monthly analysis limits, counted from analysed_at
import { MAX_ANALYSES_PER_DAY, MAX_ANALYSES_PER_MONTH } from '../config/limits';
import { OPPORTUNITY_KINDS, type NoteCode, type OpportunityKind, type Result, type ResultCompetitor } from '../schemas/competitor';
import { getSupabase } from './supabase';

// Saudi Arabia is UTC+3 all year (no daylight saving).
const SAUDI_OFFSET_MS = 3 * 60 * 60 * 1000;

// Midnight at the start of today, and of the first day of this month, in Saudi Arabia, as UTC timestamps.
export function startOfSaudiDay(now = new Date()): string {
  const saudi = new Date(now.getTime() + SAUDI_OFFSET_MS);
  saudi.setUTCHours(0, 0, 0, 0);
  return new Date(saudi.getTime() - SAUDI_OFFSET_MS).toISOString();
}
export function startOfSaudiMonth(now = new Date()): string {
  const saudi = new Date(now.getTime() + SAUDI_OFFSET_MS);
  saudi.setUTCDate(1);
  saudi.setUTCHours(0, 0, 0, 0);
  return new Date(saudi.getTime() - SAUDI_OFFSET_MS).toISOString();
}

// The opportunity is stored with the design's four values (migration 0036). The customer-partly rule is stored as
// "possible_difference"; reading it back, a saved comparison whose customer is "partly" gives it back
// (the customer rule is checked first, so that is exactly when it matched).
export function storedOpportunity(kind: OpportunityKind | undefined): string | null {
  if (!kind) return null;
  return kind === 'possible_customer_difference' ? 'possible_difference' : kind;
}
export function readOpportunity(stored: string | null | undefined, comparison: { customer?: { answer?: string } } | null): OpportunityKind | undefined {
  if (!stored || !(OPPORTUNITY_KINDS as readonly string[]).includes(stored)) return undefined;
  if (stored === 'possible_difference' && comparison?.customer?.answer === 'partly') return 'possible_customer_difference';
  return stored as OpportunityKind;
}

// One saved row per competitor shown. A web competitor has no startup_id, but always a name and a page.
// Its evidence links go in the result_sources table (one row per link, migration 0033), not in this row.
export function resultRows(assessmentId: string, competitors: readonly ResultCompetitor[]) {
  return competitors.map((c) => ({
    assessment_id: assessmentId,
    startup_id: c.source_type === 'corpus' ? (c.startup_id ?? null) : null,
    source_type: c.source_type,
    rank: c.rank,
    competitor_name: c.name,
    website: c.website,
    source_url: c.sources[0].url,
    description: c.description,
    city_region: c.city_region,
    label: c.label,
    evidence_status: c.evidence_status,
    reason: c.reason,
    comparison: c.comparison,
    similarity_score: c.similarity_score,
    opportunity: storedOpportunity(c.opportunity), // migration 0036
    difference: c.difference ?? null, // the judge's one sentence (migration 0038)
  }));
}

// The result_sources rows of the saved competitors: each competitor's links, by the result_id it was saved with.
export function sourceRows(saved: readonly { result_id: string; rank: number }[], competitors: readonly ResultCompetitor[]) {
  return saved.flatMap((row) => {
    const competitor = competitors.find((c) => c.rank === row.rank);
    return (competitor?.sources ?? []).map((source) => ({
      result_id: row.result_id,
      url: source.url,
      source_type: source.source_type,
      accessed_at: source.accessed_at,
    }));
  });
}

// Saves a finished analysis. The old competitors of this assessment (and their links) are replaced, so a re-run
// never mixes results.
export async function saveResult(assessmentId: string, result: Result): Promise<void> {
  const supabase = getSupabase();

  const old = await supabase.from('similar_startup_results').select('result_id').eq('assessment_id', assessmentId);
  if (old.error) throw old.error;
  const oldIds = (old.data ?? []).map((r) => r.result_id as string);
  if (oldIds.length) {
    const removedSources = await supabase.from('result_sources').delete().in('result_id', oldIds);
    if (removedSources.error) throw removedSources.error;
    const removed = await supabase.from('similar_startup_results').delete().eq('assessment_id', assessmentId);
    if (removed.error) throw removed.error;
  }

  if (result.competitors.length) {
    const inserted = await supabase.from('similar_startup_results').insert(resultRows(assessmentId, result.competitors)).select('result_id, rank');
    if (inserted.error) throw inserted.error;
    const links = sourceRows((inserted.data ?? []) as { result_id: string; rank: number }[], result.competitors);
    if (links.length) {
      const linked = await supabase.from('result_sources').insert(links);
      if (linked.error) throw linked.error;
    }
  }

  const updated = await supabase
    .from('assessments')
    .update({
      iss: result.iss,
      iss_basis: result.iss_basis,
      market_level: result.market_level,
      analysed_at: new Date().toISOString(),
    })
    .eq('assessment_id', assessmentId);
  if (updated.error) throw updated.error;

  // The note codes, one row each (migration 0042), shown on the result screen, History and the report.
  const removedNotes = await supabase.from('assessment_competitor_notes').delete().eq('assessment_id', assessmentId);
  if (removedNotes.error) throw removedNotes.error;
  const notes = [...new Set(result.notes)].map((note_code) => ({ assessment_id: assessmentId, note_code }));
  if (notes.length) {
    const added = await supabase.from('assessment_competitor_notes').insert(notes);
    if (added.error) throw added.error;
  }
}

export type StoredCompetitor = Omit<ResultCompetitor, 'startup_id'> & { startup_id: string | null };
export type StoredResult = {
  analysed_at: string | null;
  iss: number | null;
  iss_basis: Result['iss_basis'];
  market_level: Result['market_level'];
  competitors: StoredCompetitor[];
};

// The saved analysis of one assessment, competitors in rank order with their links. analysed_at is null when it was
// never analysed. "*" keeps the read working while columns are still being added to the design.
export async function loadStoredResult(assessmentId: string): Promise<StoredResult> {
  const supabase = getSupabase();
  const assessment = await supabase
    .from('assessments')
    .select('analysed_at, iss, iss_basis, market_level')
    .eq('assessment_id', assessmentId)
    .maybeSingle();
  if (assessment.error) throw assessment.error;
  const rows = await supabase
    .from('similar_startup_results')
    .select('*, result_sources (url, source_type, accessed_at)')
    .eq('assessment_id', assessmentId)
    .order('rank');
  if (rows.error) throw rows.error;

  return {
    analysed_at: assessment.data?.analysed_at ?? null,
    iss: assessment.data?.iss === null || assessment.data?.iss === undefined ? null : Number(assessment.data.iss),
    iss_basis: assessment.data?.iss_basis ?? null,
    market_level: assessment.data?.market_level ?? null,
    competitors: (rows.data ?? []).map((r) => ({
      rank: r.rank,
      name: r.competitor_name,
      website: r.website,
      description: r.description,
      city_region: r.city_region,
      source_type: r.source_type,
      startup_id: r.startup_id,
      label: r.label,
      evidence_status: r.evidence_status,
      reason: r.reason,
      comparison: r.comparison,
      sources: r.result_sources ?? [],
      similarity_score: r.similarity_score,
      opportunity: readOpportunity(r.opportunity, r.comparison),
      difference: r.difference ?? null,
    })),
  };
}

// How many of this founder's assessments were analysed since a moment. Each assessment counts once.
async function analysesSince(userId: string, since: string): Promise<number> {
  const { count, error } = await getSupabase()
    .from('assessments')
    .select('assessment_id, startup_ideas!inner (founder_id)', { count: 'exact', head: true })
    .eq('startup_ideas.founder_id', userId)
    .gte('analysed_at', since);
  if (error) throw error;
  return count ?? 0;
}

// When this assessment's analysis was saved, or null when it has none yet.
export async function analysedAt(assessmentId: string): Promise<string | null> {
  try {
    const { data, error } = await getSupabase().from('assessments').select('analysed_at').eq('assessment_id', assessmentId).maybeSingle();
    if (error) throw error;
    return (data?.analysed_at as string | null) ?? null;
  } catch (error) {
    console.error('Reading analysed_at failed:', error);
    return null;
  }
}

// The limit note when this founder may not start another analysis, else null. Re-running an assessment already
// analysed today is free; a what-if is always a new analysis (assessmentId null). If the count cannot be read,
// the analysis is allowed (the dashboards' spending caps remain).
export async function analysisLimit(userId: string, assessmentId: string | null, now = new Date()): Promise<NoteCode | null> {
  try {
    const today = startOfSaudiDay(now);
    if (assessmentId) {
      const { data, error } = await getSupabase().from('assessments').select('analysed_at').eq('assessment_id', assessmentId).maybeSingle();
      if (error) throw error;
      if (data?.analysed_at && new Date(data.analysed_at) >= new Date(today)) return null;
    }
    if ((await analysesSince(userId, today)) >= MAX_ANALYSES_PER_DAY) return 'daily_limit_reached';
    if ((await analysesSince(userId, startOfSaudiMonth(now))) >= MAX_ANALYSES_PER_MONTH) return 'monthly_limit_reached';
    return null;
  } catch (error) {
    console.error('Analysis limit check failed:', error);
    return null;
  }
}
