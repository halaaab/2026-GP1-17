// Script (Task 1): profiles and embeds the startups in Darb's list (lib/startup-profiles.ts).
// Run with:
//   npm run profile:startups                      every startup that has no profile yet
//   npm run profile:startups -- --ids ST_073,ST_291   only these startups (redone on purpose)
//   npm run profile:startups -- --limit 10        the first 10 without a profile
//   npm run profile:startups -- --dry-run         prints the profiles, saves nothing
// It costs a little OpenAI credit (under 1 US dollar for all 513 startups).
import { EMBEDDING_MODEL } from '../src/mastra/config/models';
import { embedTexts, toPgVector } from '../src/mastra/lib/embeddings';
import { buildIdeaProfile, profileText } from '../src/mastra/lib/idea-profile';
import { profileAll, startupsToDo, type ProfileDeps } from '../src/mastra/lib/startup-profiles';
import { getSupabase } from '../src/mastra/lib/supabase';

process.loadEnvFile('.env');

function readArguments(args: string[]) {
  const value = (name: string) => {
    const at = args.indexOf(`--${name}`);
    return at >= 0 ? args[at + 1] : undefined;
  };
  return {
    ids: value('ids')?.split(',').map((s) => s.trim()).filter(Boolean),
    limit: value('limit') ? Number(value('limit')) : undefined,
    force: args.includes('--force'),
    dryRun: args.includes('--dry-run'),
  };
}

async function main() {
  const options = readArguments(process.argv.slice(2));
  const db = getSupabase();

  const { data, error } = await db.from('startups').select('startup_id, startup_name, startup_description, profile_text').order('startup_id');
  if (error) throw error;
  const names = new Map(data.map((s) => [s.startup_id, s.startup_name]));
  let { todo, skipped } = startupsToDo(data, options);
  if (options.limit) todo = todo.slice(0, options.limit);
  console.log(`To profile: ${todo.length} | skipped, already done: ${skipped.length}${options.dryRun ? ' | DRY RUN: nothing is saved' : ''}\n`);

  const deps: ProfileDeps = {
    buildProfile: buildIdeaProfile,
    toText: profileText,
    embed: async (text) => (await embedTexts([text]))[0],
    save: async (startupId, row) => {
      if (options.dryRun) return;
      const saved = await db
        .from('startups')
        .update({ profile_text: row.profile_text, embedding: toPgVector(row.embedding), embedding_model: EMBEDDING_MODEL, embedded_at: new Date().toISOString() })
        .eq('startup_id', startupId);
      if (saved.error) throw saved.error;
    },
  };

  let done = 0;
  const results = await profileAll(todo, deps, 6, (r) => {
    done++;
    const name = names.get(r.startup_id);
    if (r.status === 'saved') {
      if (todo.length <= 20) console.log(`── ${r.startup_id} ${name}\n${r.profile_text}\n`);
      else if (done % 25 === 0 || done === todo.length) console.log(`${done} / ${todo.length}`);
    } else console.log(`FAILED ${r.startup_id} ${name}: ${r.reason}`);
  });

  const saved = results.filter((r) => r.status === 'saved').length;
  const failed = results.filter((r) => r.status === 'failed');
  console.log(`\nSaved: ${saved} | failed: ${failed.length}${options.dryRun ? ' (dry run: nothing saved)' : ''}`);
  for (const f of failed) console.log(`  ${f.startup_id} ${names.get(f.startup_id)}: ${'reason' in f ? f.reason : ''}`);

  // TC-1.5: every startup must have a profile.
  const { count } = await db.from('startups').select('startup_id', { count: 'exact', head: true }).is('profile_text', null);
  console.log(`Startups still without a profile: ${count}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
