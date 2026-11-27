// Tool: "how can I differ from Hungerstation?" answered from Darb's saved analysis only, written by code.
// The model only decides that the founder asked this and names the competitor; code writes the whole reply
// (lib/reply-guard.ts), so it can never add strategies or feature ideas of its own (it did with every prompt wording).
// The reply: where the analysis found the competitor the same as the idea, its opportunity with the next step
// (the same sentence as in the analysis), and that the differentiator is the founder's to choose (a what-if checks it).
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getUserId, loadOwnedAssessment } from '../lib/assessments';
import { opportunitySentences } from '../lib/competitor-notes';
import { normalizeName } from '../lib/competitor-policy';
import { loadStoredResult, type StoredResult } from '../lib/competitor-store';
import { laterIdeas } from '../lib/conversation-ideas';
import { REPLY_RULES_KEY, type ReplyRules } from '../lib/reply-guard';
import { getSupabase } from '../lib/supabase';
import type { Language } from '../schemas/competitor';

type Part = 'problem' | 'customer' | 'offering';
const PART_NAMES: Record<Language, Record<Part, string>> = {
  en: { problem: 'the problem', customer: 'the customer', offering: 'the offering' },
  ar: { problem: 'المشكلة', customer: 'العميل', offering: 'المنتج' },
};

function listOf(items: string[], language: Language): string {
  if (items.length <= 1) return items.join('');
  if (language === 'ar') return items.join(' و'); // المشكلة والعميل والمنتج
  return items.length === 2 ? `${items[0]} and ${items[1]}` : `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

// The first sentence: what the analysis found the same (and partly the same), from the judge's answers.
export function samenessSentence(name: string, comparison: Partial<Record<Part, { answer?: string }>> | null, language: Language): string {
  const parts: Part[] = ['problem', 'customer', 'offering'];
  const same = parts.filter((p) => comparison?.[p]?.answer === 'same').map((p) => PART_NAMES[language][p]);
  const partly = parts.filter((p) => comparison?.[p]?.answer === 'partly').map((p) => PART_NAMES[language][p]);
  if (language === 'ar') {
    if (!same.length && !partly.length) return `لم يجد تحليل درب أن ${name} يطابق فكرتك في أي جانب.`;
    const a = same.length ? `يطابق فكرتك في ${listOf(same, 'ar')}` : '';
    const b = partly.length ? `${a ? '، ويطابقها جزئيًا في ' : 'يطابق فكرتك جزئيًا في '}${listOf(partly, 'ar')}` : '';
    return `وجد تحليل درب أن ${name} ${a}${b}.`;
  }
  if (!same.length && !partly.length) return `Darb's analysis did not find ${name} the same as your idea in any part.`;
  const a = same.length ? `the same as your idea in ${listOf(same, 'en')}` : '';
  const b = partly.length ? `${a ? ', and partly the same in ' : 'partly the same as your idea in '}${listOf(partly, 'en')}` : '';
  return `Darb's analysis found ${name} ${a}${b}.`;
}

export const CHOOSE_SENTENCE: Record<Language, string> = {
  en: 'The differentiator is yours to choose: describe it here, and Darb can check it against these competitors as a what-if.',
  ar: 'اختيار ما يميّزك قرارك أنت: صِفه هنا، ويستطيع درب مقارنته بهؤلاء المنافسين في تحليل «ماذا لو».',
};

export const explainDifferenceTool = createTool({
  id: 'explain_difference',
  description:
    'Only when the founder asks how to differ from, compete with or stand out from a competitor already shown in this conversation. Give the competitor\'s name as shown on its card. Darb shows the answer, written from the saved analysis, word for word: write nothing yourself.',
  inputSchema: z.object({ competitor_name: z.string().min(1).describe('The competitor the founder asks about, as its name appears in the saved analysis') }),
  outputSchema: z.object({
    status: z.enum(['ok', 'not_found', 'not_analysed', 'no_assessment', 'error']),
    sentences: z.array(z.string()).optional(),
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
      for (const one of all) {
        const stored = await loadStoredResult(one.assessment_id);
        if (stored.analysed_at) competitors.push(...stored.competitors);
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
      const [opportunity] = shown.opportunity ? opportunitySentences({ competitors: [shown as never] }, language) : [];
      const sentences = [samenessSentence(shown.name, shown.comparison, language), ...(opportunity ? [opportunity] : []), CHOOSE_SENTENCE[language]];
      if (rules) {
        rules.language = language;
        rules.sentences = sentences;
        rules.codeWritesReply = true;
      }
      return { status: 'ok' as const, sentences };
    } catch (error) {
      console.error('explain_difference failed:', error);
      return { status: 'error' as const };
    }
  },
});
