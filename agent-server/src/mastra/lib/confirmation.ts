// The confirmation rule, enforced in code: an analysis may only run after the agent restated the idea in an
// earlier message and the founder answered it. Found by the live test: told everything in one message, the
// agent ran the analysis straight away, although its instructions say to confirm first.
type Part = { type?: string; text?: string };
type Message = { role?: string; content?: { parts?: Part[] } | string };
type ContextLike = { agent?: { getMessages?: () => readonly Message[] } };

const textOf = (m: Message): string =>
  typeof m.content === 'string' ? m.content : (m.content?.parts ?? []).filter((p) => p.type === 'text').map((p) => p.text ?? '').join(' ');

// The agent's last message with text before the founder's latest message, or null.
// null also when there is no conversation to read (a tool run by hand, or a test): then the rule does not apply.
function messageBeforeLatestReply(context: unknown): { text: string } | 'no_conversation' | null {
  const messages = (context as ContextLike)?.agent?.getMessages?.();
  if (!messages) return 'no_conversation';
  let latestUser = -1;
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') { latestUser = i; break; }
  for (let i = latestUser - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant' && textOf(messages[i]).trim()) return { text: textOf(messages[i]) };
  }
  return null;
}

// For an analysis: the agent's previous message restated the idea, including the sub-sector code, and the founder replied.
export function analysisWasConfirmed(context: unknown, subSector: string): boolean {
  const before = messageBeforeLatestReply(context);
  if (before === 'no_conversation') return true;
  return !!before && new RegExp(`(^|\\D)${subSector}(\\D|$)`).test(before.text);
}

// For a what-if: the agent's previous message asked the founder to confirm (a question, or "please confirm"),
// and the founder replied.
export function whatIfWasConfirmed(context: unknown): boolean {
  const before = messageBeforeLatestReply(context);
  if (before === 'no_conversation') return true;
  return !!before && /[?؟]|confirm|أكّد|أكد|تأكيد|تأكد|صحيح/i.test(before.text);
}
