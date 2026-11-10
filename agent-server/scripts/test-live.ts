// Live end-to-end test: a real chat with the real agents, OpenAI and Supabase.
// Run with: npm run test:live -- <username of a test founder>
// It creates a test idea, describes it once in English and once in Arabic, prints PASS or FAIL for each check,
// then deletes its test data. It costs a fraction of a cent of OpenAI credit and takes under a minute.
//
// Foundation checks (Competitor Agent, final design): describing an idea makes the Conversational Agent delegate
// to the Competitor Agent, no form comes first, and the founder sees the capability_pending note in their language.
import { RequestContext } from '@mastra/core/request-context';
import { NOTE_TEXT } from '../src/mastra/lib/competitor-notes';
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

  try {
    // 2. English: an idea in one message.
    const en = await say(
      `live-test-en-${Date.now()}`,
      'I want to build an app that lets restaurants in Riyadh order fresh vegetables directly from local farms.',
    );
    check('English: delegated to the Competitor Agent', en.calls.some((c) => /competitor/i.test(c)), en.calls.join(', '));
    check('English: the delegation checks raised no error', en.hookErrors.length === 0, JSON.stringify(en.hookErrors));
    check('English: the founder sees the capability_pending note', en.text.includes(NOTE_TEXT.capability_pending.en));

    // 3. Arabic: the same kind of idea, in a new conversation.
    const ar = await say(`live-test-ar-${Date.now()}`, 'فكرتي تطبيق يساعد المطاعم في الرياض تطلب خضار طازجة من المزارع المحلية مباشرة.');
    check('Arabic: delegated to the Competitor Agent', ar.calls.some((c) => /competitor/i.test(c)), ar.calls.join(', '));
    check('Arabic: the delegation checks raised no error', ar.hookErrors.length === 0, JSON.stringify(ar.hookErrors));
    check('Arabic: the founder sees the capability_pending note in Arabic', ar.text.includes(NOTE_TEXT.capability_pending.ar));
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
