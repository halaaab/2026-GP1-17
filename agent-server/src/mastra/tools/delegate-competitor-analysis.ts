// Tool: lets the Conversational Agent hand a confirmed idea to the Competitor Agent.
// The result it returns is finalize_competitors' own output, checked with Zod, never the Competitor Agent's text,
// so no competitor, score or ISS can be rewritten or invented by a model on the way back.
import { createTool } from '@mastra/core/tools';
import { RequestContext } from '@mastra/core/request-context';
import { MAX_ANALYSES_PER_DAY, MAX_TOOL_STEPS } from '../config/limits';
import { ISIC_DIVISIONS } from '../config/isic-divisions';
import { ISIC_SECTIONS, isIsicSection } from '../config/sectors';
import { DelegateCompetitorInput, DelegateCompetitorOutput } from '../contracts';
import { competitorAgent } from '../agents/competitor-agent';
import { getUserId, loadOwnedAssessment } from '../lib/assessments';
import { buildComparisonMatrix } from '../lib/comparison-matrix';
import { analysisWasConfirmed } from '../lib/confirmation';
import { getSupabase } from '../lib/supabase';
import { FINALIZE_OUTPUT_KEY } from './finalize-competitors';

// Midnight today in Saudi Arabia (UTC+3, no daylight saving), as a UTC timestamp.
export function startOfSaudiDay(now = new Date()): string {
  const saudi = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  saudi.setUTCHours(0, 0, 0, 0);
  return new Date(saudi.getTime() - 3 * 60 * 60 * 1000).toISOString();
}

// How many analyses this founder finished today. Re-running the same assessment does not count twice.
async function analysesToday(userId: string): Promise<number> {
  const { count, error } = await getSupabase()
    .from('assessments')
    .select('assessment_id, startup_ideas!inner (user_id)', { count: 'exact', head: true })
    .eq('startup_ideas.user_id', userId)
    .gte('analysed_at', startOfSaudiDay());
  if (error) throw error;
  return count ?? 0;
}

// Checks the sector and sub-sector against the Saudi classification. Returns an error message, or null when valid.
export function checkClassification(sector: string, subSector: string): string | null {
  if (!isIsicSection(sector)) return `Unknown sector "${sector}". Use the letter of one ISIC4 section and confirm it with the founder.`;
  const division = ISIC_DIVISIONS[subSector];
  if (!division) return `Unknown sub-sector "${subSector}". Use a 2-digit ISIC4 division and confirm it with the founder.`;
  if (division.section !== sector) return `Sub-sector ${subSector} is not in section ${sector}. Choose a division of that section.`;
  return null;
}

// The whole analysis, shared by delegate_competitor_analysis and run_what_if.
export async function runCompetitorAnalysis(input: DelegateCompetitorInput, context: unknown): Promise<DelegateCompetitorOutput> {
  const fail = (status: 'error' | 'limit_reached', message: string): DelegateCompetitorOutput => ({
    status,
    assessment_id: input.assessment_id,
    competitors: [],
    iss: null,
    competitors_found: 0,
    message,
  });

  try {
    const sector = input.sector.trim().toUpperCase();
    const problem = checkClassification(sector, input.sub_sector);
    if (problem || !isIsicSection(sector)) return fail('error', problem ?? 'Unknown sector.');

    const userId = getUserId(context);
    if (!userId) return fail('error', 'No signed-in founder for this conversation.');

    const assessment = await loadOwnedAssessment(input.assessment_id, userId);
    if (!assessment) return fail('error', 'That assessment does not exist for this founder.');

    // A retry of an assessment already analysed today is free; a new analysis needs room in today's limit.
    const alreadyToday = assessment.analysed_at !== null && assessment.analysed_at >= startOfSaudiDay();
    if (!alreadyToday && (await analysesToday(userId)) >= MAX_ANALYSES_PER_DAY) {
      return fail('limit_reached', `The founder has used today's ${MAX_ANALYSES_PER_DAY} analyses. They can try again tomorrow.`);
    }

    // Save the confirmed inputs on the assessment, so what-if comparisons use what the founder actually confirmed.
    const confirmed = { ...assessment.inputs, idea_text: input.idea_text, sector, sub_sector: input.sub_sector, region: input.region };
    const saved = await getSupabase().from('assessments').update({ scenario_inputs: confirmed }).eq('assessment_id', assessment.assessment_id);
    if (saved.error) throw saved.error;

    // A fresh context for this analysis only: it carries the trusted ids, and collects the search record and the result.
    const analysis = new RequestContext();
    analysis.set('userId', userId);
    analysis.set('assessmentId', assessment.assessment_id);
    // web_search adds the sector-specific approved sites for the founder's ISIC4 section.
    analysis.set('isicSection', sector);
    analysis.set('isicDivision', input.sub_sector);
    // extract_and_verify_profile scores web companies against the confirmed idea, like similarity_search does.
    analysis.set('ideaText', input.idea_text);

    const mastra = (context as { mastra?: { getAgentById?: (id: string) => typeof competitorAgent } })?.mastra;
    const agent = mastra?.getAgentById?.('competitor-agent') ?? competitorAgent;
    await agent.generate(
      [
        `assessment_id: ${assessment.assessment_id}`,
        `Language for any text: ${input.language === 'ar' ? 'Arabic' : 'English'}`,
        `Sector (ISIC4 section ${sector}): ${ISIC_SECTIONS[sector].en}`,
        `Sub-sector (ISIC4 division ${input.sub_sector}): ${ISIC_DIVISIONS[input.sub_sector].en}`,
        `Region in Saudi Arabia: ${input.region}`,
        `Startup idea: ${input.idea_text}`,
      ].join('\n'),
      { requestContext: analysis, maxSteps: MAX_TOOL_STEPS },
    );

    // Only finalize_competitors' own result is trusted. If it never ran, the analysis did not finish.
    const checked = DelegateCompetitorOutput.safeParse(analysis.get(FINALIZE_OUTPUT_KEY));
    if (!checked.success) return fail('error', 'The competitor search did not finish.');
    if (checked.data.status !== 'ok') return checked.data;

    // The comparison matrix, from stored data only. If it cannot be built, the competitors are still returned.
    try {
      const comparison_matrix = await buildComparisonMatrix(
        { idea_text: input.idea_text, sector, sub_sector: input.sub_sector, region: input.region },
        checked.data.competitors,
      );
      return { ...checked.data, comparison_matrix };
    } catch (error) {
      console.error('Comparison matrix failed:', error);
      return { ...checked.data, comparison_matrix: null };
    }
  } catch (error) {
    console.error('Competitor analysis failed:', error);
    return fail('error', 'The competitor analysis failed.');
  }
}

export const delegateCompetitorAnalysisTool = createTool({
  id: 'delegate_competitor_analysis',
  description:
    "Finds the closest competitors of a confirmed idea in Darb's dataset and computes the ISS. Use it only after the founder explicitly confirms the idea, sector, sub-sector and region.",
  inputSchema: DelegateCompetitorInput,
  outputSchema: DelegateCompetitorOutput,
  execute: async (input, context) => {
    // Enforced in code, not only in the instructions: the founder must have confirmed a restated summary first.
    if (!analysisWasConfirmed(context, input.sub_sector)) {
      throw new Error(
        'Not confirmed yet. First restate the idea, sector, sub-sector (with its 2-digit code) and region to the founder, ask them to confirm, and wait for their reply.',
      );
    }
    return runCompetitorAnalysis(input, context);
  },
});
