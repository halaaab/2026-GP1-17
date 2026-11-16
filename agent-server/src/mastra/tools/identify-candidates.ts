// Tool (Task 7): turns raw search results into a clean list of companies in the shared Candidate format,
// with a removed list (and why) and the government or directory pages kept as evidence (lib/identify-candidates.ts).
// Registered in Mastra so it can be run alone in Studio's Tools tab.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { identifyCandidates } from '../lib/identify-candidates';
import { Candidate } from '../schemas/competitor';

const RawResult = z.object({
  source_type: z.enum(['corpus', 'web']),
  startup_id: z.string().optional().describe("For a startup from Darb's list, its id, e.g. ST_073."),
  name: z.string().optional().describe('The company name, when known.'),
  url: z.string().describe('The page link.'),
  title: z.string().optional().describe('The page title.'),
  text: z.string().optional().describe('The page text or search snippet.'),
  accessed_at: z.string().optional(),
});

export const identifyCandidatesTool = createTool({
  id: 'identify-candidates',
  description:
    "Turns raw search results into a clean list of companies: keeps news, social media, government, directory and reference pages as evidence only (news titles as leads), keeps only the Saudi App Store, merges the same company found twice, keeps same-name companies on different websites apart, and removes the founder's own startup and their analogies.",
  inputSchema: z.object({
    results: z.array(RawResult),
    founder_startup: z.object({ name: z.string().optional(), website: z.string().optional() }).optional(),
    references: z.array(z.string()).optional().describe('Analogies the founder used, e.g. "Talabat".'),
  }),
  outputSchema: z.object({
    candidates: z.array(Candidate),
    evidence: z.array(z.object({ url: z.string(), domain: z.string(), kind: z.enum(['government', 'directory', 'news', 'social', 'reference']), title: z.string().nullable(), published_date: z.string().optional() })),
    leads: z.array(z.string()).describe('Titles of news pages that may name a company worth looking for.'),
    removed: z.array(
      z.object({
        name: z.string().nullable(),
        url: z.string(),
        reason: z.enum(['founder_startup', 'reference', 'not_a_link', 'no_company_name', 'not_saudi_app_store']),
      }),
    ),
  }),
  execute: async ({ results, founder_startup, references }) => identifyCandidates(results, { founder_startup, references }),
});
