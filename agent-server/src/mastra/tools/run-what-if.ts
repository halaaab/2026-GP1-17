// Tool: runs a what-if scenario in one call. It creates the changed version as a new assessment
// (the earlier one stays untouched), runs the competitor analysis on it, and returns the exact before → after comparison.
// One tool instead of three steps, so the model cannot do them out of order or compare from memory.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { DelegateCompetitorOutput } from '../contracts';
import { getUserId, loadOwnedAssessment, type ScenarioInputs } from '../lib/assessments';
import { whatIfWasConfirmed } from '../lib/confirmation';
import { Comparison, compareAssessments, createScenario } from '../lib/what-if';
import { checkClassification, runCompetitorAnalysis } from './delegate-competitor-analysis';

const Changes = z
  .object({
    idea_text: z.string().min(10).optional(),
    sector: z.string().optional().describe('A new ISIC4 section letter, A to U.'),
    sub_sector: z.string().regex(/^\d{2}$/).optional().describe('A new ISIC4 division, 2 digits.'),
    region: z.string().min(1).optional(),
    capital_sar: z.number().nonnegative().optional(),
    sells_online: z.boolean().optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, 'At least one change is needed.');

export const runWhatIfTool = createTool({
  id: 'run_what_if',
  description:
    'Use this only after the founder confirms a what-if scenario. It creates the changed version beside the earlier one, analyses it, and returns exactly what changed.',
  inputSchema: z.object({
    parent_assessment_id: z.uuid().describe('The version the founder wants to change: the current one, or an earlier one they chose.'),
    scenario_label: z.string().min(1).max(80).describe('A short name for the change, in the founder\'s language, e.g. "Jeddah instead of Riyadh".'),
    changes: Changes.describe('Only the inputs that change. Everything else is copied from the parent.'),
    language: z.enum(['ar', 'en']),
  }),
  outputSchema: z.object({
    status: z.enum(['ok', 'no_change', 'not_found', 'invalid', 'analysis_failed', 'limit_reached', 'error']),
    assessment_id: z.string().nullable(),
    analysis: DelegateCompetitorOutput.nullable(),
    comparison: Comparison.nullable(),
    message: z.string(),
  }),
  execute: async ({ parent_assessment_id, scenario_label, changes, language }, context) => {
    type Status = 'no_change' | 'not_found' | 'invalid' | 'error';
    const stop = (status: Status, message: string) => ({ status, assessment_id: null, analysis: null, comparison: null, message });

    // Enforced in code: the founder must have answered a question restating the what-if.
    if (!whatIfWasConfirmed(context)) {
      throw new Error('Not confirmed yet. First restate the changed version to the founder, ask them to confirm, and wait for their reply.');
    }

    try {
      const userId = getUserId(context);
      if (!userId) return stop('error', 'No signed-in founder for this conversation.');

      const parent = await loadOwnedAssessment(parent_assessment_id, userId);
      if (!parent) return stop('not_found', 'That assessment does not exist for this founder.');

      // 1. The changed version: the parent's inputs plus the changes. The model may send empty (null) values
      // for inputs it is not changing, so only real values count as changes.
      const given = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== null && value !== undefined)) as Partial<ScenarioInputs>;
      if (typeof given.sector === 'string') given.sector = given.sector.trim().toUpperCase();
      const inputs: ScenarioInputs = { ...parent.inputs, ...given };
      const changed = (Object.keys(given) as (keyof ScenarioInputs)[]).some((key) => parent.inputs[key] !== inputs[key]);
      if (!changed) return stop('no_change', 'These values are the same as the version being changed.');

      const { idea_text, sector, sub_sector, region } = inputs;
      if (!idea_text || !sector || !sub_sector || !region) {
        return stop('invalid', 'The version being changed has no confirmed idea, sector, sub-sector and region yet. Analyse it first.');
      }
      const problem = checkClassification(sector, sub_sector);
      if (problem) return stop('invalid', problem);

      const assessmentId = await createScenario(parent, scenario_label, inputs);

      // 2. The analysis of the new version.
      const analysis = await runCompetitorAnalysis({ assessment_id: assessmentId, idea_text, sector, sub_sector, region, language }, context);
      if (analysis.status === 'limit_reached' || analysis.status === 'error') {
        return {
          status: analysis.status === 'limit_reached' ? ('limit_reached' as const) : ('analysis_failed' as const),
          assessment_id: assessmentId,
          analysis,
          comparison: null,
          message: analysis.message,
        };
      }

      // 3. The exact comparison, from what was saved.
      const after = await loadOwnedAssessment(assessmentId, userId);
      if (!after) return stop('error', 'The new version could not be read back.');
      const comparison = await compareAssessments(parent, after);

      return { status: 'ok' as const, assessment_id: assessmentId, analysis, comparison, message: 'What-if analysed.' };
    } catch (error) {
      console.error('run_what_if failed:', error);
      return stop('error', 'The what-if scenario could not be run.');
    }
  },
});
