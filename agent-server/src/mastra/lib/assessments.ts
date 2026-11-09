// Shared helpers for reading a founder's assessments safely.
// The user id always comes from the server (the memory resourceId), never from the model,
// so a founder can only ever reach their own assessments.
import { z } from 'zod';
import { getSupabase } from './supabase';

// The inputs one assessment was run with. The survival-model inputs are optional until the ML model is connected.
export const ScenarioInputs = z.object({
  idea_text: z.string().nullable(),
  sector: z.string().nullable(),
  sub_sector: z.string().nullable().optional(),
  region: z.string().nullable(),
  capital_sar: z.number().nullable().optional(),
  sells_online: z.boolean().nullable().optional(),
});
export type ScenarioInputs = z.infer<typeof ScenarioInputs>;

export type OwnedAssessment = {
  assessment_id: string;
  idea_id: string;
  thread_id: string | null;
  language: 'ar' | 'en';
  iss: number | null;
  analysed_at: string | null;
  fis_score: number | null;
  inputs: ScenarioInputs;
};

// The current founder's user id, set by the caller as "userId" in the request context,
// or else as the memory resourceId.
export function getUserId(context: unknown): string | null {
  const ctx = context as { agent?: { resourceId?: string }; requestContext?: { get?: (key: string) => unknown } };
  const fromRequest = ctx?.requestContext?.get?.('userId');
  if (typeof fromRequest === 'string' && fromRequest) return fromRequest;
  return ctx?.agent?.resourceId ?? null;
}

// Loads an assessment only if it belongs to this user. Returns null otherwise.
export async function loadOwnedAssessment(assessmentId: string, userId: string): Promise<OwnedAssessment | null> {
  const { data, error } = await getSupabase()
    .from('assessments')
    .select(
      'assessment_id, idea_id, thread_id, language, confirmed_inputs, iss, analysed_at, fis_score, startup_ideas!inner (user_id, idea_description, sector, region)',
    )
    .eq('assessment_id', assessmentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const idea = data.startup_ideas as unknown as {
    user_id: string;
    idea_description: string | null;
    sector: string | null;
    region: string | null;
  };
  if (idea.user_id !== userId) return null;

  // An original assessment has no saved scenario inputs yet, so its inputs are the idea's own fields.
  const saved = ScenarioInputs.safeParse(data.confirmed_inputs);
  const inputs: ScenarioInputs = saved.success
    ? saved.data
    : { idea_text: idea.idea_description, sector: idea.sector, region: idea.region };

  return {
    assessment_id: data.assessment_id,
    idea_id: data.idea_id,
    thread_id: data.thread_id,
    language: data.language,
    iss: data.iss === null ? null : Number(data.iss),
    analysed_at: data.analysed_at ? new Date(data.analysed_at).toISOString() : null,
    fis_score: data.fis_score,
    inputs,
  };
}
