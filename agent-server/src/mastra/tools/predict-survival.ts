// Tool: asks the Python ML service for the survival prediction of a confirmed idea.
// Until the ML team deploys the service and ML_SERVICE_URL is set in .env, it answers model_not_connected,
// so the agent says the score is not available instead of guessing one.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { API_TIMEOUT_MS } from '../config/limits';

// What the ML service must send back from POST {ML_SERVICE_URL}/predict.
const ServiceReply = z.object({ survival_probability: z.number().min(0).max(1) });

export const predictSurvivalTool = createTool({
  id: 'predict_survival',
  description:
    'Gets the survival prediction for the founder\'s confirmed idea from Darb\'s ML model. Use it only after the founder confirms the idea.',
  // Draft input: the ML team adds fields here once the model's features are final.
  inputSchema: z.object({
    sector: z.string().length(1).describe('The ISIC4 section letter the founder confirmed, e.g. "K".'),
    sub_sector: z.string().regex(/^\d{2}$/).describe('The ISIC4 division (2 digits) the founder confirmed, e.g. "64".'),
    region: z.string().min(1).describe('The confirmed region in Saudi Arabia, or nationwide.'),
  }),
  outputSchema: z.object({
    status: z.enum(['ok', 'model_not_connected', 'error']),
    survival_probability: z.number().nullable(),
  }),
  execute: async (input) => {
    const baseUrl = process.env.ML_SERVICE_URL;
    if (!baseUrl) return { status: 'model_not_connected' as const, survival_probability: null };
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
      if (!response.ok) return { status: 'error' as const, survival_probability: null };
      const reply = ServiceReply.safeParse(await response.json());
      if (!reply.success) return { status: 'error' as const, survival_probability: null };
      return { status: 'ok' as const, survival_probability: reply.data.survival_probability };
    } catch {
      return { status: 'error' as const, survival_probability: null };
    }
  },
});
