// "How can I differ from X?": the facts and the shape of the answer come from code (tools/explain-difference.ts).
import { describe, expect, it } from 'vitest';
import { ANSWER_LABELS, answerShape } from '../../src/mastra/tools/explain-difference';

describe('explain_difference', () => {
  it('asks for four lines with the labels the chat page shows with icons, in the founder’s language', () => {
    const en = answerShape('Hungerstation', 'en');
    expect(en).toContain(`**${ANSWER_LABELS.en.standOut}**`);
    expect(en).toContain(`**${ANSWER_LABELS.en.nextStep}**`);
    expect(en).toContain('in English');
    expect(answerShape('جاهز', 'ar')).toContain(`**${ANSWER_LABELS.ar.standOut}**`);
  });

  it('says plainly that no difference was found, instead of guessing one', () => {
    expect(answerShape('Foodics', 'en', false)).toMatch(/found no clear difference yet.*Do not suggest what the difference could be/s);
    expect(answerShape('Foodics', 'en', true)).not.toMatch(/no clear difference/);
  });

  it('never lets the model add ideas of its own', () => {
    expect(answerShape('Foodics', 'en')).toMatch(/Use only these facts\. Never add features, prices, partnerships, examples or any idea of your own/);
  });
});
