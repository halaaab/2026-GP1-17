// Script: once per quarter, turns the Ministry of Commerce's active-registrations CSV into the company-name
// fingerprints file the server loads for the legal-name check (lib/cr-names.ts). No name is written to the file.
// Run it on your own computer, never on the server:
//   npm run prepare:cr-names -- --quarter "2026 Q3" --as-of 2026-09-30 --out data/cr/cr-names-2026-q3.txt.gz <csv file> ...
// Then set CR_NAMES_FILE in .env to the --out file and restart the server.
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { prepareCrNamesFile } from '../src/mastra/lib/cr-names';

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
    throw new Error('Usage: npm run prepare:cr-names -- --quarter "2026 Q3" --as-of 2026-09-30 --out <file.txt.gz> <csv file> ...');
  }
  await mkdir(dirname(resolve(out)), { recursive: true });
  const started = Date.now();
  const r = await prepareCrNamesFile(csvPaths, resolve(out), { quarter, as_of: asOf });
  console.log(`Companies read: ${r.rows.toLocaleString('en')} in ${Math.round((Date.now() - started) / 1000)} s`);
  console.log(`Different names: ${r.names.toLocaleString('en')} (shared by two or more companies, never used: ${r.ambiguous.toLocaleString('en')})`);
  console.log(`Rows skipped (not a company, or no unified number): ${r.skipped.toLocaleString('en')}`);
  console.log(`Saved: ${resolve(out)}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
