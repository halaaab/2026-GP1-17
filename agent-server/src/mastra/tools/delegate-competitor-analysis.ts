// Tool: lets the Conversational Agent hand competitor analysis to the Competitor Agent.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const competitorSchema = z.object({
  name: z.string(),
  description: z.string(),
  sourceUrl: z.string(),
});

export const delegateCompetitorAnalysisTool = createTool({
  id: 'delegate-competitor-analysis',
  description: 'Finds competitors for a confirmed startup idea. Use it only after the founder confirms the summary.',
  inputSchema: z.object({
    ideaSummary: z.string().describe('The confirmed startup idea.'),
    language: z.enum(['ar', 'en']).describe('The language the founder is using.'),
  }),
  outputSchema: z.object({
    status: z.enum(['ok', 'no_results', 'analysis_failed']),
    competitors: z.array(competitorSchema),
  }),
  execute: async ({ ideaSummary, language }, context) => {
    try {
      const agent = context.mastra!.getAgentById('competitor-agent');
      const result = await agent.generate(`Language: ${language}\nStartup idea: ${ideaSummary}`, {
        structuredOutput: { schema: z.object({ competitors: z.array(competitorSchema) }) },
      });

      // Code enforces the rule: a competitor without a source link is dropped.
      const competitors = result.object.competitors.filter((competitor) => competitor.sourceUrl.startsWith('http'));
      return { status: competitors.length > 0 ? ('ok' as const) : ('no_results' as const), competitors };
    } catch (error) {
      console.error('Competitor analysis failed:', error);
      return { status: 'analysis_failed' as const, competitors: [] };
    }
  },
});
