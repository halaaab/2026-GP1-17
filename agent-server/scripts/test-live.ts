// Live end-to-end test: a real chat with the real agents, OpenAI and Supabase.
// Run with: npm run test:live -- <username of a test founder>
// It creates a test idea, describes it in English, in Arabic, and once more streamed like the website, prints PASS or FAIL for each check,
// then deletes its test data. It costs a fraction of a cent of OpenAI credit and takes under a minute.
//
// Foundation checks (Competitor Agent, final design): describing an idea makes the Conversational Agent delegate
// to the Competitor Agent, no form comes first, and the founder sees the capability_pending note in their language.
import { RequestContext } from '@mastra/core/request-context';
import { NOTE_TEXT } from '../src/mastra/lib/competitor-notes';
import { replyProblems } from '../src/mastra/lib/reply-guard';
import { getSupabase } from '../src/mastra/lib/supabase';

process.loadEnvFile('.env');
const { mastra } = await import('../src/mastra/index');

type Step = { toolCalls?: { payload?: { toolName: string } }[] };
const results: { check: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push({ check: name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

async function main() {
  const username = process.argv[2];
  if (!username) throw new Error('Give the username of a test founder: npm run test:live -- <username>');
  const supabase = getSupabase();

  // 1. A fresh test idea and assessment.
  const { data: user } = await supabase.from('founders').select('user_id').eq('username', username).maybeSingle();
  if (!user) throw new Error(`No user with the username "${username}".`);
  const { data: idea, error: ideaError } = await supabase.from('startup_ideas').insert({ founder_id: user.user_id, idea_name: 'Test idea (live test)' }).select('idea_id').single();
  if (ideaError) throw ideaError;
  const { data: assessment, error: assessmentError } = await supabase.from('assessments').insert({ idea_id: idea.idea_id, language: 'en', status: 'in_progress' }).select('assessment_id').single();
  if (assessmentError) throw assessmentError;
  console.log(`Test assessment ${assessment.assessment_id}\n`);

  const agent = mastra.getAgent('conversationalAgent');
  async function say(thread: string, message: string) {
    const requestContext = new RequestContext();
    requestContext.set('userId', user!.user_id);
    requestContext.set('assessmentId', assessment!.assessment_id);
    const reply = await agent.generate(message, { requestContext, memory: { thread, resource: user!.user_id } });
    const calls = ((reply.steps ?? []) as Step[]).flatMap((s) => s.toolCalls ?? []).map((c) => c.payload?.toolName ?? '');
    const hookErrors = (requestContext.get('__mastra_delegationHookErrors') as unknown[] | undefined) ?? [];
    console.log(`> ${message}\n< ${reply.text.replace(/\n/g, ' ')}\n  tools: ${calls.join(', ') || 'none'}\n`);
    return { text: reply.text, calls, hookErrors };
  }

  // The founder must see the exact note, in their language, and never the agent's working memory.
  function checkReply(label: string, reply: { text: string; calls: string[]; hookErrors: unknown[] }, language: 'en' | 'ar') {
    const note = NOTE_TEXT.capability_pending[language];
    check(`${label}: delegated to the Competitor Agent`, reply.calls.some((c) => /competitor/i.test(c)), reply.calls.join(', '));
    check(`${label}: the delegation checks raised no error`, reply.hookErrors.length === 0, JSON.stringify(reply.hookErrors));
    const problems = replyProblems(reply.text, { sentences: [note], language });
    check(`${label}: exact note, ${language === 'ar' ? 'Arabic' : 'English'} reply, no working memory`, problems.length === 0, problems.join(' | '));
    check(`${label}: the note appears once`, reply.text.split(note).length === 2);
  }

  async function stream(thread: string, message: string) {
    const requestContext = new RequestContext();
    requestContext.set('userId', user!.user_id);
    requestContext.set('assessmentId', assessment!.assessment_id);
    const output = await agent.stream(message, { requestContext, memory: { thread, resource: user!.user_id } });
    let text = '';
    for await (const piece of output.textStream) text += piece; // what the website receives, piece by piece
    const calls = ((await output.steps) as Step[]).flatMap((s) => s.toolCalls ?? []).map((c) => c.payload?.toolName ?? '');
    const hookErrors = (requestContext.get('__mastra_delegationHookErrors') as unknown[] | undefined) ?? [];
    console.log(`> ${message}  (streamed)\n< ${text.replace(/\n/g, ' ')}\n  tools: ${calls.join(', ') || 'none'}\n`);
    return { text, calls, hookErrors };
  }

  try {
    // 2. English: an idea in one message.
    checkReply('English', await say(`live-test-en-${Date.now()}`, 'I want to build an app that lets restaurants in Riyadh order fresh vegetables directly from local farms.'), 'en');

    // 3. Arabic: the same kind of idea, in a new conversation.
    checkReply('Arabic', await say(`live-test-ar-${Date.now()}`, 'فكرتي تطبيق يساعد المطاعم في الرياض تطلب خضار طازجة من المزارع المحلية مباشرة.'), 'ar');

    // 4. Streamed, as the website receives it: a rewrite must never show the founder two replies.
    checkReply('Streamed', await stream(`live-test-stream-${Date.now()}`, 'Healthy lunch boxes delivered to offices in Dammam every day.'), 'en');
  } finally {
    // 4. Clean up: deleting the test idea deletes its assessment with it.
    await supabase.from('startup_ideas').delete().eq('idea_id', idea.idea_id);
    console.log('\nTest data deleted.');
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} of ${results.length} checks passed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
