// Shared helpers for reading a founder's assessments safely.
// The user id always comes from the server (the founder's login, or the memory resourceId), never from the model,
// so a founder can only ever reach their own assessments.
import { getSupabase } from './supabase';

export type OwnedAssessment = {
  assessment_id: string;
  idea_id: string;
  language: 'ar' | 'en';
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
    .select('assessment_id, idea_id, language, startup_ideas!inner (founder_id)')
    .eq('assessment_id', assessmentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const idea = data.startup_ideas as unknown as { founder_id: string };
  if (idea.founder_id !== userId) return null;

  return { assessment_id: data.assessment_id, idea_id: data.idea_id, language: data.language };
}
