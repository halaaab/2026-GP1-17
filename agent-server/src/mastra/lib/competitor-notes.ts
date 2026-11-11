// The Competitor Agent returns notes as codes. This table turns each code into one short sentence
// in the founder's language, in code, so the wording never depends on a model (design §11).
import type { Language, NoteCode } from '../schemas/competitor';

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
    en: 'The competitor search is temporarily unavailable. Please try again later.',
    ar: 'البحث عن المنافسين غير متاح مؤقتًا. حاول مرة أخرى لاحقًا.',
  },
  analysis_incomplete: {
    en: 'The competitor analysis did not finish this time. You can try again.',
    ar: 'لم يكتمل تحليل المنافسين هذه المرة. يمكنك المحاولة مرة أخرى.',
  },
  daily_limit_reached: {
    en: 'You have used today’s competitor analyses. You can run a new one tomorrow.',
    ar: 'استخدمت كل تحليلات المنافسين المتاحة لك اليوم. يمكنك إجراء تحليل جديد غدًا.',
  },
  monthly_limit_reached: {
    en: 'You have used this month’s competitor analyses. You can run a new one next month.',
    ar: 'استخدمت كل تحليلات المنافسين المتاحة لك هذا الشهر. يمكنك إجراء تحليل جديد الشهر القادم.',
  },
  time_limit_reached: {
    en: 'The search took longer than allowed, so only the competitors checked in time are shown.',
    ar: 'استغرق البحث وقتًا أطول من المسموح، لذلك نعرض فقط المنافسين الذين تم فحصهم في الوقت المحدد.',
  },
};

// The sentences for a result's notes, in order.
export function noteSentences(notes: readonly NoteCode[], language: Language): string[] {
  return notes.map((code) => NOTE_TEXT[code][language]);
}
