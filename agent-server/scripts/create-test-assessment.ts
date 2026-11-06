// Script: creates one test idea and one assessment for a founder, so the agents can be tested in Studio.
// Run with: npm run test:assessment -- <username>
// It prints the ids to paste into Studio's request context.
import { getSupabase } from '../src/mastra/lib/supabase';

process.loadEnvFile('.env');

async function main() {
  const username = process.argv[2];
  if (!username) throw new Error('Give the username of the test founder, e.g. npm run test:assessment -- darb_test');

  const supabase = getSupabase();
  const { data: user, error: userError } = await supabase.from('users').select('user_id').eq('username', username).maybeSingle();
  if (userError) throw userError;
  if (!user) throw new Error(`No user with the username "${username}".`);

  const { data: idea, error: ideaError } = await supabase
    .from('startup_ideas')
    .insert({ user_id: user.user_id, idea_name: 'Test idea (agent testing)' })
    .select('idea_id')
    .single();
  if (ideaError) throw ideaError;

  const { data: assessment, error: assessmentError } = await supabase
    .from('assessments')
    .insert({ idea_id: idea.idea_id, language: 'en', status: 'in_progress' })
    .select('assessment_id')
    .single();
  if (assessmentError) throw assessmentError;

  console.log('Test assessment created. In Studio, open the Conversational Agent, then its request context, and paste:');
  console.log(JSON.stringify({ userId: user.user_id, assessmentId: assessment.assessment_id }, null, 2));
}

main().catch((error) => {
  console.error('Could not create the test assessment:', error.message ?? error);
  process.exit(1);
});
