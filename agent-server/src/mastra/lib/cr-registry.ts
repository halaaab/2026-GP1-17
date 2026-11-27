// The CR check (Task 3): is this CR number on the Ministry of Commerce list of active registrations?
// The lookup is kept in the server's memory.
//
//   1. Once per quarter, prepareCrNumbersFile() reads the big CSV files locally and writes a small
//      file with only the numbers (no names, no owners, no capital): scripts/prepare-cr-numbers.ts.
//   2. When the server starts, loadCrRegistry() reads that small file into memory, as sorted number lists.
//   3. checkCr() reads a number and answers "match" or "unknown", never "fail": a missing number does not
//      prove a company is fake (many websites still show an old number, or none).
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { gunzipSync, createGzip } from 'node:zlib';
import { finished } from 'node:stream/promises';

// ---------------------------------------------------------------------------
// Reading a number
// ---------------------------------------------------------------------------

export type CrNumberType = 'unified' | 'old' | 'vat' | 'empty' | 'invalid';

// Arabic digits (٠١٢...) and Persian digits (۰۱۲...) become 0-9.
export function toLatinDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (d) => String((d.charCodeAt(0) & 0xf) % 10));
}

// Spaces, dashes, dots and slashes are removed; what is left must be exactly 10 digits.
// A unified number starts with 7; any other 10-digit number is an old CR number.
export function readCrNumber(raw: string | null | undefined): { number: string; type: CrNumberType } {
  const number = toLatinDigits(raw ?? '').replace(/[\s\-./_]/g, '');
  if (number === '') return { number, type: 'empty' };
  if (/^\d{15}$/.test(number)) return { number, type: 'vat' };
  if (/^7\d{9}$/.test(number)) return { number, type: 'unified' };
  if (/^\d{10}$/.test(number)) return { number, type: 'old' };
  return { number, type: 'invalid' };
}

// ---------------------------------------------------------------------------
// The list in memory
// ---------------------------------------------------------------------------

export type CrListInfo = { quarter: string; as_of: string; unified_count: number; old_count: number };

export type CrRegistry = { info: CrListInfo; unified: Float64Array; old: Float64Array };

// Finds a number in a sorted list by halving it each time (about 21 steps for 1.9 million numbers).
function contains(sorted: Float64Array, value: number): boolean {
  let low = 0;
  let high = sorted.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (sorted[middle] === value) return true;
    if (sorted[middle] < value) low = middle + 1;
    else high = middle - 1;
  }
  return false;
}

// The small numbers-only file: a first line with the list's details, then one number per line,
// "u" + unified number or "o" + old number. Stored gzip-compressed.
export function parseCrNumbersFile(text: string): CrRegistry {
  const lines = text.split('\n');
  const info = JSON.parse(lines[0].replace(/^#\s*/, '')) as CrListInfo;
  const unified: number[] = [];
  const old: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line[0] === 'u') unified.push(Number(line.slice(1)));
    else if (line[0] === 'o') old.push(Number(line.slice(1)));
  }
  return {
    info: { ...info, unified_count: unified.length, old_count: old.length },
    unified: Float64Array.from(unified).sort(),
    old: Float64Array.from(old).sort(),
  };
}

export async function loadCrRegistry(path: string): Promise<CrRegistry> {
  return parseCrNumbersFile(gunzipSync(await readFile(path)).toString('utf8'));
}

// The list the server uses. null until it is loaded (or when the file is missing).
let current: CrRegistry | null = null;
export const getCrRegistry = () => current;
export const setCrRegistry = (registry: CrRegistry | null) => {
  current = registry;
};

// At server start: loads the file named in .env (CR_NUMBERS_FILE). The server still starts without it.
export async function initCrRegistry(path = process.env.CR_NUMBERS_FILE): Promise<void> {
  if (!path) {
    console.warn('CR list not loaded: CR_NUMBERS_FILE is not set in .env. Every CR check will answer "unknown".');
    return;
  }
  try {
    const started = Date.now();
    current = await loadCrRegistry(path);
    const { info } = current;
    console.info(
      `Loaded ${info.unified_count.toLocaleString('en')} unified numbers and ${info.old_count.toLocaleString('en')} old numbers ` +
        `from ${info.quarter} (${info.as_of}) in ${Date.now() - started} ms.`,
    );
  } catch (error) {
    current = null;
    console.warn(`CR list not loaded from ${path}: ${(error as Error).message}. Every CR check will answer "unknown".`);
  }
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

export type CrCheck = {
  result: 'match' | 'unknown';
  number_checked: string;
  number_type: CrNumberType;
  reason: string;
  list: CrListInfo | null;
};

const REASONS = {
  unified_found: 'Unified number found in the list of active registrations.',
  old_found: 'Old CR number found in the list of active registrations.',
  not_found: 'Not in the list of active registrations. This does not mean the company is not real.',
  empty: 'No number was given.',
  vat: 'This is a 15-digit VAT number, not a CR number.',
  invalid: 'Not a CR number: a CR number has exactly 10 digits.',
  not_loaded: 'The list of active registrations is not loaded on the server.',
};

export function checkCr(raw: string | null | undefined, registry: CrRegistry | null = current): CrCheck {
  const { number, type } = readCrNumber(raw);
  const answer = (result: CrCheck['result'], reason: string): CrCheck => ({
    result,
    number_checked: number,
    number_type: type,
    reason,
    list: registry?.info ?? null,
  });

  if (type === 'empty') return answer('unknown', REASONS.empty);
  if (type === 'vat') return answer('unknown', REASONS.vat);
  if (type === 'invalid') return answer('unknown', REASONS.invalid);
  if (!registry) return answer('unknown', REASONS.not_loaded);

  if (type === 'unified' && contains(registry.unified, Number(number))) return answer('match', REASONS.unified_found);
  if (type === 'old' && contains(registry.old, Number(number))) return answer('match', REASONS.old_found);
  return answer('unknown', REASONS.not_found);
}

// ---------------------------------------------------------------------------
// The quarterly preparation step (run locally, never on the hosted server)
// ---------------------------------------------------------------------------

export type PrepareReport = { rows: number; unified: number; old: number; skipped_lines: number };

// Reads the Ministry's CSV files (first column: unified number, second column: old CR number) and writes the
// small numbers-only file. Rows without a unified number yet keep their old number in the first column.
export async function prepareCrNumbersFile(
  csvPaths: string[],
  outPath: string,
  details: { quarter: string; as_of: string },
): Promise<PrepareReport> {
  const unified = new Set<string>();
  const old = new Set<string>();
  let rows = 0;
  let skipped = 0;

  for (const csvPath of csvPaths) {
    const lines = createInterface({ input: createReadStream(csvPath, 'utf8'), crlfDelay: Infinity });
    let first = true;
    for await (const line of lines) {
      if (first) {
        first = false; // the header row
        continue;
      }
      const [col1 = '', col2 = ''] = line.split(',', 2).map((cell) => cell.replace(/"/g, '').trim());
      const a = readCrNumber(col1);
      const b = readCrNumber(col2);
      if (a.type !== 'unified' && a.type !== 'old' && b.type !== 'old') {
        skipped++; // a line that is not a registration (for example the rest of a name broken over two lines)
        continue;
      }
      rows++;
      if (a.type === 'unified') unified.add(a.number);
      if (a.type === 'old') old.add(a.number);
      if (b.type === 'old') old.add(b.number);
    }
  }

  const gzip = createGzip();
  const out = createWriteStream(outPath);
  gzip.pipe(out);
  gzip.write(`# ${JSON.stringify({ ...details, unified_count: unified.size, old_count: old.size })}\n`);
  for (const n of unified) gzip.write(`u${n}\n`);
  for (const n of old) gzip.write(`o${n}\n`);
  gzip.end();
  await finished(out);

  return { rows, unified: unified.size, old: old.size, skipped_lines: skipped };
}
