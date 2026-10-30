// Tool: calls the Python ML service to get the survival prediction and SHAP explanation for a venture.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const predictSurvivalTool = createTool({
  id: 'predict-survival',
  description: 'Gets the survival prediction for a confirmed startup idea. Use it only after the founder confirms the summary.',
  // Draft input: the ML team confirms these fields once the model's features are final.
  inputSchema: z.object({
    economicActivity: z.string().describe('The economic activity of the startup.'),
    city: z.string().describe('The city where the startup will operate.'),
    capitalSar: z.number().optional().describe('The starting capital in Saudi riyals.'),
    sellsOnline: z.boolean().optional().describe('Whether the startup sells online.'),
  }),
  outputSchema: z.object({
    status: z.enum(['ok', 'model_not_connected']),
    survivalProbability: z.number().nullable(),
  }),
  // The ML team replaces this with a call to the FastAPI service.
  execute: async () => ({ status: 'model_not_connected' as const, survivalProbability: null }),
});
