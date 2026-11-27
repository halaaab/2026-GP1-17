// Tests for the checks done in code around the supervisor: the founder's language, stated facts only,
// the reply guard and the run log. No model, database or network is used.
import { describe, expect, it } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import { contentWords, detectLanguage, isStated, keepStatedFacts } from '../../src/mastra/lib/founder-text';
import { REPLY_RULES_KEY, replyGuard, replyProblems, type ReplyRules } from '../../src/mastra/lib/reply-guard';
import { NOTE_TEXT } from '../../src/mastra/lib/competitor-notes';
import { RunLog } from '../../src/mastra/schemas/competitor';
import { ARABIC_STYLE, ENGLISH_STYLE, REFERENCE_CONVERSATIONS, personaInstructions } from '../../src/mastra/config/darb-persona';

const EN = NOTE_TEXT.capability_pending.en;
const AR = NOTE_TEXT.capability_pending.ar;

describe('detectLanguage', () => {
  it('tells Arabic from English, and gives null without letters', () => {
    expect(detectLanguage('فكرتي تطبيق للمطاعم')).toBe('ar');
    expect(detectLanguage('An app for restaurants')).toBe('en');
    expect(detectLanguage('تطبيق مثل Talabat للصيدليات')).toBe('ar');
    expect(detectLanguage('123 !!')).toBeNull();
  });
});

describe('stated facts', () => {
  const founder = 'I want to build healthy lunch boxes for offices in Dammam, delivered every day.';

  it('normalizes words: case, Arabic letter forms, the article "ال"', () => {
    expect(contentWords('The RESTAURANTS')).toEqual(['restaurants']);
    expect(contentWords('المطاعم الصغيرة')).toEqual(['مطاعم', 'صغيره']);
  });

  it('keeps a fact said in other words, and drops a guess', () => {
    expect(isStated('offices in Dammam', founder)).toBe(true);
    expect(isStated('healthy lunch boxes delivered daily', founder)).toBe(true);
    expect(isStated('Busy office workers need healthy meal options', founder)).toBe(false);
  });

  it('returns only the stated facts and the names of the dropped ones', () => {
    const facts = { customer: 'offices in Dammam', problem: 'Busy office workers need healthy meal options' };
    expect(keepStatedFacts(facts, founder)).toEqual({ kept: { customer: 'offices in Dammam' }, dropped: ['problem'] });
    expect(keepStatedFacts({ problem: 'Workers skip meals' }, founder)).toEqual({ kept: undefined, dropped: ['problem'] });
    expect(keepStatedFacts(undefined, founder)).toEqual({ kept: undefined, dropped: [] });
  });

  it('works in Arabic', () => {
    expect(isStated('المطاعم في الرياض', 'فكرتي تطبيق يساعد المطاعم في الرياض تطلب خضار طازجة')).toBe(true);
  });
});

describe('replyProblems', () => {
  const english = { sentences: [EN], language: 'en' as const };
  const arabic = { sentences: [AR], language: 'ar' as const };

  it('accepts the exact note, alone or after a short line in the same language', () => {
    expect(replyProblems(EN, english)).toEqual([]);
    expect(replyProblems(`Thanks for sharing your idea.\n\n${EN}`, english)).toEqual([]);
    expect(replyProblems(`شكرًا على مشاركة فكرتك.\n${AR}`, arabic)).toEqual([]);
  });

  it('asks for the exact sentence when it is reworded', () => {
    const reworded = 'لم نجد منافسين لأن البحث عن المنافسين في درب ما زال قيد التطوير.';
    expect(replyProblems(reworded, arabic)[0]).toContain(AR);
  });

  it('asks for the founder’s language when the rest of the reply is in another one', () => {
    const wrong = `لقد قمت بتحليل فكرتك.\n${EN}`;
    expect(replyProblems(wrong, english)).toEqual(["The whole reply must be in English, the founder's language."]);
  });

  it('refuses a reply that shows the working memory', () => {
    const leak = `# Founder's idea (their own words)\n- Stated problem: x\n${EN}`;
    expect(replyProblems(leak, english)).toContain('The reply must not show the working memory.');
    expect(replyProblems(`- **Stated problem**: x\n${EN}`, english)).toContain('The reply must not show the working memory.');
  });
});

describe('the reply guard processor', () => {
  const user = (text: string) => ({ id: 'u1', role: 'user', createdAt: new Date(), content: { format: 2, parts: [{ type: 'text', text }] } });
  const assistant = (text: string) => ({ id: 'm1', role: 'assistant', createdAt: new Date(), content: { format: 2, parts: [{ type: 'text', text }] } });
  const delta = (text: string) => ({ type: 'text-delta', runId: 'r', from: 'AGENT', payload: { id: 't', text } });

  function start(founderSays: string) {
    const requestContext = new RequestContext();
    const out = replyGuard.processInput({ messages: [user(founderSays)], systemMessages: [], requestContext } as never);
    return { requestContext, out, rules: requestContext.get(REPLY_RULES_KEY) as ReplyRules };
  }

  it('starts every founder message with empty rules and adds the founder’s language to the instructions', () => {
    const { out, rules } = start('فكرتي تطبيق للمطاعم');
    expect(rules).toEqual({ sentences: [], language: null, codeWritesReply: false, founderLanguage: 'ar' });
    expect(JSON.stringify(out)).toContain('Write your whole reply in Arabic');
  });

  // Live test, given both languages, the model copied the Arabic reference reply to an English founder
  // ("I don't have an idea yet", Arabic 3 times in 8). The style guide now reaches the model in the founder's language only.
  function instructionsSent(founderSays: string) {
    const instructions = `${personaInstructions()}\n\nOperational rules…`;
    const out = replyGuard.processInput({
      messages: [user(founderSays)],
      systemMessages: [{ role: 'system', content: instructions }],
      requestContext: new RequestContext(),
    } as never) as { systemMessages: { content: string }[] };
    return out.systemMessages[0].content;
  }
  const noIdea = REFERENCE_CONVERSATIONS.find((c) => c.situation === 'A founder without an idea yet')!;

  it('gives an English founder the style guide and reference replies in English only', () => {
    const sent = instructionsSent("I'd love to start a business, but I don't have an idea yet.");
    expect(sent).toContain(ENGLISH_STYLE);
    expect(sent).not.toContain(ARABIC_STYLE);
    expect(sent).toContain(noIdea.en.darb);
    expect(sent).not.toContain(noIdea.ar.darb);
    expect(sent).toContain('Operational rules…'); // the rest of the instructions is kept
  });

  it('gives an Arabic founder the style guide and reference replies in Arabic only', () => {
    const sent = instructionsSent('ودي أبدأ مشروع بس ما عندي فكرة');
    expect(sent).toContain(ARABIC_STYLE);
    expect(sent).not.toContain(ENGLISH_STYLE);
    expect(sent).toContain(noIdea.ar.darb);
    expect(sent).not.toContain(noIdea.en.darb);
  });

  it('keeps both languages when the founder’s language is not clear yet', () => {
    const out = replyGuard.processInput({ messages: [user('👋')], systemMessages: [{ role: 'system', content: personaInstructions() }], requestContext: new RequestContext() } as never);
    expect(JSON.stringify(out)).not.toContain('Write your whole reply in');
  });

  it('lets the model’s reply stream unchanged when code does not write the reply', async () => {
    const { requestContext } = start('Hello');
    const state = {};
    expect(await replyGuard.processOutputStream({ part: delta('Hi there'), state, requestContext } as never)).toEqual(delta('Hi there'));
  });

  it('streams exactly the note sentences, and drops the model’s own words, when code writes the reply', async () => {
    const { requestContext, rules } = start('An app for restaurants');
    Object.assign(rules, { sentences: [EN], language: 'en', codeWritesReply: true });
    // Each step of a reply gets a fresh processor state; the note must still appear only once.
    const first = await replyGuard.processOutputStream({ part: delta('لقد قمت'), state: {}, requestContext } as never);
    const second = await replyGuard.processOutputStream({ part: delta(' بتحليل فكرتك'), state: {}, requestContext } as never);
    const nextStep = await replyGuard.processOutputStream({ part: delta('More words'), state: {}, requestContext } as never);
    const end = { type: 'text-end', runId: 'r', from: 'AGENT', payload: { id: 't' } };
    expect((first as { payload: { text: string } }).payload.text).toBe(EN);
    expect(second).toBeNull();
    expect(nextStep).toBeNull();
    expect(await replyGuard.processOutputStream({ part: end, state: {}, requestContext } as never)).toEqual(end);
  });

  it('saves the same text the founder saw', () => {
    const { requestContext, rules } = start('فكرة');
    Object.assign(rules, { sentences: [AR], language: 'ar', codeWritesReply: true });
    const [saved] = replyGuard.processOutputResult({ messages: [assistant('رد آخر')], requestContext } as never) as ReturnType<typeof assistant>[];
    expect(saved.content.parts).toEqual([{ type: 'text', text: AR }]);
  });
});

describe('RunLog', () => {
  const log = {
    event: 'competitor_run',
    trace_id: null,
    assessment_id: '11111111-1111-4111-8111-111111111111',
    idea_id: '22222222-2222-4222-8222-222222222222',
    mode: 'new',
    language: 'en',
    started_at: '2026-11-10T09:00:00.000Z',
    duration_ms: 40,
    status: 'complete',
    result_valid: true,
    competitors_shown: 0,
    iss: null,
    notes: ['capability_pending'],
    dropped_known_facts: ['problem'],
    tavily_calls: 0,
    judge_calls: 0,
    steps: [{ capability: 'guardrails', outcome: 'ok', duration_ms: 3 }],
  };

  it('accepts a run log and refuses founder text or unknown values', () => {
    expect(RunLog.safeParse(log).success).toBe(true);
    expect(RunLog.safeParse({ ...log, idea_text: 'my secret idea' }).success).toBe(false);
    expect(RunLog.safeParse({ ...log, steps: [{ capability: 'search', outcome: 'ok', duration_ms: 1 }] }).success).toBe(false);
    expect(RunLog.safeParse({ ...log, tavily_calls: 16 }).success).toBe(false);
  });
});

describe('reply guard: private notes never reach the founder', () => {
  async function streamed(parts: { type: string; payload: Record<string, unknown> }[]) {
    const requestContext = new RequestContext();
    const rules: ReplyRules = { sentences: [], language: 'en', codeWritesReply: false };
    requestContext.set(REPLY_RULES_KEY, rules);
    let shown = '';
    for (const part of parts) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const out = (await replyGuard.processOutputStream!({ part, requestContext } as any)) as { type: string; payload: { text?: string } } | null;
      if (out?.type === 'text-delta') shown += out.payload.text ?? '';
    }
    return { shown, rules };
  }
  const text = (t: string) => ({ type: 'text-delta', payload: { text: t } });

  it('cuts the reply where the working memory starts', async () => {
    const { shown } = await streamed([text('Would you like to start?\n\n'), text("Here’s what I have stored about your idea:\n# Founder's idea"), text('\n- Idea: x')]);
    expect(shown.trim()).toBe('Would you like to start?');
  });

  it('drops text written after saving the working memory, once the reply was sent', async () => {
    const { shown, rules } = await streamed([
      text('الله يعافيك! 🤍'),
      { type: 'tool-call', payload: { toolName: 'updateWorkingMemory' } },
      text('سأقوم بتحديث المعلومات في ذاكرتي.'),
    ]);
    expect(shown).toBe('الله يعافيك! 🤍');
    expect(rules.closed).toBe(true);
  });

  it('lets a normal reply through untouched, and saving memory before replying is fine', async () => {
    const { shown } = await streamed([{ type: 'tool-call', payload: { toolName: 'updateWorkingMemory' } }, text('Hello, and '), text('welcome to Darb! 👋')]);
    expect(shown).toBe('Hello, and welcome to Darb! 👋');
  });
});
