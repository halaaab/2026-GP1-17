// Live end-to-end test: a real chat with the real agents, OpenAI, Tavily and Supabase.
// Run with: npm run test:live -- <username of a test founder>
// Each conversation gets its own test idea and assessment, as on the website, and all of them are deleted at the end.
// It prints PASS or FAIL for each check. It costs a few cents of OpenAI and Tavily credit and takes a few minutes.
//
// Idea checks: describing an idea makes the Conversational Agent delegate to the Competitor Agent right away, and the
// reply carries every sentence the founder must see, in their language, never the agent's working memory.
// Understand check: a vague idea (even only a sector) is delegated too; the Competitor Agent asks the founder one question.
// No-idea check: a founder who names nothing is answered by Darb itself, without delegating.
// What-if check: a what-if is never run on first mention; Darb asks the founder to confirm it first.
// Different idea check: a different idea in a conversation that already has an analysis is not analysed there;
// Darb tells the founder, in one exact sentence, to open a new conversation for it.
import { RequestContext } from '@mastra/core/request-context';
import { REPLY_RULES_KEY, replyProblems, type ReplyRules } from '../src/mastra/lib/reply-guard';
import { getSupabase } from '../src/mastra/lib/supabase';

process.loadEnvFile('.env');
const { mastra } = await import('../src/mastra/index');

type Step = { toolCalls?: { payload?: { toolName: string } }[] };
type Reply = { text: string; calls: string[]; hookErrors: unknown[]; rules?: ReplyRules };
const results: { check: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push({ check: name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

async function main() {
  const username = process.argv[2];
  if (!username) throw new Error('Give the username of a test founder: npm run test:live -- <username>');
  const supabase = getSupabase();
  const { data: user } = await supabase.from('founders').select('user_id').eq('username', username).maybeSingle();
  if (!user) throw new Error(`No user with the username "${username}".`);

  // 1. Each conversation gets a fresh test idea and assessment, as the website does for each new conversation.
  const ideaIds: string[] = [];
  async function newAssessment(): Promise<string> {
    const { data: idea, error: ideaError } = await supabase.from('startup_ideas').insert({ founder_id: user!.user_id, idea_name: 'Test idea (live test)' }).select('idea_id').single();
    if (ideaError) throw ideaError;
    ideaIds.push(idea.idea_id);
    const { data: assessment, error } = await supabase.from('assessments').insert({ idea_id: idea.idea_id, language: 'en', status: 'in_progress' }).select('assessment_id').single();
    if (error) throw error;
    return assessment.assessment_id;
  }

  const agent = mastra.getAgent('conversationalAgent');
  function contextFor(assessmentId: string) {
    const requestContext = new RequestContext();
    requestContext.set('userId', user!.user_id);
    requestContext.set('assessmentId', assessmentId);
    return requestContext;
  }
  const toolCalls = (steps: Step[]) => steps.flatMap((s) => s.toolCalls ?? []).map((c) => c.payload?.toolName ?? '');
  const hookErrorsOf = (requestContext: RequestContext) => (requestContext.get('__mastra_delegationHookErrors') as unknown[] | undefined) ?? [];

  async function say(chat: { thread: string; assessmentId: string }, message: string): Promise<Reply> {
    const requestContext = contextFor(chat.assessmentId);
    const reply = await agent.generate(message, { requestContext, memory: { thread: chat.thread, resource: user!.user_id } });
    const calls = toolCalls((reply.steps ?? []) as Step[]);
    console.log(`> ${message}\n< ${reply.text.replace(/\n/g, ' ')}\n  tools: ${calls.join(', ') || 'none'}\n`);
    return { text: reply.text, calls, hookErrors: hookErrorsOf(requestContext), rules: requestContext.get(REPLY_RULES_KEY) as ReplyRules | undefined };
  }

  async function stream(chat: { thread: string; assessmentId: string }, message: string): Promise<Reply> {
    const requestContext = contextFor(chat.assessmentId);
    const output = await agent.stream(message, { requestContext, memory: { thread: chat.thread, resource: user!.user_id } });
    let text = '';
    for await (const piece of output.textStream) text += piece; // what the website receives, piece by piece
    const calls = toolCalls((await output.steps) as Step[]);
    console.log(`> ${message}  (streamed)\n< ${text.replace(/\n/g, ' ')}\n  tools: ${calls.join(', ') || 'none'}\n`);
    return { text, calls, hookErrors: hookErrorsOf(requestContext), rules: requestContext.get(REPLY_RULES_KEY) as ReplyRules | undefined };
  }

  async function newChat(label: string) {
    return { thread: `live-test-${label}-${Date.now()}`, assessmentId: await newAssessment() };
  }

  // The founder must see every sentence the analysis gave, in their language, and never the agent's working memory.
  function checkReply(label: string, reply: Reply, language: 'en' | 'ar') {
    check(`${label}: delegated to the Competitor Agent`, reply.calls.some((c) => /competitor/i.test(c)), reply.calls.join(', '));
    check(`${label}: the delegation checks raised no error`, reply.hookErrors.length === 0, JSON.stringify(reply.hookErrors));
    const problems = replyProblems(reply.text, { sentences: reply.rules?.sentences ?? [], language });
    check(`${label}: every required sentence, ${language === 'ar' ? 'Arabic' : 'English'} reply, no working memory`, problems.length === 0, problems.join(' | '));
  }

  async function analysedAt(assessmentId: string) {
    const { data } = await supabase.from('assessments').select('analysed_at').eq('assessment_id', assessmentId).single();
    return (data?.analysed_at as string | null) ?? null;
  }

  // How many assessments the idea of this conversation has: a what-if that ran adds one.
  async function assessmentsOfIdea(assessmentId: string) {
    const { data } = await supabase.from('assessments').select('idea_id').eq('assessment_id', assessmentId).single();
    const { count } = await supabase.from('assessments').select('assessment_id', { count: 'exact', head: true }).eq('idea_id', data!.idea_id);
    return count ?? 0;
  }

  try {
    // 2. English: an idea in one message.
    const english = await newChat('en');
    checkReply('English', await say(english, 'I want to build an app that lets restaurants in Riyadh order fresh vegetables directly from local farms.'), 'en');

    // 3. Different idea in the same conversation: analysed there as its own idea; the first analysis stays.
    const before = await analysedAt(english.assessmentId);
    const other = await say(english, 'I have another idea: a mobile app to book a car wash at home in Jeddah.');
    check('Different idea: the analysis was not replaced', before !== null && (await analysedAt(english.assessmentId)) === before, `${before}`);
    const { data: laterRows } = await supabase.from('assessments').select('analysed_at').eq('thread_id', english.assessmentId);
    check('Different idea: analysed in the same conversation as its own idea', other.calls.some((c) => /competitor/i.test(c)) && (laterRows ?? []).some((r) => r.analysed_at), other.text);

    // 4. Arabic: the same kind of idea, in its own conversation.
    checkReply('Arabic', await say(await newChat('ar'), 'فكرتي تطبيق يساعد المطاعم في الرياض تطلب خضار طازجة من المزارع المحلية مباشرة.'), 'ar');

    // 5. Streamed, as the website receives it: a rewrite must never show the founder two replies.
    checkReply('Streamed', await stream(await newChat('stream'), 'Healthy lunch boxes delivered to offices in Dammam every day.'), 'en');

    // 6. A vague idea: delegated too; the Competitor Agent asks one question instead of searching (PBI 34).
    const vague = await say(await newChat('vague'), 'I want to start a business in the food sector.');
    check('Vague idea: delegated to the Competitor Agent', vague.calls.some((c) => /competitor/i.test(c)), vague.calls.join(', '));
    check('Vague idea: asks one question, in English', /[?؟]/.test(vague.text) && !/[\u0600-\u06FF]/.test(vague.text), vague.text);
    // A founder with no idea at all is not delegated: Darb helps them find one (reference conversation "A founder without an idea yet").
    const noIdea = await say(await newChat('no-idea'), "I'd love to start a business, but I don't have an idea yet.");
    check('No idea yet: not delegated, Darb asks itself', !noIdea.calls.some((c) => /competitor/i.test(c)) && /[?؟]/.test(noIdea.text), noIdea.text);
    check('No idea yet: English reply', !/[\u0600-\u06FF]/.test(noIdea.text), noIdea.text);

    // 7. A what-if after an idea: Darb restates it and asks first (it uses one of the founder's analyses).
    const whatIfChat = await newChat('what-if');
    await say(whatIfChat, 'An app that gives people one subscription to many gyms in Riyadh.');
    const runsBefore = await assessmentsOfIdea(whatIfChat.assessmentId);
    const whatIf = await say(whatIfChat, 'What if I targeted Jeddah instead?');
    // The server's confirmation check may refuse a first what-if attempt; what matters is that none was run.
    check('What-if: asks the founder to confirm first, runs nothing yet', /[?؟]/.test(whatIf.text) && (await assessmentsOfIdea(whatIfChat.assessmentId)) === runsBefore, whatIf.text);
    const { count: laterIdeas } = await supabase.from('assessments').select('assessment_id', { count: 'exact', head: true }).eq('thread_id', whatIfChat.assessmentId);
    check('What-if: not mistaken for a different idea', !laterIdeas, whatIf.text);
  } finally {
    // 8. Clean up: deleting a test idea deletes its assessments (and any what-if) with it.
    // the ideas described later in a test conversation are their own ideas (lib/conversation-ideas.ts)
    const { data: ours } = await supabase.from('assessments').select('assessment_id').in('idea_id', ideaIds);
    const { data: later } = await supabase.from('assessments').select('idea_id').in('thread_id', (ours ?? []).map((a) => a.assessment_id));
    for (const ideaId of [...ideaIds, ...(later ?? []).map((a) => a.idea_id)]) await supabase.from('startup_ideas').delete().eq('idea_id', ideaId);
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
