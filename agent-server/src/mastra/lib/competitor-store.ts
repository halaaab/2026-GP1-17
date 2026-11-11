// The Competitor Agent's results in Supabase (design §11, migration 0032), written and read only by code:
//
//   saveResult        replaces the assessment's competitors (similar_startup_results) and saves its ISS, basis,
//                     market level, notes and analysed_at. Only Darb's own outputs are saved, never page text (design §5).
//   loadStoredResult  what was saved, for follow-up questions (PBI 36) and the result screen
//   analysisLimit     the founder's daily and monthly analysis limits (design §12), counted from analysed_at
import { MAX_ANALYSES_PER_DAY, MAX_ANALYSES_PER_MONTH } from '../config/limits';
import type { NoteCode, Result, ResultCompetitor } from '../schemas/competitor';
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

// One saved row per competitor shown. A web competitor has no startup_id, but always a name and a page.
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
    sources: c.sources,
    similarity_score: c.similarity_score,
  }));
}

// Saves a finished analysis. The old competitors of this assessment are replaced, so a re-run never mixes results.
export async function saveResult(assessmentId: string, result: Result): Promise<void> {
  const supabase = getSupabase();
  const removed = await supabase.from('similar_startup_results').delete().eq('assessment_id', assessmentId);
  if (removed.error) throw removed.error;
  if (result.competitors.length) {
    const inserted = await supabase.from('similar_startup_results').insert(resultRows(assessmentId, result.competitors));
    if (inserted.error) throw inserted.error;
  }
  const updated = await supabase
    .from('assessments')
    .update({
      iss: result.iss,
      iss_basis: result.iss_basis,
      market_level: result.market_level,
      competitor_notes: result.notes, // shown on the result screen, History and the report (migration 0033)
      analysed_at: new Date().toISOString(),
    })
    .eq('assessment_id', assessmentId);
  if (updated.error) throw updated.error;
}

export type StoredCompetitor = Omit<ResultCompetitor, 'startup_id'> & { startup_id: string | null };
export type StoredResult = {
  analysed_at: string | null;
  iss: number | null;
  iss_basis: Result['iss_basis'];
  market_level: Result['market_level'];
  competitors: StoredCompetitor[];
};

// The saved analysis of one assessment, competitors in rank order. analysed_at is null when it was never analysed.
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
    .select('rank, competitor_name, website, description, city_region, source_type, startup_id, label, evidence_status, reason, comparison, sources, similarity_score')
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
      sources: r.sources ?? [],
      similarity_score: r.similarity_score,
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

// The limit note when this founder may not start another analysis, else null. Re-running an assessment already
// analysed today is free. If the count cannot be read, the analysis is allowed (the dashboards' spending caps remain).
export async function analysisLimit(userId: string, assessmentId: string, now = new Date()): Promise<NoteCode | null> {
  try {
    const { data, error } = await getSupabase().from('assessments').select('analysed_at').eq('assessment_id', assessmentId).maybeSingle();
    if (error) throw error;
    const today = startOfSaudiDay(now);
    if (data?.analysed_at && new Date(data.analysed_at) >= new Date(today)) return null;
    if ((await analysesSince(userId, today)) >= MAX_ANALYSES_PER_DAY) return 'daily_limit_reached';
    if ((await analysesSince(userId, startOfSaudiMonth(now))) >= MAX_ANALYSES_PER_MONTH) return 'monthly_limit_reached';
    return null;
  } catch (error) {
    console.error('Analysis limit check failed:', error);
    return null;
  }
}
