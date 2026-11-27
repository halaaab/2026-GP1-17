// The Competitor Agent returns notes as codes. This table turns each code into one short sentence
// in the founder's language, in code, so the wording never depends on a model.
import { ISS_BANDS } from '../config/scoring';
import type { Language, NoteCode, OpportunityKind, Result } from '../schemas/competitor';

export const NOTE_TEXT: Record<NoteCode, Record<Language, string>> = {
  capability_pending: {
    en: "Darb's competitor search is still being built, so no competitors can be shown yet.",
    ar: 'البحث عن المنافسين في درب ما زال قيد التطوير، لذلك لا يمكن عرض منافسين حاليًا.',
  },
  none_found: {
    en: 'No confirmed competitors were found in our sources.',
    ar: 'لم نجد منافسين مؤكدين في مصادرنا.',
  },
  fewer_than_three: {
    en: 'Fewer than three competitors passed our checks, so only those are shown.',
    ar: 'اجتاز فحوصاتنا أقل من ثلاثة منافسين، لذلك نعرضهم فقط.',
  },
  only_indirect: {
    en: 'Only indirect competitors were found: they solve the same problem in a different way or for a different customer.',
    ar: 'وجدنا منافسين غير مباشرين فقط: يحلّون المشكلة نفسها بطريقة أخرى أو لعميل مختلف.',
  },
  customer_unknown: {
    en: 'Your target customer is not clear yet, so the comparison uses the problem and the offering only.',
    ar: 'العميل المستهدف غير واضح بعد، لذلك اعتمدت المقارنة على المشكلة والمنتج فقط.',
  },
  web_search_failed: {
    en: 'The web search did not work this time, so results come from Darb’s startup records only.',
    ar: 'لم ينجح البحث في الويب هذه المرة، لذلك النتائج من سجلات الشركات الناشئة في درب فقط.',
  },
  judge_call_failed: {
    en: 'One possible competitor could not be checked and was left out.',
    ar: 'تعذّر فحص أحد المنافسين المحتملين، لذلك لم يُعرض.',
  },
  web_changed: {
    en: 'Some websites changed since the last check, so the results may differ slightly.',
    ar: 'تغيّرت بعض المواقع منذ آخر فحص، لذلك قد تختلف النتائج قليلًا.',
  },
  temporarily_unavailable: {
    en: 'We apologise, the competitor search is temporarily unavailable. Please try again a little later.',
    ar: 'نعتذر منك، البحث عن المنافسين غير متاح مؤقتًا. نرجو المحاولة مرة أخرى بعد قليل.',
  },
  analysis_incomplete: {
    en: 'We apologise, the competitor analysis did not finish this time. You are welcome to try again.',
    ar: 'نعتذر منك، لم يكتمل تحليل المنافسين هذه المرة. يسعدنا أن تحاول مرة أخرى.',
  },
  daily_limit_reached: {
    en: 'You have used all of today’s competitor analyses. You are welcome to run a new one tomorrow (after midnight, Saudi time).',
    ar: 'لقد استخدمت جميع تحليلات المنافسين المتاحة لك اليوم. يسعدنا أن تُجري تحليلاً جديدًا غدًا (بعد منتصف الليل بتوقيت السعودية).',
  },
  monthly_limit_reached: {
    en: 'You have used all of this month’s competitor analyses. You are welcome to run a new one next month.',
    ar: 'لقد استخدمت جميع تحليلات المنافسين المتاحة لك هذا الشهر. يسعدنا أن تُجري تحليلاً جديدًا في الشهر القادم.',
  },
  time_limit_reached: {
    en: 'The search took longer than allowed, so only the competitors checked in time are shown.',
    ar: 'استغرق البحث وقتًا أطول من المسموح، لذلك نعرض فقط المنافسين الذين تم فحصهم في الوقت المحدد.',
  },
};

// ---------------------------------------------------------------------------
// The summary and the competitive opportunities, also written in code, never by a model.
// ---------------------------------------------------------------------------

const ISS_WORDS = {
  higher: { en: 'higher similarity', ar: 'تشابه مرتفع' },
  moderate: { en: 'moderate similarity', ar: 'تشابه متوسط' },
  lower: { en: 'lower similarity', ar: 'تشابه منخفض' },
} as const;

const MARKET_TEXT = {
  open: { en: 'Market: Open. Few direct competitors were found in our sources; others may still exist.', ar: 'السوق: مفتوح. وجدنا منافسين مباشرين قليلين في مصادرنا، وقد يوجد غيرهم.' },
  competitive: { en: 'Market: Competitive. Several direct competitors were found in our sources.', ar: 'السوق: تنافسي. وجدنا عدة منافسين مباشرين في مصادرنا.' },
  crowded: { en: 'Market: Crowded. The competitors shown are the closest of many.', ar: 'السوق: مزدحم. المنافسون المعروضون هم الأقرب من بين كثيرين.' },
} as const;

export const OPPORTUNITY_TEXT: Record<OpportunityKind, { title: Record<Language, string>; next: Record<Language, string>; text?: Record<Language, string> }> = {
  proven_difference: {
    title: { en: 'Proven difference', ar: 'اختلاف مثبت' },
    text: { en: 'Your customer differs from this competitor’s.', ar: 'عميلك يختلف عن عملاء هذا المنافس.' },
    next: { en: 'Interview your target customers.', ar: 'قابل عملاءك المستهدفين.' },
  },
  possible_customer_difference: {
    title: { en: 'Possible customer difference', ar: 'اختلاف محتمل في العملاء' },
    text: { en: 'You focus on a narrower group of customers than this competitor.', ar: 'تركّز على فئة أضيق من العملاء مقارنة بهذا المنافس.' },
    next: { en: 'Interview your target customers.', ar: 'قابل عملاءك المستهدفين.' },
  },
  possible_difference: {
    title: { en: 'Possible difference', ar: 'اختلاف محتمل' },
    text: { en: 'Your offering differs in part from this competitor’s.', ar: 'منتجك يختلف جزئيًا عن منتج هذا المنافس.' },
    next: { en: 'Validate this differentiator with customers.', ar: 'تحقّق من هذا الاختلاف مع العملاء.' },
  },
  no_clear_difference: {
    title: { en: 'No clear difference', ar: 'لا يوجد اختلاف واضح' },
    text: { en: 'It already offers the same core service.', ar: 'يقدّم هذا المنافس الخدمة الأساسية نفسها.' },
    next: { en: 'Test one specific differentiator.', ar: 'اختبر ميزة واحدة محددة تميّزك.' },
  },
  not_enough_evidence: {
    title: { en: 'Not enough evidence yet', ar: 'لا توجد أدلة كافية بعد' },
    text: { en: 'Our sources do not say enough about this competitor to compare.', ar: 'لا تكفي المعلومات في مصادرنا عن هذا المنافس للمقارنة.' },
    next: { en: 'Gather more evidence about this competitor.', ar: 'اجمع أدلة أكثر عن هذا المنافس.' },
  },
};

const NEXT_STEP = { en: 'Next step', ar: 'الخطوة التالية' } as const;

export function issBand(iss: number): keyof typeof ISS_WORDS {
  return iss >= ISS_BANDS.higher ? 'higher' : iss >= ISS_BANDS.moderate ? 'moderate' : 'lower';
}

// The ISS and market lines of a result with competitors; empty when nothing was found.
export function summarySentences(result: Pick<Result, 'iss' | 'market_level'>, language: Language): string[] {
  const lines: string[] = [];
  if (result.iss !== null) {
    lines.push(
      language === 'ar'
        ? `مؤشر تشابه الفكرة: ${result.iss} من 100 (${ISS_WORDS[issBand(result.iss)].ar}).`
        : `Idea Similarity Score: ${result.iss} out of 100 (${ISS_WORDS[issBand(result.iss)].en}).`,
    );
  }
  if (result.market_level) lines.push(MARKET_TEXT[result.market_level][language]);
  return lines;
}

// One line per competitor: the opportunity, what it means (the judge's own difference sentence for a possible
// difference), and the fixed next step. Company names stay as the source writes them.
export function opportunitySentences(result: Pick<Result, 'competitors'>, language: Language): string[] {
  return result.competitors
    .filter((c) => c.opportunity)
    .map((c) => {
      const text = OPPORTUNITY_TEXT[c.opportunity!];
      // only the offering rule uses the judge's own sentence; the others have a fixed message
      const meaning = c.opportunity === 'possible_difference' && c.difference ? c.difference : text.text![language];
      return `${text.title[language]} (${c.name}): ${meaning} ${NEXT_STEP[language]}: ${text.next[language]}`;
    });
}

// The sentences for a result's notes, in order.
export function noteSentences(notes: readonly NoteCode[], language: Language): string[] {
  return notes.map((code) => NOTE_TEXT[code][language]);
}

// The one sentence above the competitor cards. Code writes the whole reply when cards are shown,
// so the model can never list the competitors again in its own words (it did in every analysis).
export function cardsSentence(count: number, language: Language): string {
  // In Darb's voice (config/darb-persona.ts), with the real count.
  if (language === 'ar') {
    const found = count === 1 ? 'منافسًا واحدًا مرتبطًا' : count === 2 ? 'منافسَين مرتبطَين' : `${count} منافسين مرتبطين`;
    return `اكتمل التحليل! ✅ وجدتُ ${found} بفكرة مشروعك. تعرض البطاقات أدناه كل منافس مع أدلته، وتجد الفرص المحتملة لتميّز مشروعك في التحليل الكامل.`;
  }
  const found = count === 1 ? 'one relevant competitor' : count === 2 ? 'two relevant competitors' : `${count} relevant competitors`;
  return `Your analysis is ready! ✅ I identified ${found}. The cards below show each one with its evidence, and the full analysis shows potential opportunities for your business.`;
}
