// Tests for Darb's personality config (config/darb-persona.ts): it reaches the Conversational Agent, it holds no
// phrase Darb avoids, and Darb's own fixed texts follow it. How the replies actually sound is checked live
// (scripts/eval-persona.ts), not here.
import { describe, expect, it } from 'vitest';
import { AVOIDED_PHRASES, REFERENCE_CONVERSATIONS, personaInstructions } from '../../src/mastra/config/darb-persona';
import { cardsSentence, NOTE_TEXT } from '../../src/mastra/lib/competitor-notes';
import { CLARIFY_QUESTIONS } from '../../src/mastra/lib/understand';

// Short Arabic phrases ("وش", "إيش") are matched as whole words, so "ونشوف" is not a match.
function avoidedIn(text: string): string[] {
  const words = text.split(/[^؀-ۿ]+/);
  const ar = AVOIDED_PHRASES.ar.filter((p) => (p.includes(' ') ? text.includes(p) : words.includes(p)));
  const en = AVOIDED_PHRASES.en.filter((p) => text.toLowerCase().includes(p.toLowerCase()));
  return [...ar, ...en];
}
const emojis = (text: string) => (text.match(/\p{Extended_Pictographic}/gu) ?? []).length;

describe("Darb's personality", () => {
  it('has bilingual reference replies that use no avoided phrase and at most two emojis', () => {
    expect(REFERENCE_CONVERSATIONS.length).toBeGreaterThanOrEqual(12);
    for (const c of REFERENCE_CONVERSATIONS) {
      for (const turn of [c.ar, c.en]) {
        expect(avoidedIn(turn.darb), c.situation).toEqual([]);
        expect(emojis(turn.darb)).toBeLessThanOrEqual(2);
      }
      expect(c.ar.darb).toMatch(/[؀-ۿ]/);
      expect(c.en.darb).not.toMatch(/[؀-ۿ]/);
    }
  });

  it('drops the old "friend" and "match their dialect" instructions', () => {
    const text = personaInstructions();
    expect(text).not.toMatch(/like a friend|match their dialect/i);
    expect(text).toMatch(/Do not copy the founder's dialect/);
  });

  it("Darb's own fixed texts (the questions and the cards sentence) follow the style", () => {
    const texts = [...Object.values(CLARIFY_QUESTIONS).flatMap((q) => [q.ar, q.en]), ...[1, 2, 3].flatMap((n) => [cardsSentence(n, 'ar'), cardsSentence(n, 'en')])];
    for (const t of texts) {
      expect(avoidedIn(t), t).toEqual([]);
      expect(emojis(t)).toBeLessThanOrEqual(2);
    }
  });

  it('never adds an emoji to a protected note sentence', () => {
    for (const note of Object.values(NOTE_TEXT)) expect(emojis(note.ar) + emojis(note.en)).toBe(0);
  });
});
