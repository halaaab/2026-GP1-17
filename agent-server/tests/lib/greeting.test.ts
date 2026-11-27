// Tests for the instant welcome: only a message that is nothing but a greeting is answered from code.
import { describe, expect, it } from 'vitest';
import { greetingIn, greetingReply } from '../../src/mastra/lib/greeting';

describe('greetingIn', () => {
  it('finds greetings written the ways founders type them', () => {
    for (const text of ['hi', 'Hi!', 'hello Darb', 'Good morning 👋', 'مرحبا', 'مرحباً درب', 'أهلاً', 'هلا والله', 'صباح الخير']) {
      expect(greetingIn(text), text).toMatchObject({ kind: 'greeting' });
    }
    expect(greetingIn('السلام عليكم')).toEqual({ kind: 'salam', language: 'ar' });
    expect(greetingIn('السلام عليكم ورحمة الله وبركاته')).toEqual({ kind: 'salam', language: 'ar' });
    expect(greetingIn('salam')).toEqual({ kind: 'salam', language: 'en' });
  });

  it('leaves every message that says more than a greeting to the agent', () => {
    for (const text of ['hi, I want to open a coffee shop in Riyadh', 'مرحبا عندي فكرة تطبيق توصيل', 'what is the weather', 'hello?? why is it slow', 'هلا كيف أبدأ مشروع']) {
      expect(greetingIn(text), text).toBeNull();
    }
  });
});

describe('greetingReply', () => {
  it('answers in the founder’s language, politely, and returns the salam', () => {
    expect(greetingReply({ kind: 'salam', language: 'ar' })).toMatch(/^وعليكم السلام ورحمة الله وبركاته 👋 يسعدني مساعدتك/);
    expect(greetingReply({ kind: 'greeting', language: 'ar' })).toMatch(/^أهلاً وسهلاً بك 👋/);
    expect(greetingReply({ kind: 'greeting', language: 'en' })).toMatch(/^Welcome! 👋 I'd be glad to help/);
    expect(greetingReply({ kind: 'greeting', language: 'ar' })).not.toMatch(/احك|قل لي/);
  });
});
