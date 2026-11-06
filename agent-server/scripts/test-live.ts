// Live end-to-end test: a real chat with the real agents, OpenAI, Tavily and Supabase, checked against the database.
// Run with: npm run test:live -- <username of a test founder>
// It creates a test idea, chats through the whole flow, prints PASS or FAIL for each check, then deletes its test data.
// It costs a few cents of OpenAI and Tavily credit, and takes about two minutes.
import { RequestContext } from '@mastra/core/request-context';
import { getSupabase } from '../src/mastra/lib/supabase';

process.loadEnvFile('.env');
const { mastra } = await import('../src/mastra/index');

type Step = { toolCalls?: { payload?: { toolName: string; args: unknown } }[]; toolResults?: { payload?: { toolName: string; result: unknown } }[] };
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
  const { data: user } = await supabase.from('users').select('user_id').eq('username', username).maybeSingle();
  if (!user) throw new Error(`No user with the username "${username}".`);
  const { data: idea, error: ideaError } = await supabase.from('startup_ideas').insert({ user_id: user.user_id, idea_name: 'Test idea (live test)' }).select('idea_id').single();
  if (ideaError) throw ideaError;
  const { data: assessment, error: assessmentError } = await supabase.from('assessments').insert({ idea_id: idea.idea_id, language: 'en', status: 'in_progress' }).select('assessment_id').single();
  if (assessmentError) throw assessmentError;
  const assessmentId = assessment.assessment_id as string;
  console.log(`Test assessment ${assessmentId}\n`);

  const agent = mastra.getAgent('conversationalAgent');
  const thread = `live-test-${Date.now()}`;
  async function say(message: string) {
    const requestContext = new RequestContext();
    requestContext.set('userId', user!.user_id);
    requestContext.set('assessmentId', assessmentId);
    const reply = await agent.generate(message, { requestContext, memory: { thread, resource: user!.user_id } });
    const steps = (reply.steps ?? []) as Step[];
    const calls = steps.flatMap((s) => s.toolCalls ?? []).map((c) => c.payload?.toolName ?? '');
    const toolResults = Object.fromEntries(steps.flatMap((s) => s.toolResults ?? []).map((r) => [r.payload?.toolName ?? '', r.payload?.result]));
    console.log(`> ${message}\n< ${reply.text.slice(0, 300).replace(/\n/g, ' ')}${reply.text.length > 300 ? '…' : ''}\n  tools: ${calls.join(', ') || 'none'}\n`);
    return { text: reply.text, calls, toolResults };
  }

  try {
    // 2. The idea, with everything given at once.
    const first = await say(
      'I want to build an app that lets Saudi parents pay private school fees in monthly instalments, buy now pay later. Sector K Financial and insurance activities, sub-sector 64, in Riyadh.',
    );
    check('no analysis before confirmation', !first.calls.includes('delegate_competitor_analysis'));

    // 3. Confirmation runs the analysis.
    const second = await say('Yes, that is correct. Please run the analysis.');
    const analysis = second.toolResults.delegate_competitor_analysis as
      | { status: string; competitors: { startup_id: string; name: string; similarity: number; source: string }[]; iss: number | null; comparison_matrix?: unknown }
      | undefined;
    check('analysis ran after confirmation', !!analysis, analysis?.status);
    check('analysis found competitors', analysis?.status === 'ok' && analysis.competitors.length > 0, analysis?.competitors.map((c) => c.name).join(', '));
    check('at most 3 competitors', (analysis?.competitors.length ?? 0) <= 3);
    check('comparison matrix included', !!analysis?.comparison_matrix);

    // 4. What the founder saw matches what was saved.
    const { data: saved } = await supabase.from('similar_startup_results').select('startup_id, similarity_score, rank').eq('assessment_id', assessmentId).order('rank');
    const datasetShown = (analysis?.competitors ?? []).filter((c) => c.source === 'dataset');
    check(
      'saved competitors match the ones shown',
      JSON.stringify((saved ?? []).map((r) => r.startup_id)) === JSON.stringify(datasetShown.map((c) => c.startup_id)),
      `${saved?.length ?? 0} saved`,
    );
    const { data: savedAssessment } = await supabase.from('assessments').select('iss, analysed_at, scenario_inputs').eq('assessment_id', assessmentId).single();
    check('saved ISS matches the one shown', Number(savedAssessment?.iss) === analysis?.iss, `${savedAssessment?.iss} vs ${analysis?.iss}`);
    check('analysis time saved (daily limit)', !!savedAssessment?.analysed_at);
    check('confirmed sector and sub-sector saved', savedAssessment?.scenario_inputs?.sector === 'K' && savedAssessment?.scenario_inputs?.sub_sector === '64');
    const ids = datasetShown.map((c) => c.startup_id);
    const { data: real } = ids.length ? await supabase.from('startups').select('startup_id').in('startup_id', ids) : { data: [] };
    check('every dataset competitor exists in Darb\'s data', (real?.length ?? 0) === ids.length);

    // 5. A follow-up question is answered from the database, without guessing funding.
    const name = analysis?.competitors.find((c) => c.source === 'dataset')?.name;
    if (name) {
      const third = await say(`Why is ${name} relevant? And how much funding have they raised?`);
      check('follow-up read the stored record', third.calls.includes('get_competitor_details'));
      check('no funding figure invented', !/(SAR|\$|USD|million|مليون)\s?\d|\d[\d,.]*\s?(SAR|USD|million|مليون)/i.test(third.text), third.text.slice(0, 80));
    }

    // 6. A what-if asks first, then creates a new version and compares.
    const fourth = await say('What if it was for university tuition instead of school fees?');
    check('what-if asks for confirmation first', !fourth.calls.includes('run_what_if'));
    const fifth = await say('Yes, confirmed. Run it.');
    const whatIf = fifth.toolResults.run_what_if as { status: string; assessment_id: string | null; comparison: { iss: { before: number | null; after: number | null } } | null } | undefined;
    check('what-if ran', whatIf?.status === 'ok', whatIf?.status);
    if (whatIf?.assessment_id) {
      const { data: child } = await supabase.from('assessments').select('parent_assessment_id, iss').eq('assessment_id', whatIf.assessment_id).single();
      check('what-if saved as a new version of the original', child?.parent_assessment_id === assessmentId);
      check('comparison uses the saved scores', whatIf.comparison?.iss.before === analysis?.iss && whatIf.comparison?.iss.after === Number(child?.iss));
    }
  } finally {
    // 7. Clean up: deleting the test idea deletes its assessments and saved results with it.
    await supabase.from('startup_ideas').delete().eq('idea_id', idea.idea_id);
    console.log('\nTest data deleted.');
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} of ${results.length} checks passed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Live test could not run:', error.message ?? error);
  process.exit(1);
});
