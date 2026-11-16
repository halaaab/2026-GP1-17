// Script (Task 9): the monthly re-check of Darb's startup list (lib/recheck-startups.ts).
// Run with:
//   npm run recheck:startups                           every startup never checked or checked over 90 days ago
//   npm run recheck:startups -- --ids ST_073,ST_291    only these startups (still skipped if checked in the last 90 days)
//   npm run recheck:startups -- --limit 10             the first 10 that are due
//   npm run recheck:startups -- --dry-run              checks and prints, saves nothing
// It uses Tavily (about 3 reading calls per 10 startups, plus 1 news search per startup with no date found, or only an old copyright year)
// and a little OpenAI credit.
import { initCrRegistry } from '../src/mastra/lib/cr-registry';
import { initCrNames } from '../src/mastra/lib/cr-names';
import { closeBrowser } from '../src/mastra/lib/browser-page';
import { recheckStartups, startupsDue, type StartupToRecheck } from '../src/mastra/lib/recheck-startups';
import { getSupabase } from '../src/mastra/lib/supabase';
import { liveValidateDeps, tavilyNewsSearch } from '../src/mastra/tools/validate-candidate';

process.loadEnvFile('.env');

function readArguments(args: string[]) {
  const value = (name: string) => {
    const at = args.indexOf(`--${name}`);
    return at >= 0 ? args[at + 1] : undefined;
  };
  return {
    ids: value('ids')?.split(',').map((s) => s.trim()).filter(Boolean),
    limit: value('limit') ? Number(value('limit')) : undefined,
    dryRun: args.includes('--dry-run'),
  };
}

async function main() {
  const options = readArguments(process.argv.slice(2));
  const db = getSupabase();
  await initCrRegistry(); // so a CR number on a startup's page can make it Confirmed
  await initCrNames(); // and so can its legal name

  const { data, error } = await db.from('startups').select('startup_id, startup_name, startup_name_ar, website, startup_description, validated_at').order('startup_id');
  if (error) throw error;
  let { due, skipped } = startupsDue(data as StartupToRecheck[], new Date(), options);
  if (options.limit) due = due.slice(0, options.limit);
  console.log(`To re-check: ${due.length} | skipped, checked in the last 90 days: ${skipped.length}${options.dryRun ? ' | DRY RUN: nothing is saved' : ''}`);
  for (const s of skipped.slice(0, 20)) console.log(`  skipped ${s.startup_id} ${s.startup_name} (checked ${s.validated_at?.slice(0, 10)})`);
  console.log('');

  const deps = liveValidateDeps();
  deps.findNews = tavilyNewsSearch(); // no date found, or only an old copyright year: one news search on its name (re-check only)
  if (options.dryRun) deps.save = async () => {};
  const { lines, tavily_calls } = await recheckStartups(due, deps, (l) =>
    console.log(`${l.startup_id} ${l.name}: ${l.evidence_status.toUpperCase()} → saved as ${l.saved_as ?? 'no status'}\n   ${l.why}`),
  );

  const count = (v: string | null) => lines.filter((l) => l.saved_as === v).length;
  console.log(`\nRe-checked: ${lines.length} (pass ${count('pass')}, fail ${count('fail')}, no status ${count(null)}, not saved (site did not answer) ${count('not saved')}) | skipped: ${skipped.length} | Tavily calls: ${tavily_calls}`);
}

main()
  .catch((error) => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  })
  .finally(() => closeBrowser()); // the browser opened for JavaScript sites, if any
