// Small text checks done in code, so they never depend on a model:
//   detectLanguage   is this text Arabic or English?
//   conversationLanguage  the language Darb keeps: a message changes it only when it is clearly written in the other
//                    language, so a city, a company name or "ok" never switches the reply
// keepStatedFacts keeps only the known_facts the founder really said (stated facts only).
//   isDecline, isAffirmative  a clear "no / not now", and a clear yes to Darb's what-if question
import type { Handoff, Language } from '../schemas/competitor';

// Arabic when it has at least as many Arabic letters as Latin ones. null when there are no letters at all.
export function detectLanguage(text: string): Language | null {
  const arabic = (text.match(/[؀-ۿ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (arabic === 0 && latin === 0) return null;
  return arabic >= latin ? 'ar' : 'en';
}

// The language a message is clearly written in, or null when it is too short or only names:
//   Arabic   at least 2 Arabic words, so an Arabic message with English terms ("SaaS", "POS") stays Arabic
//   English  at least 3 English words and at most one Arabic word
//   null     anything shorter: "Jeddah", "ok", "STC", "نعم"
export function clearLanguage(text: string): Language | null {
  const words = text.split(/[^A-Za-z؀-ۿ]+/).filter(Boolean);
  const arabic = words.filter((w) => /[؀-ۿ]/.test(w)).length;
  const latin = words.filter((w) => /^[A-Za-z]+$/.test(w)).length;
  if (arabic >= 2) return 'ar';
  if (latin >= 3 && arabic <= 1) return 'en';
  return null;
}

// The conversation's language from the founder's messages, oldest first: the latest message that is clearly in one
// language decides. When none is, the latest message's letters decide, as before.
export function conversationLanguage(founderMessages: readonly string[]): Language | null {
  for (let i = founderMessages.length - 1; i >= 0; i--) {
    const language = clearLanguage(founderMessages[i]);
    if (language) return language;
  }
  return detectLanguage(founderMessages.at(-1) ?? '');
}

// Common words that say nothing about the idea, so they are not counted.
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'who', 'want', 'need', 'needs', 'app', 'into', 'their', 'they', 'are', 'can', 'will', 'our', 'your',
  'في', 'من', 'على', 'الى', 'إلى', 'عن', 'مع', 'التي', 'الذي', 'هذا', 'هذه', 'ابي', 'ابغى', 'اريد', 'أريد', 'فكرتي', 'تطبيق',
]);

// Lowercase words without diacritics or punctuation; Arabic letter forms unified, "ال" removed from the front.
export function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '') // Arabic diacritics and tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .split(/[^a-z0-9؀-ۿ]+/)
    .map((w) => (w.startsWith('ال') && w.length > 4 ? w.slice(2) : w))
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

// Two words match when they are the same, or one starts with the other (office / offices, مطعم / مطاعم is not caught).
const sameWord = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));

// A fact counts as stated when most of its words appear in what the founder wrote.
export function isStated(fact: string, founderText: string, share = 0.6): boolean {
  const factWords = contentWords(fact);
  if (factWords.length === 0) return false;
  const founderWords = contentWords(founderText);
  const found = factWords.filter((w) => founderWords.some((f) => sameWord(w, f))).length;
  return found / factWords.length >= share;
}

type KnownFacts = NonNullable<Handoff['known_facts']>;

// Keeps the facts the founder stated and returns the names of the ones dropped as guesses.
export function keepStatedFacts(facts: KnownFacts | undefined, founderText: string): { kept: KnownFacts | undefined; dropped: string[] } {
  if (!facts) return { kept: undefined, dropped: [] };
  const kept: KnownFacts = {};
  const dropped: string[] = [];
  for (const [name, value] of Object.entries(facts) as [keyof KnownFacts, string][]) {
    if (isStated(value, founderText)) kept[name] = value;
    else dropped.push(name);
  }
  return { kept: Object.keys(kept).length ? kept : undefined, dropped };
}

// ---------------------------------------------------------------------------
// The founder's short answers.

// Arabic letter forms unified and diacritics removed, so "حلّل" and "حلل" match the same pattern.
const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();

// A clear "no" or "not now": the founder does not want the analysis (or the what-if) now.
const DECLINE_EN = /^(no|nope|nah|not now|not yet|later|maybe later|no thanks|no thank you)\b|\b(not now|not yet|maybe later|don't (run|start|analy[sz]e)|do not (run|start|analy[sz]e))\b/;
const DECLINE_AR = /^(لا|لأ|لاء|لا شكرا|مو الحين|مو الان|ليس الان|بعدين|لاحقا|خلها بعدين|ما ابي|ما ابغي|ما ابغا)(\s|$|[،,.!؟?])|(مو الحين|مو الان|ليس الان|بعدين|لاحقا|ما ابي تحليل|لا تبدا|لا تحلل)/;

export function isDecline(text: string): boolean {
  const t = plain(text);
  return DECLINE_EN.test(t) || DECLINE_AR.test(t);
}

// A clear yes to Darb's what-if question: a short agreement or "start / go ahead".
const YES_EN = /^(yes|yeah|yep|yup|sure|ok|okay|of course|definitely|absolutely|please|go ahead|go for it|let'?s|start|do it|sounds good|why not|alright|all right)\b|\b(go ahead|let'?s (do it|start|go|begin|get started)|start (it|the analysis)|run it|do it|yes please)\b/;
const YES_AR = /^(اي|ايه|ايوه|ايوا|اكيد|نعم|اجل|تمام|طيب|يلا|ابدا|ابدء|موافق|ماشي|حلو|زين|اوكي|اوك|بالتاكيد|طبعا|ياليت|يا ليت|ليش لا|شغل|شغله|حلل|خلنا نبدا|نبدا)(\s|$|[،,.!؟?])|(ابدا|ابدء|يلا نبدا|خلنا نبدا|شغله|شغل التحليل|حلل المنافسين)/;

export function isAffirmative(text: string): boolean {
  const t = plain(text);
  if (isDecline(t)) return false;
  // A starting "yes"/"طيب" counts only in a short answer: "طيب لو استهدفت المعلمين؟" is a new question, not a yes.
  const short = t.split(' ').length <= 5;
  const anywhere = /\b(go ahead|let'?s (do it|start|go|begin|get started)|start (it|the analysis)|run it|yes please)\b|(ابدا|ابدء|يلا نبدا|خلنا نبدا|شغله|شغل التحليل|حلل المنافسين)/;
  return anywhere.test(t) || (short && (YES_EN.test(t) || YES_AR.test(t)));
}
