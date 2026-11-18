// A greeting that opens a conversation is answered at once, in code (Hala, 18 Nov 2026: "hi" took 20 to 30 seconds).
// The whole Conversational Agent run (its memory in the database, the model, then saving) took about 5 seconds
// before the first word and about 11 seconds in all on a laptop, for a sentence that is always the same kind of welcome.
// Only a message that is nothing but a greeting, and only the first message of a conversation, is answered here;
// everything else, and any greeting later in a conversation, goes to the agent as before.
// The wording follows Darb's personality: formal, warm, very polite, with one emoji.

const ARABIC = /[؀-ۿ]/;

// Greetings, written the ways founders type them (with or without hamza, tashkeel or a long vowel).
const SALAM = /^(ال)?سلام( عليكم)?( ورحمة الله( وبركاته)?)?$/;
const ARABIC_GREETINGS = /^(مرحبا|مرحبًا|مرحباً|مراحب|اهلا|أهلا|اهلاً|أهلاً|أهلًا|اهلين|أهلين|هلا|هلا والله|هلا وغلا|يا هلا|هاي|هلو|صباح الخير|مساء الخير|صباح النور|مساء النور)$/;
const ENGLISH_GREETINGS = /^(hi|hii+|hello|hey|hey there|hi there|hello there|good (morning|afternoon|evening)|salam|salaam|assalamu alaikum|as-salamu alaykum|marhaba|yo)$/;

// The message without punctuation, emojis, extra spaces, tashkeel or a name after it ("hi Darb", "مرحبا درب").
function plain(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '') // tashkeel and tatweel
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ') // punctuation and emojis
    .replace(/\s+(يا\s+)?(درب|darb)$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type Greeting = { kind: 'salam' | 'greeting'; language: 'ar' | 'en' };

// The greeting in this message, or null when the message says anything more than a greeting.
export function greetingIn(text: string): Greeting | null {
  const words = plain(text);
  if (!words || words.length > 40) return null;
  const language = ARABIC.test(words) ? 'ar' : 'en';
  if (SALAM.test(words)) return { kind: 'salam', language };
  if (ARABIC_GREETINGS.test(words) || ENGLISH_GREETINGS.test(words)) {
    const salam = /salam|salaam|alaikum|alaykum/.test(words);
    return { kind: salam ? 'salam' : 'greeting', language };
  }
  return null;
}

const WELCOME = {
  ar: 'يسعدني مساعدتك في تقييم فكرة مشروعك ✨ تفضّل بمشاركتها معي: ما الفكرة، وما المشكلة التي تحلّها؟',
  en: "I'd be glad to help you evaluate your startup idea ✨ Could you share it with me: what is the idea, and what problem does it solve?",
} as const;

export function greetingReply(greeting: Greeting): string {
  if (greeting.language === 'ar') {
    const hello = greeting.kind === 'salam' ? 'وعليكم السلام ورحمة الله وبركاته 👋' : 'أهلاً وسهلاً بك 👋';
    return `${hello} ${WELCOME.ar}`;
  }
  const hello = greeting.kind === 'salam' ? 'Wa alaikum assalam, and welcome! 👋' : 'Welcome! 👋';
  return `${hello} ${WELCOME.en}`;
}
