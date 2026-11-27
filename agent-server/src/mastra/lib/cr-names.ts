// The legal-name check: is the legal name a company writes on its own pages (its VAT certificate,
// its footer, its About page) exactly the name of one active company in the Ministry of Commerce list?
// An exact match on the whole cleaned name counts like a CR number match: the company can be Confirmed.
//
//   1. Arabic is written in many ways (ة or ه, أ or ا, ى or ي, diacritics, tatweel ـ, Arabic or Western digits),
//      so both names are cleaned the same way first: normalizeLegalName().
//   2. Privacy: names in the list can contain a person's full name ("شركة امنه … للنقل البري"), so the names are
//      never kept. Each cleaned name becomes a fingerprint (the start of its SHA-256 hash): Darb can check whether a
//      name is in the list, but no name can be read back from the file. Only companies (legal form "شركة") are
//      kept: sole proprietorships (مؤسسة) are usually a person's own name.
//   3. A name shared by two or more companies is marked "ambiguous" and never counts, so a common name never
//      confirms the wrong company. The company's city in the list must not conflict with the cities on its pages.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { finished } from 'node:stream/promises';
import { createGzip, gunzipSync } from 'node:zlib';
import { readCrNumber, toLatinDigits } from './cr-registry';

// ---------------------------------------------------------------------------
// 1. Cleaning a name
// ---------------------------------------------------------------------------

// Legal-form words that some write inside the name and others leave out. Removed from both sides
// (written here already cleaned: ة→ه, أ/إ/آ→ا, ى→ي).
const LEGAL_FORM = [
  'ذات مسووليه محدوده', 'ذات المسووليه المحدوده', 'شخص واحد', 'مساهمه مقفله', 'مساهمه مغلقه', 'مساهمه عامه', 'مساهمه',
  'ذ م م', 'ش م م', 'ش م ق', 'ش م ع', 'ش ذ م م', 'توصيه بسيطه', 'تضامنيه', 'مهنيه', 'شركه', 'الشركه',
];

export function normalizeArabic(text: string): string {
  return toLatinDigits(text.normalize('NFKC'))
    .replace(/[ً-ٰٟۖ-ۭ]/g, '') // diacritics (harakat, shadda, sukun, small letters)
    .replace(/ـ/g, '') // tatweel ـ
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىی]/g, 'ي')
    .replace(/ئ/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ء/g, '')
    .replace(/ک/g, 'ك')
    .replace(/[​-‏‪-‮⁦-⁩]/g, '') // hidden direction marks
    .toLowerCase();
}

export function normalizeLegalName(name: string): string {
  let n = ` ${normalizeArabic(name).replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  for (const form of LEGAL_FORM) n = n.split(` ${form} `).join(' ');
  return n.replace(/\s+/g, ' ').trim();
}

// The fingerprint of a cleaned name: the first 13 hex digits of its SHA-256 hash (52 bits, so it fits exactly in a
// number). With 600,000 names, the chance of two different names sharing one is about 1 in 25,000.
export function nameFingerprint(cleanName: string): number {
  return parseInt(createHash('sha256').update(cleanName).digest('hex').slice(0, 13), 16);
}

// Arabic read out of a PDF often comes in two broken ways (in 1pass's VAT certificate):
//   - "presentation forms", special letter shapes (ﺗﺎرﻳﺦ): NFKC turns them back into normal letters;
//   - two letters that the font joins come out swapped: "رشكه" for "شركه", "رضيبة" for "ضريبة", "املعلومات" for
//     "المعلومات", "يف" for "في", "الرئيسيس" for "الرئيسي".
// This repairs a COPY of the text: Darb searches both the text as read and the repaired copy. Only an exact match of
// a whole legal name or a number next to its words counts, so a wrongly "repaired" word cannot cause a wrong match.
// Only in text that uses the special shapes (a PDF): the swapped pairs are always two PLAIN letters standing between
// special shapes (or a space, or a plain ا), while every correctly ordered letter is a special shape. So only such
// plain pairs are swapped back; a correct word (all special shapes, like "اﻟﺮﻗﻢ") is never touched.
const PLAIN = 'ء-ي';
const SWAPPED = [
  new RegExp(`(?<=^|[^${PLAIN}]|ا)([رز])([شضتبسصنفقثك])(?=$|[^${PLAIN}])`, 'g'), // "رش" → "شر", "رض" → "ضر", "رت" → "تر"
  new RegExp(`(?<=^|[^${PLAIN}]|ا)([يى])([فسلبتنشصضقك])(?=$|[^${PLAIN}])`, 'g'), // "يف" → "في", "يس" → "سي", "يل" → "لي"
  new RegExp(`(?<=^|[^${PLAIN}]|ا)(م)(ل)(?=$|[^${PLAIN}])`, 'g'), // "امل" → "الم"
];
export function repairPdfArabic(text: string): string {
  if (!/[ﭐ-﷿ﹰ-﻿]/.test(text)) return text; // not PDF-style text: nothing to repair
  return SWAPPED.reduce((t, re) => t.replace(re, '$2$1'), text).normalize('NFKC');
}

// ---------------------------------------------------------------------------
// 2. The list in memory
// ---------------------------------------------------------------------------

export type CrNamesInfo = { quarter: string; as_of: string; companies: number; ambiguous: number };
// Sorted fingerprints, with each one's unified number (0 = shared by two or more companies) and city.
export type CrNames = { info: CrNamesInfo; fingerprints: Float64Array; unified: Float64Array; city: Uint16Array; cities: string[] };

export function parseCrNamesFile(text: string): CrNames {
  const lines = text.split('\n');
  const head = JSON.parse(lines[0].replace(/^#\s*/, '')) as CrNamesInfo & { cities: string[] };
  const rows: [number, number, number][] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const [fp, uni, city] = lines[i].split(',');
    rows.push([parseInt(fp, 16), Number(uni), Number(city)]);
  }
  rows.sort((a, b) => a[0] - b[0]);
  return {
    info: { quarter: head.quarter, as_of: head.as_of, companies: head.companies, ambiguous: head.ambiguous },
    fingerprints: Float64Array.from(rows, (r) => r[0]),
    unified: Float64Array.from(rows, (r) => r[1]),
    city: Uint16Array.from(rows, (r) => r[2]),
    cities: head.cities,
  };
}

let current: CrNames | null = null;
export const getCrNames = () => current;
export const setCrNames = (names: CrNames | null) => {
  current = names;
};

// At server start: loads the file named in .env (CR_NAMES_FILE). The server still starts without it.
export async function initCrNames(path = process.env.CR_NAMES_FILE): Promise<void> {
  if (!path) {
    console.warn('CR names not loaded: CR_NAMES_FILE is not set in .env. Legal names will not be checked.');
    return;
  }
  try {
    current = parseCrNamesFile(gunzipSync(await readFile(path)).toString('utf8'));
    console.info(`Loaded ${current.info.companies.toLocaleString('en')} company name fingerprints from ${current.info.quarter}.`);
  } catch (error) {
    current = null;
    console.warn(`CR names not loaded from ${path}: ${(error as Error).message}. Legal names will not be checked.`);
  }
}

export type NameCheck =
  | { result: 'match'; unified: string; city: string; clean_name: string }
  | { result: 'ambiguous' | 'unknown'; clean_name: string; reason: string };

export function checkLegalName(name: string, names: CrNames | null = current): NameCheck {
  const clean_name = normalizeLegalName(name);
  if (!names) return { result: 'unknown', clean_name, reason: 'The list of company names is not loaded on the server.' };
  if (clean_name.split(' ').length < 2) return { result: 'unknown', clean_name, reason: 'Too short to identify one company.' };
  const fp = nameFingerprint(clean_name);
  let low = 0;
  let high = names.fingerprints.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (names.fingerprints[mid] === fp) {
      if (names.unified[mid] === 0) return { result: 'ambiguous', clean_name, reason: 'Two or more active companies have this name.' };
      return { result: 'match', unified: String(names.unified[mid]), city: names.cities[names.city[mid]] ?? '', clean_name };
    }
    if (names.fingerprints[mid] < fp) low = mid + 1;
    else high = mid - 1;
  }
  return { result: 'unknown', clean_name, reason: 'No active company has exactly this name.' };
}

// ---------------------------------------------------------------------------
// 3. Legal names on a company's pages
// ---------------------------------------------------------------------------

// "شركة" (or "شركه") and the words after it, up to a full stop, a comma, a bracket, a digit or a new line.
const LEGAL_NAME = /(?:^|[^\p{L}])(شرك[ةه](?:\s+[\p{L}ً-ٟـ]+){1,10})/gu;

// Every legal name written on the pages, as written. Each one is checked whole, then without its last words
// one by one (the words after a name are often "ذات مسؤولية محدودة", "تحمل سجل…"), down to two words after "شركة".
// Words that show a name is the company's own legal name: a copyright line, a CR or VAT number,
// a certificate, "registered", "a trademark of". On Aajil's homepage, "شركة منصات الطاقة للمقاولات العامة" is a
// customer in a testimonial ("الرئيس التنفيذي • شركة …"): a name with none of these words near it never counts.
export const LEGAL_CONTEXT = /©|copyright|all rights|حقوق|محفوظ|سجل\s*تجاري|السجل\s*التجاري|رقم\s*السجل|الرقم\s*الضريبي|ضريب|الرقم\s*الموحد|شهاد[ةه]|المكلف|\bVAT\b|\btax\b|\bC\.?R\.?\b|commercial\s+registration|registered|trademark|trading\s+name|علام[ةه]\s*تجاري|مملوك[ةه]|تابع[ةه]\s*ل/i;
const CONTEXT_CHARS = 150;

export function legalNamesOn(text: string, inLegalContext = false): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(LEGAL_NAME)) {
    if (inLegalContext) {
      const around = text.slice(Math.max(0, m.index! - CONTEXT_CHARS), m.index! + m[0].length + CONTEXT_CHARS).normalize('NFKC');
      if (!LEGAL_CONTEXT.test(around)) continue;
    }
    const words = m[1].split(/\s+/);
    for (let n = words.length; n >= 3; n--) found.add(words.slice(0, n).join(' '));
  }
  return [...found];
}

// The longest legal name on the pages that is exactly one active company, written in a legal context (LEGAL_CONTEXT).
// A name shared by several companies never counts.
export function findLegalNameMatch(texts: string[], names: CrNames | null = current): (NameCheck & { result: 'match'; quote: string }) | null {
  for (const text of texts.flatMap((t) => [t, repairPdfArabic(t)])) {
    for (const candidate of legalNamesOn(text, true)) {
      const check = checkLegalName(candidate, names);
      if (check.result === 'match') return { ...check, quote: candidate };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 4. The quarterly preparation step (run locally)
// ---------------------------------------------------------------------------

// One CSV line into its cells (names can contain commas inside quotes).
export function csvCells(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') (cell += '"'), i++;
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) cells.push(cell), (cell = '');
    else cell += ch;
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

// Columns of the Ministry's file: 0 unified number, 1 CR number, 2 CR name, 3 CR type, 4 legal form, 5 legal form
// detail, 6 capital, 7 region, 8 city, 9 date. Only companies ("شركة"), main registrations, are kept, as fingerprints.
export async function prepareCrNamesFile(csvPaths: string[], outPath: string, details: { quarter: string; as_of: string }) {
  const byFp = new Map<number, { unified: string; city: number }>();
  const cities: string[] = [];
  const cityIndex = new Map<string, number>();
  let rows = 0;
  let skipped = 0;
  for (const csvPath of csvPaths) {
    const lines = createInterface({ input: createReadStream(csvPath, 'utf8'), crlfDelay: Infinity });
    let first = true;
    for await (const line of lines) {
      if (first) {
        first = false;
        continue;
      }
      const c = csvCells(line);
      const unified = readCrNumber(c[0]);
      // Main registrations only: a branch has its own unified number but always its company's
      // name, so counting it made Bayut's name ("شركة بيوت ويب السعودية…", main 7015474393, branch 7041626651)
      // look shared by two companies.
      if (unified.type !== 'unified' || normalizeArabic(c[4] ?? '') !== 'شركه' || normalizeArabic(c[3] ?? '') !== 'رييسي' || !c[2]) {
        skipped++;
        continue;
      }
      const clean = normalizeLegalName(c[2]);
      if (clean.split(' ').length < 2) {
        skipped++;
        continue;
      }
      rows++;
      const city = normalizeArabic(c[8] ?? '').replace(/\s+/g, ' ').trim();
      if (!cityIndex.has(city)) cityIndex.set(city, cities.push(city) - 1);
      const fp = nameFingerprint(clean);
      const before = byFp.get(fp);
      // The same name for two different companies: shared, never counts.
      if (before && before.unified !== unified.number) before.unified = '0';
      else if (!before) byFp.set(fp, { unified: unified.number, city: cityIndex.get(city)! });
    }
  }
  const ambiguous = [...byFp.values()].filter((v) => v.unified === '0').length;
  const gzip = createGzip();
  const out = createWriteStream(outPath);
  gzip.pipe(out);
  gzip.write(`# ${JSON.stringify({ ...details, companies: byFp.size, ambiguous, cities })}\n`);
  for (const [fp, v] of byFp) gzip.write(`${fp.toString(16)},${v.unified},${v.city}\n`);
  gzip.end();
  await finished(out);
  return { rows, names: byFp.size, ambiguous, skipped };
}
