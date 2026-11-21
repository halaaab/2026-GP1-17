// Script: gives each startup an ISIC4 section and division, from its English description.
// An AI model suggests the codes, but it can only choose from GASTAT's SSIC list, and code checks that the
// division belongs to the section before anything is saved.
// Run with: npm run classify:startups               (classifies startups that have no codes yet)
//           npm run classify:startups -- --dry-run --limit 20   (prints suggestions, saves nothing)
import { writeFileSync } from 'node:fs';
import { API_TIMEOUT_MS } from '../src/mastra/config/limits';
import { ISIC_DIVISIONS } from '../src/mastra/config/isic-divisions';
import { ISIC_SECTIONS, ISIC_SECTION_LETTERS } from '../src/mastra/config/sectors';
import { getSupabase } from '../src/mastra/lib/supabase';

process.loadEnvFile('.env');

const CLASSIFY_MODEL = 'gpt-4o-mini';
const PARALLEL = 8;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.indexOf('--limit');
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : undefined;
const outArg = args.indexOf('--out');
const outFile = outArg >= 0 ? args[outArg + 1] : undefined;

const divisionLines = Object.entries(ISIC_DIVISIONS)
  .map(([code, d]) => `${code} (section ${d.section}): ${d.en}`)
  .join('\n');

type Startup = { startup_id: string; startup_name: string; startup_description: string | null; tags: string | null; sector: string | null };
type Result = { section: string; division: string; confidence: 'high' | 'medium' | 'low' };

async function suggest(startup: Startup): Promise<Result> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
    body: JSON.stringify({
      model: CLASSIFY_MODEL,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `You classify a Saudi startup into ISIC Rev.4 (GASTAT's SSIC) by its MAIN economic activity: what it sells and how it earns money, not who its customers are. Rules: a company that sells software or SaaS to other businesses (store builders, POS, ERP, HR or CRM software) is J 62 or J 63, even when its customers are retailers or restaurants. A company that itself sells goods online is G 47 (or G 46 for wholesale). A booking or reservation platform for stays, trips or tickets is N 79. A lending, payments or BNPL company is K 64 or K 66. A delivery or courier service is H 53. A school, tutoring or training provider is P 85. Choose exactly one division from this list, and its section:\n${divisionLines}`,
        },
        {
          role: 'user',
          content: [
            `Description: ${startup.startup_description ?? ''}`,
            startup.tags ? `Tags: ${startup.tags}` : '',
            startup.sector ? `Old sector labels: ${startup.sector}` : '',
          ].filter(Boolean).join('\n'),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'isic',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['section', 'division', 'confidence'],
            properties: {
              section: { type: 'string', enum: ISIC_SECTION_LETTERS },
              division: { type: 'string', enum: Object.keys(ISIC_DIVISIONS) },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            },
          },
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI failed with status ${response.status}`);
  const body = (await response.json()) as { choices: { message: { content: string } }[] };
  return JSON.parse(body.choices[0].message.content) as Result;
}

async function main() {
  const supabase = getSupabase();
  let query = supabase
    .from('startups')
    // sectors and tags are kept one per row (migration 0043); target_market was removed (0044)
    .select('startup_id, startup_name, startup_description, startup_sectors (sector), startup_tags (tag)')
    .order('startup_id');
  if (!dryRun) query = query.is('isic_division', null);
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  const startups: Startup[] = (data ?? []).map((row) => ({
    startup_id: row.startup_id,
    startup_name: row.startup_name,
    startup_description: row.startup_description,
    sector: (row.startup_sectors as { sector: string }[]).map((item) => item.sector).join('; ') || null,
    tags: (row.startup_tags as { tag: string }[]).map((item) => item.tag).join(', ') || null,
  }));
  console.log(`${startups.length} startups to classify${dryRun ? ' (dry run: nothing is saved)' : ''}.`);

  const rows: string[] = ['startup_id,name,section,division,division_name,confidence,old_sector'];
  let done = 0;
  let rejected = 0;

  for (let start = 0; start < startups.length; start += PARALLEL) {
    const batch = startups.slice(start, start + PARALLEL);
    await Promise.all(
      batch.map(async (startup) => {
        const result = await suggest(startup);
        // The code check: the division must exist. If the model paired it with the wrong section,
        // the division is the more specific choice, so its own section is used.
        const division = ISIC_DIVISIONS[result.division];
        if (!division) {
          rejected++;
          console.warn(`  rejected ${startup.startup_id}: unknown division ${result.division}`);
          return;
        }
        if (division.section !== result.section) {
          console.warn(`  corrected ${startup.startup_id}: ${result.section} ${result.division} → ${division.section} ${result.division}`);
          result.section = division.section;
        }
        rows.push(
          [startup.startup_id, startup.startup_name, result.section, result.division, division.en, result.confidence, startup.sector ?? '']
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(','),
        );
        if (dryRun) {
          console.log(`  ${startup.startup_name}: ${result.section} ${result.division} ${division.en} (${result.confidence}) ← ${startup.sector}`);
        } else {
          const { error: updateError } = await supabase
            .from('startups')
            .update({ isic_division: result.division }) // the section follows from the division (migration 0043)
            .eq('startup_id', startup.startup_id);
          if (updateError) throw updateError;
        }
      }),
    );
    done += batch.length;
    if (!dryRun) console.log(`Classified ${done} of ${startups.length}`);
  }

  if (outFile) writeFileSync(outFile, rows.join('\n'));
  console.log(`Done. ${rejected} suggestion(s) rejected by the code check.${outFile ? ` Review file: ${outFile}` : ''}`);
  const sections = rows.slice(1).reduce<Record<string, number>>((acc, row) => {
    const section = row.split('","')[2];
    acc[section] = (acc[section] ?? 0) + 1;
    return acc;
  }, {});
  console.log('By section:', Object.entries(sections).map(([s, n]) => `${s} ${ISIC_SECTIONS[s as keyof typeof ISIC_SECTIONS]?.en ?? ''}: ${n}`).join(' · '));
}

main().catch((error) => {
  console.error('Classification failed:', error.message ?? error);
  process.exit(1);
});
