// Script: once per quarter, turns the Ministry of Commerce's active-registrations CSV files into the small
// numbers-only file the server loads (lib/cr-registry.ts). Run it on your own computer, never on the server.
//
// Run with:
//   npm run prepare:cr -- --quarter "2026 Q3" --as-of 2026-09-30 --out data/cr/cr-numbers-2026-q3.txt.gz <csv file> <csv file> ...
// Then set CR_NUMBERS_FILE in .env to the --out file and restart the server.
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { prepareCrNumbersFile } from '../src/mastra/lib/cr-registry';

// --quarter, --as-of and --out take a value; every other argument is a CSV file.
function readArguments(args: string[]) {
  const options: Record<string, string> = {};
  const csvPaths: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) options[args[i].slice(2)] = args[++i];
    else csvPaths.push(args[i]);
  }
  return { quarter: options.quarter, asOf: options['as-of'], out: options.out, csvPaths };
}

async function main() {
  const { quarter, asOf, out, csvPaths } = readArguments(process.argv.slice(2));
  if (!quarter || !asOf || !out || csvPaths.length === 0) {
    throw new Error('Usage: npm run prepare:cr -- --quarter "2026 Q3" --as-of 2026-09-30 --out <file.txt.gz> <csv file> ...');
  }

  await mkdir(dirname(resolve(out)), { recursive: true });
  const started = Date.now();
  const report = await prepareCrNumbersFile(csvPaths, resolve(out), { quarter, as_of: asOf });
  console.log(`Read ${report.rows.toLocaleString('en')} registrations from ${csvPaths.length} file(s) in ${Math.round((Date.now() - started) / 1000)} s.`);
  console.log(`Unified numbers: ${report.unified.toLocaleString('en')}`);
  console.log(`Old numbers:     ${report.old.toLocaleString('en')}`);
  console.log(`Lines skipped (not a registration): ${report.skipped_lines.toLocaleString('en')}`);
  console.log(`Saved: ${resolve(out)}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
