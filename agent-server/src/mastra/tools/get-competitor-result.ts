// Tool: the saved competitor analysis of this conversation's assessment, for follow-up questions (design §4, PBI 36).
// Answers come from what was saved, never from a new search, so a follow-up can never add a competitor or change
// a label, status or number. The assessment and the founder come from the server, never from the model.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getUserId, loadOwnedAssessment } from '../lib/assessments';
import { loadStoredResult } from '../lib/competitor-store';
import { Answer, Source } from '../schemas/competitor';

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
});

export const getCompetitorResultTool = createTool({
  id: 'get_competitor_result',
  description:
    "Returns the competitor analysis already saved for this conversation: each competitor's description, label, evidence, reason, comparison and source links, the ISS and the market level. Use it to answer follow-up questions. It never searches again.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    status: z.enum(['ok', 'not_analysed', 'no_assessment', 'error']),
    iss: z.number().nullable(),
    iss_basis: z.enum(['full', 'problem_offering_only']).nullable(),
    market_level: z.enum(['open', 'competitive', 'crowded']).nullable(),
    competitors: z.array(StoredCompetitor),
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
      const stored = await loadStoredResult(assessment.assessment_id);
      if (!stored.analysed_at) return { status: 'not_analysed' as const, ...empty };
      const { analysed_at: _when, ...result } = stored;
      return { status: 'ok' as const, ...result };
    } catch (error) {
      console.error('get_competitor_result failed:', error);
      return { status: 'error' as const, ...empty };
    }
  },
});
