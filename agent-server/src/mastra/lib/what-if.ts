// What-if logic used by run_what_if: create the changed version, and compare two versions exactly.
// Code only, so no difference can be invented by a model.
import { z } from 'zod';
import { type OwnedAssessment, ScenarioInputs } from './assessments';
import { getSupabase } from './supabase';

// --- Creating a version ---------------------------------------------------------

// Saves a new assessment of the same idea, with the parent's inputs plus the changes. The parent is never touched.
export async function createScenario(parent: OwnedAssessment, label: string, inputs: ScenarioInputs): Promise<string> {
  const { data, error } = await getSupabase()
    .from('assessments')
    .insert({
      idea_id: parent.idea_id,
      thread_id: parent.thread_id,
      language: parent.language,
      status: 'in_progress',
      parent_assessment_id: parent.assessment_id,
      scenario_label: label,
      scenario_inputs: inputs,
    })
    .select('assessment_id')
    .single();
  if (error) throw error;
  return data.assessment_id;
}

// --- Comparing two versions -----------------------------------------------------

const ScoreChange = z.object({
  before: z.number().nullable(),
  after: z.number().nullable(),
  change: z.number().nullable(), // after minus before, null when either side is missing
});

const CompetitorChange = z.object({
  startup_id: z.string(),
  name: z.string(),
  name_ar: z.string().nullable(),
  rank_before: z.number().nullable(),
  rank_after: z.number().nullable(),
  similarity_before: z.number().nullable(), // as a percentage
  similarity_after: z.number().nullable(),
});

const InputValue = z.union([z.string(), z.number(), z.boolean()]).nullable();

export const Comparison = z.object({
  inputs_changed: z.array(z.object({ field: z.string(), before: InputValue, after: InputValue })),
  iss: ScoreChange,
  survival_score: ScoreChange, // null on both sides until the ML model is connected
  competitors: z.object({ kept: z.array(CompetitorChange), new: z.array(CompetitorChange), dropped: z.array(CompetitorChange) }),
  note: z.string(),
});
export type Comparison = z.infer<typeof Comparison>;

type SavedCompetitor = { startup_id: string; rank: number; similarity: number; name: string; name_ar: string | null };

async function loadCompetitors(assessmentId: string): Promise<SavedCompetitor[]> {
  const { data, error } = await getSupabase()
    .from('similar_startup_results')
    .select('startup_id, rank, similarity_score, startups (startup_name, startup_name_ar)')
    .eq('assessment_id', assessmentId)
    .order('rank');
  if (error) throw error;
  return (data ?? []).map((row) => {
    const s = row.startups as unknown as { startup_name: string; startup_name_ar: string | null } | null;
    return {
      startup_id: row.startup_id,
      rank: row.rank,
      similarity: Math.round(Number(row.similarity_score) * 1000) / 10,
      name: s?.startup_name ?? row.startup_id,
      name_ar: s?.startup_name_ar ?? null,
    };
  });
}

function scoreChange(before: number | null, after: number | null) {
  const change = before === null || after === null ? null : Math.round((after - before) * 10) / 10;
  return { before, after, change };
}

// Splits the two competitor lists into kept, new and dropped.
export function diffCompetitors(before: SavedCompetitor[], after: SavedCompetitor[]) {
  const toChange = (b: SavedCompetitor | undefined, a: SavedCompetitor | undefined) => {
    const c = (a ?? b)!;
    return {
      startup_id: c.startup_id,
      name: c.name,
      name_ar: c.name_ar,
      rank_before: b?.rank ?? null,
      rank_after: a?.rank ?? null,
      similarity_before: b?.similarity ?? null,
      similarity_after: a?.similarity ?? null,
    };
  };
  const beforeById = new Map(before.map((c) => [c.startup_id, c]));
  const afterById = new Map(after.map((c) => [c.startup_id, c]));
  return {
    kept: after.filter((c) => beforeById.has(c.startup_id)).map((c) => toChange(beforeById.get(c.startup_id), c)),
    new: after.filter((c) => !beforeById.has(c.startup_id)).map((c) => toChange(undefined, c)),
    dropped: before.filter((c) => !afterById.has(c.startup_id)).map((c) => toChange(c, undefined)),
  };
}

// Lists only the inputs that differ between the two versions.
export function diffInputs(before: ScenarioInputs, after: ScenarioInputs) {
  const fields = ['idea_text', 'sector', 'sub_sector', 'region', 'capital_sar', 'sells_online'] as const;
  return fields
    .filter((field) => (before[field] ?? null) !== (after[field] ?? null))
    .map((field) => ({ field, before: before[field] ?? null, after: after[field] ?? null }));
}

// Compares two versions of the same idea from their saved results. Both must already be loaded as owned by the founder.
export async function compareAssessments(before: OwnedAssessment, after: OwnedAssessment): Promise<Comparison> {
  const [competitorsBefore, competitorsAfter] = await Promise.all([
    loadCompetitors(before.assessment_id),
    loadCompetitors(after.assessment_id),
  ]);
  return {
    inputs_changed: diffInputs(before.inputs, after.inputs),
    iss: scoreChange(before.iss, after.iss),
    survival_score: scoreChange(before.fis_score, after.fis_score),
    competitors: diffCompetitors(competitorsBefore, competitorsAfter),
    note: "Only startups from Darb's dataset are compared; web competitors are not saved yet.",
  };
}
