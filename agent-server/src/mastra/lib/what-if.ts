// What-if analyses (design §4, explainer §8): "what if I targeted Jeddah?" Each what-if is a new assessment of the
// same idea, linked to the one it changes (parent_assessment_id, migration 0019), so the original never changes.
// Decided in code, never by a model:
//   askedBeforeLatestReply  a what-if runs only after Darb asked the founder to confirm it and the founder answered
//   createWhatIf / removeWhatIf  the new assessment, and removing it again when nothing was saved for it
//   compareResults / comparisonSentences  the exact before → after comparison, from the saved results
import type { Language, Result } from '../schemas/competitor';
import { issBand } from './competitor-notes';
import { hostOf, normalizeName } from './competitor-policy';
import type { StoredResult } from './competitor-store';
import { getSupabase } from './supabase';

type Part = { type?: string; text?: string };
type MessageLike = { role: string; content: unknown };

const textOf = (m: MessageLike): string =>
  typeof m.content === 'string'
    ? m.content
    : Array.isArray(m.content)
      ? (m.content as Part[]).map((p) => (p.type === 'text' ? (p.text ?? '') : '')).join(' ')
      : '';

// The confirmation rule: Darb's last message before the founder's latest one asked a question, so the founder's
// latest message answers it. A what-if uses one of the founder's analyses, so it never runs on a first mention.
export function askedBeforeLatestReply(messages: readonly MessageLike[] | undefined): boolean {
  const list = messages ?? [];
  let latestUser = -1;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].role === 'user') {
      latestUser = i;
      break;
    }
  }
  for (let i = latestUser - 1; i >= 0; i--) {
    if (list[i].role !== 'assistant') continue;
    const text = textOf(list[i]).trim();
    if (text) return /[?؟]/.test(text);
  }
  return false;
}

// The new assessment of the same idea, linked to the one it changes. Returns its id.
export async function createWhatIf(
  parent: { assessment_id: string; idea_id: string; language: Language },
  label: string,
  ideaText: string,
): Promise<string> {
  const { data, error } = await getSupabase()
    .from('assessments')
    .insert({
      idea_id: parent.idea_id,
      language: parent.language,
      status: 'in_progress',
      parent_assessment_id: parent.assessment_id,
      scenario_label: label,
      scenario_inputs: { idea_text: ideaText },
    })
    .select('assessment_id')
    .single();
  if (error) throw error;
  return data.assessment_id as string;
}

// Removes a what-if that ended with nothing saved (a question to the founder, a limit, or a failed run),
// so History never shows an empty what-if.
export async function removeWhatIf(assessmentId: string): Promise<void> {
  const { error } = await getSupabase().from('assessments').delete().eq('assessment_id', assessmentId).not('parent_assessment_id', 'is', null);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// The comparison
// ---------------------------------------------------------------------------

export type Comparison = {
  original_analysed: boolean;
  iss: { before: number | null; after: number | null };
  market_level: { before: Result['market_level']; after: Result['market_level'] };
  new_competitors: string[];
  dropped_competitors: string[];
};

type Named = { name: string; website: string | null; startup_id?: string | null };

// The same company on both sides: same startup, same website, or the same name after normalizing.
const companyKey = (c: Named) => c.startup_id ?? hostOf(c.website) ?? `name:${normalizeName(c.name)}`;

export function compareResults(before: StoredResult | null, after: Pick<Result, 'iss' | 'market_level' | 'competitors'>): Comparison {
  const beforeList = before?.competitors ?? [];
  const beforeKeys = new Set(beforeList.map(companyKey));
  const afterKeys = new Set(after.competitors.map(companyKey));
  return {
    original_analysed: Boolean(before?.analysed_at),
    iss: { before: before?.iss ?? null, after: after.iss },
    market_level: { before: before?.market_level ?? null, after: after.market_level },
    new_competitors: after.competitors.filter((c) => !beforeKeys.has(companyKey(c))).map((c) => c.name),
    dropped_competitors: beforeList.filter((c) => !afterKeys.has(companyKey(c))).map((c) => c.name),
  };
}

const MARKET_WORD = {
  open: { en: 'Open', ar: 'مفتوح' },
  competitive: { en: 'Competitive', ar: 'تنافسي' },
  crowded: { en: 'Crowded', ar: 'مزدحم' },
} as const;
const ISS_WORD = {
  higher: { en: 'higher similarity', ar: 'تشابه مرتفع' },
  moderate: { en: 'moderate similarity', ar: 'تشابه متوسط' },
  lower: { en: 'lower similarity', ar: 'تشابه منخفض' },
} as const;

// The comparison in the founder's language, written in code so no change can be invented or reworded.
export function comparisonSentences(c: Comparison, language: Language): string[] {
  const ar = language === 'ar';
  if (!c.original_analysed) {
    return [ar ? 'لا يوجد تحليل محفوظ لفكرتك الأصلية للمقارنة به.' : 'Your original idea has no saved analysis to compare with.'];
  }
  const issText = (iss: number | null) =>
    iss === null ? (ar ? 'لا يوجد' : 'none') : `${iss} (${ISS_WORD[issBand(iss)][language]})`;
  const marketText = (level: Result['market_level']) => (level ? MARKET_WORD[level][language] : ar ? 'لا يوجد' : 'none');
  const list = (names: string[]) => names.join(ar ? '، ' : ', ');

  const lines = [
    ar
      ? `مقارنةً بفكرتك الأصلية: مؤشر تشابه الفكرة ${issText(c.iss.before)} ← ${issText(c.iss.after)}.`
      : `Compared with your original idea: Idea Similarity Score ${issText(c.iss.before)} → ${issText(c.iss.after)}.`,
    ar
      ? `السوق: ${marketText(c.market_level.before)} ← ${marketText(c.market_level.after)}.`
      : `Market: ${marketText(c.market_level.before)} → ${marketText(c.market_level.after)}.`,
  ];
  if (c.new_competitors.length) lines.push(ar ? `منافسون جدد: ${list(c.new_competitors)}.` : `New competitors: ${list(c.new_competitors)}.`);
  if (c.dropped_competitors.length) {
    lines.push(ar ? `لم يعودوا ضمن المنافسين: ${list(c.dropped_competitors)}.` : `No longer shown: ${list(c.dropped_competitors)}.`);
  }
  if (!c.new_competitors.length && !c.dropped_competitors.length) {
    lines.push(ar ? 'المنافسون أنفسهم في النسختين.' : 'The same competitors appear in both versions.');
  }
  return lines;
}
