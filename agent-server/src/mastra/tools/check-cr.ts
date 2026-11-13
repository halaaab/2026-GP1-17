// Tool (Task 3): checks a CR number against the Ministry of Commerce list of active registrations,
// held in the server's memory (lib/cr-registry.ts). Answers "match" or "unknown", never "fail".
// Registered in Mastra so it can be run alone in Studio's Tools tab.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { checkCr } from '../lib/cr-registry';

export const checkCrTool = createTool({
  id: 'check-cr',
  description:
    'Checks a Saudi CR number (unified number starting with 7, or an old 10-digit CR number) against the Ministry of Commerce list of active registrations. Answers match or unknown, never fail.',
  inputSchema: z.object({
    cr_number: z.string().describe('The CR number as written on the page: spaces, dashes and Arabic digits are fine.'),
  }),
  outputSchema: z.object({
    result: z.enum(['match', 'unknown']),
    number_checked: z.string(),
    number_type: z.enum(['unified', 'old', 'vat', 'empty', 'invalid']),
    reason: z.string(),
    list: z
      .object({ quarter: z.string(), as_of: z.string(), unified_count: z.number(), old_count: z.number() })
      .nullable(),
  }),
  execute: async ({ cr_number }) => checkCr(cr_number),
});
