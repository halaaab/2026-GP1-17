// Tool: the saved competitor analysis of this conversation's assessment, for follow-up questions (PBI 36).
// Answers come from what was saved, never from a new search, so a follow-up can never add a competitor or change
// a label, status or number. The assessment and the founder come from the server, never from the model.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getUserId, loadOwnedAssessment } from '../lib/assessments';
import { loadStoredResult } from '../lib/competitor-store';
import { laterIdeas } from '../lib/conversation-ideas';
import { getSupabase } from '../lib/supabase';
import { opportunitySentences } from '../lib/competitor-notes';
import { REPLY_RULES_KEY, type ReplyRules } from '../lib/reply-guard';
import type { Language } from '../schemas/competitor';
import { Answer, OpportunityKind, Source } from '../schemas/competitor';

const Cell = z.object({ answer: Answer, note: z.string() });

const StoredCompetitor = z.object({
  rank: z.number().int(),
  name: z.string(),
  website: z.string().nullable(),
  description: z.string().nullable(),
  city_region: z.string().nullable(),
  source_type: z.enum(['corpus', 'web']),
  startup_id: z.string().nullable(),
  label: z.enum(['direct', 'indirect']).nullable(),
  evidence_status: z.enum(['confirmed', 'likely']).nullable(),
  reason: z.string().nullable(),
  comparison: z.object({ problem: Cell, customer: Cell, offering: Cell }).nullable(),
  sources: z.array(Source),
  similarity_score: z.number().int(),
  opportunity: OpportunityKind.optional(),
  difference: z.string().nullable().optional(),
  // The opportunity as the founder sees it in the analysis, in their language, written by code (competitor-notes.ts):
  // the answer to "how can I differ from this competitor?"
  opportunity_sentence: z.string().optional(),
});

export const getCompetitorResultTool = createTool({
  id: 'get_competitor_result',
  description:
    "Only for follow-up questions about competitors already shown in this conversation. Returns the saved analysis of the idea discussed last (each competitor's description, label, evidence, reason, comparison and source links, the ISS and the market level), and in ideas every analysed idea of this conversation by name, oldest first. It never searches again. Never use it for a new idea.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    status: z.enum(['ok', 'not_analysed', 'no_assessment', 'error']),
    // For the supervisor when nothing is saved: a fixed line written by code.
    next_step: z.string().optional(),
    iss: z.number().nullable(),
    iss_basis: z.enum(['full', 'problem_offering_only']).nullable(),
    market_level: z.enum(['open', 'competitive', 'crowded']).nullable(),
    competitors: z.array(StoredCompetitor),
    // Every analysed idea of the conversation, oldest first (several ideas in one conversation).
    ideas: z
      .array(
        z.object({
          idea_name: z.string(),
          iss: z.number().nullable(),
          iss_basis: z.enum(['full', 'problem_offering_only']).nullable(),
          market_level: z.enum(['open', 'competitive', 'crowded']).nullable(),
          competitors: z.array(StoredCompetitor),
        }),
      )
      .optional(),
  }),
  execute: async (_input, context) => {
    const empty = { iss: null, iss_basis: null, market_level: null, competitors: [] };
    const requestContext = (context as { requestContext?: { get: (key: string) => unknown } } | undefined)?.requestContext;
    const assessmentId = requestContext?.get('assessmentId');
    const userId = getUserId(context);
    if (typeof assessmentId !== 'string' || !assessmentId || !userId) return { status: 'no_assessment' as const, ...empty };

    try {
      const assessment = await loadOwnedAssessment(assessmentId, userId);
      if (!assessment) return { status: 'no_assessment' as const, ...empty };
      // The conversation's own idea, then the ideas described later in it (lib/conversation-ideas.ts).
      const later = await laterIdeas(assessment.assessment_id).catch(() => []);
      const all = [assessment, ...later];
      const names = new Map<string, string>();
      const { data: ideaRows } = await getSupabase().from('startup_ideas').select('idea_id, idea_name').in('idea_id', all.map((a) => a.idea_id));
      for (const row of Array.isArray(ideaRows) ? ideaRows : []) names.set(row.idea_id, row.idea_name);
      // the founder's language for this message (decided in code, lib/reply-guard.ts), else the conversation's
      const language: Language = (requestContext?.get(REPLY_RULES_KEY) as ReplyRules | undefined)?.language ?? assessment.language;
      const ideas = [];
      for (const one of all) {
        const stored = await loadStoredResult(one.assessment_id);
        if (!stored.analysed_at) continue;
        const { analysed_at: _when, ...result } = stored;
        const competitors = result.competitors.map((c) => {
          const [sentence] = c.opportunity ? opportunitySentences({ competitors: [c as never] }, language) : [];
          return sentence ? { ...c, opportunity_sentence: sentence } : c;
        });
        ideas.push({ idea_name: names.get(one.idea_id) ?? '', ...result, competitors });
      }
      if (!ideas.length) {
        const next_step = 'No analysis is saved yet. If the founder described a business idea, delegate it to the Competitor Agent as a new idea.';
        return { status: 'not_analysed' as const, ...empty, next_step };
      }
      const { idea_name: _name, ...last } = ideas.at(-1)!;
      return { status: 'ok' as const, ...last, ...(ideas.length > 1 ? { ideas } : {}) };
    } catch (error) {
      console.error('get_competitor_result failed:', error);
      return { status: 'error' as const, ...empty };
    }
  },
});
