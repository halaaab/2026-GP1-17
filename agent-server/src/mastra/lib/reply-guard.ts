// Output check on the Conversational Agent's replies (a Mastra processor, input and output).
// The founder must see every note sentence word for word, in their own language, and never the agent's
// private working memory (design §11: the supervisor never changes facts).
//
// How it works:
//   1. When a founder message arrives, an empty "reply rules" box is put in the request context, and the
//      founder's language (decided in code from their message) is added to the agent's instructions.
//   2. When a delegation finishes, lib/competitor-delegation.ts fills the box: the note sentences, the language,
//      and whether code writes the reply itself.
//   3. Code writes the reply itself when the analysis has no competitors to show (and asks no question): the founder
//      then sees exactly the note sentences (design §10, "nothing found"). The first streamed piece of the model's
//      text is replaced by them and the rest of its text is dropped, so a wrong reply never reaches the website.
//
// Why not ask the model to rewrite? In @mastra/core 1.80 a rejected reply has already streamed to the founder
// by the time a rewrite is asked for (checked on 10 Nov 2026), so only changing the stream itself is reliable.
import type { MastraDBMessage } from '@mastra/core/memory';
import type { Processor } from '@mastra/core/processors';
import type { Language } from '../schemas/competitor';
import { detectLanguage } from './founder-text';

export const REPLY_RULES_KEY = 'darbReplyRules';

// noteSent is kept here, not in the processor's state, because a reply can stream in several parts (steps).
export type ReplyRules = { sentences: string[]; language: Language | null; codeWritesReply: boolean; noteSent?: boolean };
export const emptyReplyRules = (): ReplyRules => ({ sentences: [], language: null, codeWritesReply: false });

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

// Headings and labels from the working memory template: they must never reach the founder.
const MEMORY_LEAK = /Founder's idea \(their own words\)|#\s*Competitor analysis|Stated\W{0,3}(problem|customer|offering|market)|Last status|working memory/i;

// What is wrong with a reply. Empty when the reply is fine. Used by the live test, and later by Member 2's checks.
export function replyProblems(text: string, rules: Pick<ReplyRules, 'sentences' | 'language'>): string[] {
  const problems: string[] = [];
  const reply = squash(text);
  for (const sentence of rules.sentences) {
    if (!reply.includes(squash(sentence))) problems.push(`The reply must contain this sentence, copied exactly: "${sentence}"`);
  }
  let rest = reply;
  for (const sentence of rules.sentences) rest = rest.split(squash(sentence)).join(' ');
  const restLanguage = detectLanguage(rest);
  if (rules.language && restLanguage && restLanguage !== rules.language) {
    problems.push(`The whole reply must be in ${rules.language === 'ar' ? 'Arabic' : 'English'}, the founder's language.`);
  }
  if (MEMORY_LEAK.test(reply)) problems.push('The reply must not show the working memory.');
  return problems;
}

// The text of the last assistant message replaced (so the saved copy matches what the founder saw).
function withReplyText(messages: MastraDBMessage[], text: string): MastraDBMessage[] {
  const last = [...messages].reverse().find((m) => m.role === 'assistant');
  if (!last) return messages;
  const parts = (last.content.parts ?? []).filter((p) => p.type !== 'text');
  const fixed = { ...last, content: { ...last.content, parts: [...parts, { type: 'text' as const, text }], content: text } };
  return messages.map((m) => (m === last ? fixed : m));
}

const rulesOf = (requestContext: { get: (key: string) => unknown } | undefined) =>
  requestContext?.get(REPLY_RULES_KEY) as ReplyRules | undefined;

export const replyGuard = {
  id: 'darb-reply-guard',

  // 1. A fresh, empty box for every founder message, and the founder's language for the agent's instructions.
  processInput({ messages, systemMessages, requestContext }) {
    requestContext?.set(REPLY_RULES_KEY, emptyReplyRules());
    const latest = [...messages].reverse().find((m) => m.role === 'user');
    const said = (latest?.content.parts ?? []).map((p) => (p.type === 'text' ? p.text : '')).join(' ');
    const language = detectLanguage(said);
    if (!language) return messages;
    const name = language === 'ar' ? 'Arabic' : 'English';
    return {
      messages,
      systemMessages: [...systemMessages, { role: 'system' as const, content: `The founder's latest message is in ${name}. Write your whole reply in ${name}.` }],
    };
  },

  // 3. While the reply streams: when code writes the reply, the founder gets exactly the note sentences.
  async processOutputStream({ part, requestContext }) {
    const rules = rulesOf(requestContext);
    if (!rules?.codeWritesReply || part.type !== 'text-delta') return part;
    if (rules.noteSent) return null; // the model's own words are dropped, in every part of the reply
    rules.noteSent = true;
    return { ...part, payload: { ...part.payload, text: rules.sentences.join('\n') } };
  },

  // The saved copy of the reply (memory and chat history) matches what the founder saw.
  processOutputResult({ messages, requestContext }) {
    const rules = rulesOf(requestContext);
    return rules?.codeWritesReply ? withReplyText(messages, rules.sentences.join('\n')) : messages;
  },
} satisfies Processor;
