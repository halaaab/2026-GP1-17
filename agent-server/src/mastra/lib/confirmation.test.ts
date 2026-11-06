// Tests for the confirmation rule.
import { describe, expect, it } from 'vitest';
import { analysisWasConfirmed, whatIfWasConfirmed } from './confirmation';

const msg = (role: string, text: string) => ({ role, content: { parts: [{ type: 'text', text }] } });
const toolOnly = { role: 'assistant', content: { parts: [{ type: 'tool-invocation' }] } };
const chat = (...messages: unknown[]) => ({ agent: { getMessages: () => messages } });

describe('confirmation before an analysis', () => {
  it('refuses when everything was given in one message and nothing was restated', () => {
    expect(analysisWasConfirmed(chat(msg('user', 'BNPL app, sector K, sub-sector 64, Riyadh.'), toolOnly), '64')).toBe(false);
  });

  it('allows it after the agent restated the idea and the founder replied', () => {
    const c = chat(
      msg('user', 'BNPL app, sector K, sub-sector 64, Riyadh.'),
      msg('assistant', 'To confirm: sector K, sub-sector 64 (Financial service activities), region Riyadh. Is that right?'),
      msg('user', 'yes'),
      toolOnly,
    );
    expect(analysisWasConfirmed(c, '64')).toBe(true);
  });

  it('refuses when the restated summary had a different sub-sector', () => {
    const c = chat(msg('assistant', 'To confirm: sub-sector 66, Riyadh?'), msg('user', 'yes'));
    expect(analysisWasConfirmed(c, '64')).toBe(false);
    expect(analysisWasConfirmed(chat(msg('assistant', 'We have 640 users?'), msg('user', 'yes')), '64')).toBe(false); // 64 inside 640 does not count
  });

  it('does not apply without a conversation (a tool run by hand)', () => {
    expect(analysisWasConfirmed({}, '64')).toBe(true);
  });
});

describe('confirmation before a what-if', () => {
  it('needs a question from the agent, then the founder’s reply', () => {
    expect(whatIfWasConfirmed(chat(msg('user', 'what if university tuition?'), toolOnly))).toBe(false);
    expect(whatIfWasConfirmed(chat(msg('assistant', 'Shall I run it for university tuition instead?'), msg('user', 'yes')))).toBe(true);
    expect(whatIfWasConfirmed(chat(msg('assistant', 'هل تريد أن أجرّب الجامعات بدل المدارس؟'), msg('user', 'نعم')))).toBe(true);
    expect(whatIfWasConfirmed(chat(msg('assistant', 'University tuition instead. Please confirm if this is correct.'), msg('user', 'yes')))).toBe(true);
    expect(whatIfWasConfirmed(chat(msg('assistant', 'Here are your results.'), msg('user', 'what if Jeddah?')))).toBe(false);
  });
});
