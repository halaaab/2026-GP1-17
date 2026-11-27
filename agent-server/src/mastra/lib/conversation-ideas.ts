// Several ideas in one conversation. The conversation is the assessment the chat opened with (its id is in the
// chat's address, and its messages and the agent's memory are saved under it). A different idea described later in
// the same conversation gets its own idea and assessment, so each analysis stays whole: the new assessment's
// thread_id is the conversation's assessment id (the column exists since migration 0005 and was unused).
// No new table, column or relation.
//
//   laterIdeas          the conversation's later ideas, oldest first
//   latestIdea          the idea the founder is talking about now: the latest one, or the conversation's own
//   createLaterIdea     a new idea and assessment in this conversation, for a different idea
//   removeLaterIdea     removes one again when nothing was saved for it (a limit or a failed run)
import type { Language } from '../schemas/competitor';
import type { OwnedAssessment } from './assessments';
import { getSupabase } from './supabase';

export type LaterIdea = OwnedAssessment & { analysed_at: string | null };

export async function laterIdeas(conversationId: string): Promise<LaterIdea[]> {
  const { data, error } = await getSupabase()
    .from('assessments')
    .select('assessment_id, idea_id, language, analysed_at, started_at')
    .eq('thread_id', conversationId)
    .order('started_at');
  if (error) throw error;
  if (!Array.isArray(data)) return [];
  return data.map((row) => ({ assessment_id: row.assessment_id, idea_id: row.idea_id, language: row.language as Language, analysed_at: row.analysed_at ?? null }));
}

// The idea the founder is talking about now: the conversation's latest idea, or its own when it has no later one.
export function latestIdea(conversation: OwnedAssessment, later: readonly LaterIdea[]): OwnedAssessment {
  const last = later.at(-1);
  return last ? { assessment_id: last.assessment_id, idea_id: last.idea_id, language: last.language } : conversation;
}

// The idea's name until the agent server names it formally (lib/idea-title.ts): the founder's first words.
function firstWords(text: string): string {
  const line = text.trim().split('\n')[0];
  return line.length > 44 ? `${line.slice(0, 44)}…` : line || 'New idea';
}

export async function createLaterIdea(conversationId: string, founderId: string, language: Language, ideaText: string): Promise<OwnedAssessment> {
  const supabase = getSupabase();
  const idea = await supabase
    .from('startup_ideas')
    .insert({ founder_id: founderId, idea_name: firstWords(ideaText), idea_description: ideaText })
    .select('idea_id')
    .single();
  if (idea.error) throw idea.error;
  const assessment = await supabase
    .from('assessments')
    .insert({ idea_id: idea.data.idea_id, language, status: 'in_progress', thread_id: conversationId })
    .select('assessment_id')
    .single();
  if (assessment.error) {
    await supabase.from('startup_ideas').delete().eq('idea_id', idea.data.idea_id);
    throw assessment.error;
  }
  return { assessment_id: assessment.data.assessment_id as string, idea_id: idea.data.idea_id as string, language };
}

// Deleting the idea deletes its assessment with it. Only ever a later idea of a conversation.
export async function removeLaterIdea(ideaId: string, conversationId: string): Promise<void> {
  const { data } = await getSupabase().from('assessments').select('assessment_id').eq('idea_id', ideaId).eq('thread_id', conversationId).maybeSingle();
  if (!data) return;
  const { error } = await getSupabase().from('startup_ideas').delete().eq('idea_id', ideaId);
  if (error) throw error;
}
