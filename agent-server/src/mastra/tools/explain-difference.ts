// Tool: "how can I differ from Hungerstation?" answered from Darb's saved analysis only.
// It returns that competitor's saved facts (what it offers, the three comparison notes, the difference the judge
// found and the opportunity's next step) and the exact shape of the answer. The Conversational Agent writes the answer
// from these facts in Darb's voice: a template made of labels ("the same in the problem and the offering") told the
// founder nothing, and the model's own strategies (its first answers) were not from Darb's sources.
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getUserId, loadOwnedAssessment } from '../lib/assessments';
import { OPPORTUNITY_TEXT } from '../lib/competitor-notes';
import { normalizeName } from '../lib/competitor-policy';
import { loadStoredResult, type StoredResult } from '../lib/competitor-store';
import { laterIdeas } from '../lib/conversation-ideas';
import { REPLY_RULES_KEY, type ReplyRules } from '../lib/reply-guard';
import { getSupabase } from '../lib/supabase';
import type { Language } from '../schemas/competitor';

// The labels of the answer's lines; the chat page shows an icon beside each (frontend chatbot.js, formatReply).
export const ANSWER_LABELS: Record<Language, { standOut: string; nextStep: string }> = {
  en: { standOut: 'Where you could stand out:', nextStep: 'Next step:' },
  ar: { standOut: 'أين يمكنك التميّز:', nextStep: 'الخطوة التالية:' },
};

// The shape of the answer, given to the model with the facts.
export function answerShape(name: string, language: Language, differenceFound = true): string {
  const label = ANSWER_LABELS[language];
  return [
    `Write the answer in ${language === 'ar' ? 'Arabic' : 'English'}, to the founder ("you", "your idea"), in exactly these four lines and nothing else:`,
    `1. One sentence on what ${name} already shares with the founder's idea, from shares (what it is, the problem and the customers).`,
    differenceFound
      ? `2. "**${label.standOut}**" then one or two sentences from stand_out and your_idea only: what ${name} does beyond the idea, and the idea's own focus (its customers and offering from your_idea), and why that sharper focus can be the founder's difference.`
      : `2. "**${label.standOut}**" then one sentence saying plainly that Darb's analysis found no clear difference yet: ${name} already offers the same core service, so the founder's difference has to come from their focus (your_idea). Do not suggest what the difference could be.`,
    `3. "**${label.nextStep}**" then ONE concrete new idea for a feature or service the founder could test to stand out from ${name}: built for the customers in your_idea and aimed at the gap in stand_out (what ${name} does not focus on). Say it as an idea to test with those customers (next_step), in one or two sentences. One idea only, never a list, and never a claim that it will succeed or that ${name} lacks it.`,
    `4. One sentence inviting the founder to describe a feature they have in mind, so Darb can check it against ${name} and the other competitors.`,
    'Lines 1 and 2 use only these facts. The idea in line 3 is the only suggestion of your own: no other features, prices, partnerships or examples anywhere. No emoji, no closing offer.',
  ].join('\n');
}

export const explainDifferenceTool = createTool({
  id: 'explain_difference',
  description:
    'Only when the founder asks how to differ from, compete with or stand out from a competitor already shown in this conversation. Give the competitor\'s name as shown on its card. It returns that competitor\'s saved facts and how_to_answer: write the answer exactly as how_to_answer says, from these facts only.',
  inputSchema: z.object({ competitor_name: z.string().min(1).describe('The competitor the founder asks about, as its name appears in the saved analysis') }),
  outputSchema: z.object({
    status: z.enum(['ok', 'not_found', 'not_analysed', 'no_assessment', 'error']),
    competitor: z.string().optional(),
    facts: z
      .object({
        your_idea: z.array(z.string()),
        shares: z.array(z.string()),
        stand_out: z.array(z.string()),
        next_step: z.string(),
      })
      .optional(),
    how_to_answer: z.string().optional(),
    // when the name did not match: the competitors of this conversation, to call again with one of them
    competitor_names: z.array(z.string()).optional(),
  }),
  execute: async ({ competitor_name }, context) => {
    const requestContext = (context as { requestContext?: { get: (key: string) => unknown } } | undefined)?.requestContext;
    const assessmentId = requestContext?.get('assessmentId');
    const userId = getUserId(context);
    if (typeof assessmentId !== 'string' || !assessmentId || !userId) return { status: 'no_assessment' as const };
    try {
      const assessment = await loadOwnedAssessment(assessmentId, userId);
      if (!assessment) return { status: 'no_assessment' as const };
      const rules = requestContext?.get(REPLY_RULES_KEY) as ReplyRules | undefined;
      const language: Language = rules?.founderLanguage ?? rules?.language ?? assessment.language;

      // every analysed idea of the conversation, latest first, so a name shown twice answers for the latest idea
      const later = await laterIdeas(assessment.assessment_id).catch(() => []);
      const all = [assessment, ...later].reverse();
      const competitors: StoredResult['competitors'] = [];
      const ideaOf = new Map<StoredResult['competitors'][number], string>(); // each competitor's idea (idea_id)
      for (const one of all) {
        const stored = await loadStoredResult(one.assessment_id);
        if (!stored.analysed_at) continue;
        competitors.push(...stored.competitors);
        for (const c of stored.competitors) ideaOf.set(c, one.idea_id);
      }
      if (!competitors.length) return { status: 'not_analysed' as const };

      // A startup from Darb's list also answers to its other name ("جاهز" for Jahez).
      const ids = competitors.map((c) => c.startup_id).filter((id): id is string => Boolean(id));
      const otherNames = new Map<string, string[]>();
      if (ids.length) {
        const { data } = await getSupabase().from('startups').select('startup_id, startup_name, startup_name_ar').in('startup_id', ids);
        for (const row of Array.isArray(data) ? data : []) otherNames.set(row.startup_id, [row.startup_name, row.startup_name_ar].filter(Boolean));
      }
      const namesOf = (c: (typeof competitors)[number]) => [c.name, ...(c.startup_id ? (otherNames.get(c.startup_id) ?? []) : [])].map(normalizeName);
      const wanted = normalizeName(competitor_name);
      const match = competitors.find((c) => namesOf(c).includes(wanted)) ?? competitors.find((c) =>
        wanted.length >= 3 && namesOf(c).some((name) => name.length >= 3 && (name.includes(wanted) || wanted.includes(name))),
      );
      if (!match) return { status: 'not_found' as const, competitor_names: [...new Set(competitors.map((c) => c.name))] };

      // the name in the founder's language when Darb's list has it ("جاهز" in an Arabic reply)
      const arabicName = match.startup_id ? (otherNames.get(match.startup_id) ?? []).find((n) => /[\u0600-\u06FF]/.test(n)) : undefined;
      const shown = language === 'ar' && arabicName ? { ...match, name: arabicName } : match;
      // The facts, all from the saved analysis: what it is and what it shares, and where the idea differs.
      const notes = shown.comparison ?? null;
      // A difference sentence the judge wrote is a difference, even when every part was answered "same" (the
      // opportunity was then "no clear difference", and the founder was told so beside "it also delivers groceries").
      const hasDifference = Boolean(shown.difference?.trim());
      const kind = hasDifference && (shown.opportunity ?? 'no_clear_difference') === 'no_clear_difference' ? 'possible_difference' : (shown.opportunity ?? 'no_clear_difference');
      const opportunity = OPPORTUNITY_TEXT[kind];
      // The founder's own idea as Darb understood it (startup_ideas.idea_summary, in their language): its focus.
      const { data: ideaRow } = await getSupabase().from('startup_ideas').select('idea_summary').eq('idea_id', ideaOf.get(match) ?? '').maybeSingle();
      const summary = (ideaRow?.idea_summary ?? null) as Record<string, unknown> | null;
      const ideaParts = ((summary?.[language] as Record<string, string | null> | undefined) ?? summary ?? {}) as Record<string, string | null>;
      const yourIdea = (['customer', 'offering', 'market'] as const)
        .filter((part) => typeof ideaParts[part] === 'string' && ideaParts[part])
        .map((part) => `${part}: ${ideaParts[part]}`);
      const shares = [shown.description, shown.reason, notes?.problem?.answer === 'same' ? notes.problem.note : null, notes?.offering?.answer === 'same' ? notes.offering.note : null]
        .filter((t): t is string => Boolean(t && t.trim()));
      const standOut = [
        shown.difference,
        notes?.customer && notes.customer.answer !== 'same' ? notes.customer.note : null,
        notes?.offering && notes.offering.answer !== 'same' ? notes.offering.note : null,
        notes?.problem && notes.problem.answer !== 'same' ? notes.problem.note : null,
        hasDifference ? null : (opportunity.text?.[language] ?? null),
      ].filter((t): t is string => Boolean(t && t.trim()));
      if (rules) rules.language = language;
      return {
        status: 'ok' as const,
        competitor: shown.name,
        facts: { your_idea: yourIdea, shares, stand_out: [...new Set(standOut)], next_step: opportunity.next[language] },
        how_to_answer: answerShape(shown.name, language, hasDifference || (kind !== 'no_clear_difference' && kind !== 'not_enough_evidence')),
      };
    } catch (error) {
      console.error('explain_difference failed:', error);
      return { status: 'error' as const };
    }
  },
});
