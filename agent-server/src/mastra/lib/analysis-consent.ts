// Analysis consent (persona enhancement, Hala, 18 Nov 2026): describing an idea never starts a competitor search
// on its own. Darb first understands the idea (a "check" run: Understand only, nothing searched or saved, no analysis
// used), restates it and offers the analysis. The search runs only with the founder's consent, decided here in code:
//
//   explicit request  the founder's latest message asks for the competitor analysis itself
//                     ("find my competitors", "حلل المنافسين لفكرتي")
//   answered offer    a check run found the idea ready, Darb's last message offered the analysis (a question about
//                     competitors or the analysis), and the founder answered it with a clear yes ("yes", "إيه، ابدأ").
//                     Any other answer ("Riyadh", a new detail) is not consent: Darb reads the idea again and asks again.
//   continuing        the founder already agreed, and is now answering the one clarification question of that run
//   retry             the founder already agreed, the run failed, and they ask again ("try again")
//
// A clear "no" / "not now" is never consent. Without consent, the delegation hook runs a check instead of the search
// (lib/competitor-delegation.ts), so a model mistake can never start a search. Whether a free-text answer is a "yes"
// is still read by the model, as for the what-if; code only rules out the clear declines below.
import type { IdeaProfile } from '../schemas/competitor';
import { contentWords } from './founder-text';

type Part = { type?: string; text?: string };
type MessageLike = { role: string; content: unknown };

const textOf = (m: MessageLike): string =>
  typeof m.content === 'string'
    ? m.content
    : Array.isArray(m.content)
      ? (m.content as Part[]).map((p) => (p.type === 'text' ? (p.text ?? '') : '')).join(' ')
      : '';

// Arabic letter forms unified and diacritics removed, so "حلّل" and "حلل" match the same pattern.
const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();

// Words about competitors. "analysis" alone is not enough: an idea can be "a data analysis platform".
const ABOUT_ANALYSIS_EN = /\b(competitors?|competition|rivals?)\b/;
const ABOUT_ANALYSIS_AR = /منافس/;

// Asking for it to be done: analyse, find, search, show, who are…, start.
const ASK_EN = /\b(analy[sz]e|analysis|find|search|look (up|for|into)|show|who are|who is|list|check|run|start|compare|explore|research|identify)\b/;
const ASK_AR = /(حلل|تحليل|ابحث|دور|اعرف|مين|من هم|من هو|ابدا|ابدء|اعرض|طلع|قارن|دراسه|ادرس|حدد|اكتشف|ابي اعرف|ابغي اعرف)/;

// A clear "no" or "not now". Checked first: a decline is never consent, whatever else the message says.
const DECLINE_EN = /^(no|nope|nah|not now|not yet|later|maybe later|no thanks|no thank you)\b|\b(not now|not yet|maybe later|don't (run|start|analy[sz]e)|do not (run|start|analy[sz]e))\b/;
const DECLINE_AR = /^(لا|لأ|لاء|لا شكرا|مو الحين|مو الان|ليس الان|بعدين|لاحقا|خلها بعدين|ما ابي|ما ابغي|ما ابغا)(\s|$|[،,.!؟?])|(مو الحين|مو الان|ليس الان|بعدين|لاحقا|ما ابي تحليل|لا تبدا|لا تحلل)/;

export function isDecline(text: string): boolean {
  const t = plain(text);
  return DECLINE_EN.test(t) || DECLINE_AR.test(t);
}

// The founder's message asks for the competitor analysis itself. Saying that a company is not a competitor
// ("I don't think this company is a competitor") is not a request.
export function isExplicitAnalysisRequest(text: string): boolean {
  const t = plain(text);
  if (isDecline(t)) return false;
  const en = ABOUT_ANALYSIS_EN.test(t) && ASK_EN.test(t);
  const ar = ABOUT_ANALYSIS_AR.test(t) && ASK_AR.test(t);
  return en || ar;
}

// A clear yes: a short agreement or "start / go ahead" (persona eval, 18 Nov 2026: "Riyadh" alone ran a search).
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

// Darb's last message before the founder's latest one offered the analysis: a question that mentions competitors or
// the analysis ("Would you like to start with a competitor analysis?" / "هل تحب نبدأ بتحليل المنافسين؟").
export function offeredAnalysis(messages: readonly MessageLike[] | undefined): boolean {
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
    const text = plain(textOf(list[i]));
    if (!text) continue;
    return /[?؟]/.test(text) && (ABOUT_ANALYSIS_EN.test(text) || /\banaly[sz]/.test(text) || ABOUT_ANALYSIS_AR.test(text) || /تحليل/.test(text));
  }
  return false;
}

export type Consent = 'explicit_request' | 'answered_offer' | 'continuing' | 'retry' | null;

export function consentFor(input: {
  latest: string;
  messages: readonly MessageLike[] | undefined;
  understood: boolean; // a check run found this assessment's idea ready
  agreedBefore: boolean; // the founder agreed, and the run is waiting on its one clarification question
  failedBefore?: boolean; // the founder agreed, and that run failed
}): Consent {
  if (isDecline(input.latest)) return null;
  if (isExplicitAnalysisRequest(input.latest)) return 'explicit_request';
  if (input.agreedBefore) return 'continuing';
  if (input.failedBefore) return 'retry';
  if (input.understood && offeredAnalysis(input.messages) && isAffirmative(input.latest)) return 'answered_offer';
  return null;
}

// ---------------------------------------------------------------------------
// What the server remembers between the founder's messages, by assessment_id. Kept in server memory like
// pendingQuestions: after a restart, Darb simply reads the idea again and offers the analysis again.
// ---------------------------------------------------------------------------

export type UnderstoodIdea = { ideaText: string; profile: IdeaProfile; embedding: number[] | null };

// The idea a check run found ready to search, with its profile (reused by the analysis the founder agrees to).
export const understoodIdeas = new Map<string, UnderstoodIdea>();

// Assessments whose founder agreed to the analysis and whose run is waiting on its one clarification question.
export const agreedAnalyses = new Set<string>();

// Assessments whose founder agreed to the analysis and whose run failed: asking again is still their consent.
export const failedAnalyses = new Set<string>();

// Same idea text, ignoring spacing and punctuation: then the check's profile can be used again.
export function sameIdeaText(a: string, b: string): boolean {
  return contentWords(a).join(' ') === contentWords(b).join(' ');
}
