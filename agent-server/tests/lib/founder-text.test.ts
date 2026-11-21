// Tests for the founder's short answers (a clear "no", a clear yes to Darb's what-if question) and the conversation
// language (lib/founder-text.ts).
import { describe, expect, it } from 'vitest';
import { clearLanguage, conversationLanguage, isAffirmative, isDecline } from '../../src/mastra/lib/founder-text';

describe('declines', () => {
  it.each(['No', 'no thanks', 'Not now', 'maybe later', 'لا', 'لا شكرًا', 'مو الحين', 'بعدين', 'لاحقًا'])('"%s" is a decline', (t) =>
    expect(isDecline(t)).toBe(true),
  );
  it.each(['Yes', 'إيه، ابدأ', 'ok go ahead', 'Now please', 'لابتوب للطلاب', 'Nobody does this well'])('"%s" is not', (t) => expect(isDecline(t)).toBe(false));
});

describe('a clear yes to Darb’s what-if question', () => {
  it.each(['إيه، ابدأ', 'ايه', 'نعم', 'أكيد', 'يلا', 'تمام، شغّله', 'Yes', "Yes, let's get started.", 'Sure', 'go ahead'])('"%s" is a yes', (t) =>
    expect(isAffirmative(t)).toBe(true),
  );
  it.each(['Riyadh', 'جدة', 'للشركات الكبيرة', 'How much does it cost?', 'لا، مو الحين'])('"%s" is not', (t) => expect(isAffirmative(t)).toBe(false));

  it('needs a short answer for a starting yes: a long message that starts with "ok" is a new question', () => {
    expect(isAffirmative('طيب')).toBe(true);
    expect(isAffirmative('طيب لو استهدفت المعلمين بدال الطلاب في جدة؟')).toBe(false);
    expect(isAffirmative('ok but what about targeting large enterprises in Jeddah instead?')).toBe(false);
    expect(isAffirmative('Sounds good, go ahead and run it now please')).toBe(true);
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
