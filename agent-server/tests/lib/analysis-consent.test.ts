// Tests for the analysis consent rules (lib/analysis-consent.ts) and the conversation language (lib/founder-text.ts).
import { describe, expect, it } from 'vitest';
import { consentFor, isDecline, isExplicitAnalysisRequest, offeredAnalysis, sameIdeaText } from '../../src/mastra/lib/analysis-consent';
import { clearLanguage, conversationLanguage } from '../../src/mastra/lib/founder-text';

describe('explicit requests for a competitor analysis', () => {
  it.each([
    'Find my competitors',
    'Can you analyse the competition for my idea?',
    'Who are my competitors?',
    'حلل المنافسين لفكرتي',
    'مين المنافسين لفكرتي؟',
    'ابي اعرف منافسيني',
  ])('counts "%s"', (text) => expect(isExplicitAnalysisRequest(text)).toBe(true));

  it.each([
    'A data analysis platform for restaurants in Riyadh', // "analysis" in the idea itself
    "I don't think this company is actually a competitor", // disagreement, not a request
    'ما أشوف إن هذي الشركة تعتبر منافس لي',
    'منصة تحليل بيانات للمطاعم',
    'No, do not analyse competitors yet',
    'Yes',
  ])('does not count "%s"', (text) => expect(isExplicitAnalysisRequest(text)).toBe(false));
});

describe('declines', () => {
  it.each(['No', 'no thanks', 'Not now', 'maybe later', 'لا', 'لا شكرًا', 'مو الحين', 'بعدين', 'لاحقًا'])('"%s" is a decline', (t) =>
    expect(isDecline(t)).toBe(true),
  );
  it.each(['Yes', 'إيه، ابدأ', 'ok go ahead', 'Now please', 'لابتوب للطلاب', 'Nobody does this well'])('"%s" is not', (t) => expect(isDecline(t)).toBe(false));
});

describe('the offer', () => {
  const thread = (darb: string) => [
    { role: 'user', content: 'idea' },
    { role: 'assistant', content: darb },
    { role: 'user', content: 'yes' },
  ];
  it('is a question from Darb about the competitor analysis', () => {
    expect(offeredAnalysis(thread('Would you like to start with a competitor analysis?'))).toBe(true);
    expect(offeredAnalysis(thread('هل تحب نبدأ بتحليل المنافسين؟'))).toBe(true);
    expect(offeredAnalysis(thread('I can help you explore competitors.'))).toBe(false); // no question
    expect(offeredAnalysis(thread('Is there another aspect you would like to explore?'))).toBe(false);
  });

  it('gives consent only with a ready idea, an offer and no decline', () => {
    const offered = thread('Would you like to start with a competitor analysis?');
    expect(consentFor({ latest: 'yes', messages: offered, understood: true, agreedBefore: false })).toBe('answered_offer');
    expect(consentFor({ latest: 'yes', messages: offered, understood: false, agreedBefore: false })).toBeNull();
    expect(consentFor({ latest: 'not now', messages: offered, understood: true, agreedBefore: false })).toBeNull();
    expect(consentFor({ latest: 'a healthy lunch box', messages: offered, understood: false, agreedBefore: true })).toBe('continuing');
  });

  it('matches the same idea text regardless of spacing and punctuation', () => {
    expect(sameIdeaText('An app, for restaurants!', 'an app for  restaurants')).toBe(true);
    expect(sameIdeaText('An app for restaurants', 'An app for large enterprises')).toBe(false);
  });
});

describe('the conversation language', () => {
  it('a short reply, a city or a company name keeps the language', () => {
    expect(conversationLanguage(['أبي أسوي منصة للمطاعم في الرياض', 'Jeddah'])).toBe('ar');
    expect(conversationLanguage(['I want to build a platform for restaurants', 'جدة'])).toBe('en');
    expect(conversationLanguage(['أبي أسوي منصة للمطاعم', 'STC'])).toBe('ar');
    expect(conversationLanguage(['I want to build a platform for restaurants', 'نعم'])).toBe('en');
  });

  it('Arabic with English technical terms stays Arabic', () => {
    expect(clearLanguage('أبي أسوي SaaS للـ POS في المطاعم')).toBe('ar');
  });

  it('a clear message in the other language switches it', () => {
    expect(conversationLanguage(['I want a coffee delivery app for offices', 'طيب وش أقوى منافس؟'])).toBe('ar');
    expect(conversationLanguage(['أبي تطبيق قهوة للمكاتب', 'Can we continue in English please?'])).toBe('en');
  });

  it('falls back to the latest message’s letters when nothing is clear', () => {
    expect(conversationLanguage(['Hi'])).toBe('en');
    expect(conversationLanguage(['هلا'])).toBe('ar');
  });
});

describe('retrying a failed analysis', () => {
  it('counts "try again" as consent after an agreed run failed, but never a decline', () => {
    expect(consentFor({ latest: 'Try again please', messages: [], understood: false, agreedBefore: false, failedBefore: true })).toBe('retry');
    expect(consentFor({ latest: 'no', messages: [], understood: false, agreedBefore: false, failedBefore: true })).toBeNull();
    expect(consentFor({ latest: 'Try again please', messages: [], understood: false, agreedBefore: false })).toBeNull();
  });
});

describe('answering the offer needs a clear yes', () => {
  const offered = [
    { role: 'user', content: 'idea' },
    { role: 'assistant', content: 'هل تحب نبدأ بتحليل المنافسين؟' },
    { role: 'user', content: 'x' },
  ];
  it.each(['إيه، ابدأ', 'ايه', 'نعم', 'أكيد', 'يلا', 'تمام، شغّله', 'Yes', "Yes, let's get started.", 'Sure', 'go ahead'])('"%s" is consent', (latest) =>
    expect(consentFor({ latest, messages: offered, understood: true, agreedBefore: false })).toBe('answered_offer'),
  );
  it.each(['Riyadh', 'جدة', 'للشركات الكبيرة', 'How much does it cost?', 'لا، مو الحين'])('"%s" is not', (latest) =>
    expect(consentFor({ latest, messages: offered, understood: true, agreedBefore: false })).toBeNull(),
  );
});

describe('a long message that starts with "ok" is not a yes', () => {
  it('needs a short answer for a starting yes', async () => {
    const { isAffirmative } = await import('../../src/mastra/lib/analysis-consent');
    expect(isAffirmative('طيب')).toBe(true);
    expect(isAffirmative('طيب لو استهدفت المعلمين بدال الطلاب في جدة؟')).toBe(false);
    expect(isAffirmative('ok but what about targeting large enterprises in Jeddah instead?')).toBe(false);
    expect(isAffirmative('Sounds good, go ahead and run it now please')).toBe(true);
  });
});
