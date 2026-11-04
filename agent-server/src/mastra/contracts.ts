// Shared shapes: every agent and tool imports these, so each shape is defined in one place.
import { z } from 'zod';

// One startup found by a search, before ranking (we will finalize it after the feature engineering )
export const StartupCandidate = z.object({
  startup_id: z.string(),
  name: z.string(),
  name_ar: z.string().nullable(),
  description: z.string(),
  sector: z.string().nullable(),
  region: z.string().nullable(),
  stage: z.string().nullable(),
  website: z.string().nullable(),
  similarity: z.number().min(0).max(1),
  source: z.enum(['dataset', 'web']),
});
export type StartupCandidate = z.infer<typeof StartupCandidate>;

// What the Conversational Agent sends when it hands the job to the Competitor Agent.
export const DelegateCompetitorInput = z.object({
  assessment_id: z.uuid(),
  idea_text: z.string().min(10),
  sector: z.string(),
  region: z.string(),
  language: z.enum(['ar', 'en']),
});
export type DelegateCompetitorInput = z.infer<typeof DelegateCompetitorInput>;

// A kept competitor: a candidate with its place in the top 3.
export const Competitor = StartupCandidate.extend({
  rank: z.number().int().min(1).max(3),
});
export type Competitor = z.infer<typeof Competitor>;

// What comes back to the Conversational Agent.
export const DelegateCompetitorOutput = z.object({
  status: z.enum(['ok', 'no_results', 'error']),
  assessment_id: z.string(),
  competitors: z.array(Competitor).max(3),
  iss: z.number().min(0).max(100).nullable(),
  competitors_found: z.number().int().min(0),
  message: z.string(),
});
export type DelegateCompetitorOutput = z.infer<typeof DelegateCompetitorOutput>;
