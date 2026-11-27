// "How can I differ from X?": the answer is written by code from the saved analysis (tools/explain-difference.ts).
import { describe, expect, it } from 'vitest';
import { CHOOSE_SENTENCE, samenessSentence } from '../../src/mastra/tools/explain-difference';

describe('explain_difference', () => {
  it('says where the analysis found the competitor the same, in English and Arabic', () => {
    const all = { problem: { answer: 'same' }, customer: { answer: 'same' }, offering: { answer: 'same' } };
    expect(samenessSentence('Hungerstation', all, 'en')).toBe("Darb's analysis found Hungerstation the same as your idea in the problem, the customer, and the offering.");
    expect(samenessSentence('جاهز', all, 'ar')).toBe('وجد تحليل درب أن جاهز يطابق فكرتك في المشكلة والعميل والمنتج.');
  });

  it('names the parts that are only partly the same, and says so when none is', () => {
    const mixed = { problem: { answer: 'same' }, customer: { answer: 'same' }, offering: { answer: 'partly' } };
    expect(samenessSentence('Foodics', mixed, 'en')).toBe("Darb's analysis found Foodics the same as your idea in the problem and the customer, and partly the same in the offering.");
    expect(samenessSentence('X', { problem: { answer: 'unknown' } }, 'en')).toBe("Darb's analysis did not find X the same as your idea in any part.");
  });

  it('ends with the founder choosing the differentiator, never with Darb’s own ideas', () => {
    expect(CHOOSE_SENTENCE.en).toMatch(/yours to choose/);
    expect(CHOOSE_SENTENCE.ar).toMatch(/قرارك أنت/);
  });
});
