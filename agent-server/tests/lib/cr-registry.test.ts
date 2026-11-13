// Tests for the CR check (Task 3, TC-3.2 to TC-3.8). They use a small made-up CSV file in the Ministry's
// format, never the real list, and no network or database.
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { checkCr, loadCrRegistry, prepareCrNumbersFile, readCrNumber, type CrRegistry } from '../../src/mastra/lib/cr-registry';

// Made-up numbers in the Ministry's format: unified number, old CR number, then the other columns.
const SAMPLE_CSV = [
  '"الرقم الموحد","رقم السجل","اسم السجل","نوع السجل","الكيان القانوني","الكيان القانوني.1","رأس المال","المنطقة","المدينة","تاريخ انشاء السجل"',
  '"7012345678","1010123456","شركة مثال للتقنية","رئيسي","شركة","شركة ذات مسؤولية محدودة","10000.00"," الرياض","الرياض","2024-03-28 01:58:14.824"',
  '7098765432,,"مؤسسة مثال","رئيسي","مؤسسة","مؤسسة","0"," جدة","جدة","2026-09-09 22:37:21.903"',
  '1010999999,1010999999,"مؤسسة بلا رقم موحد بعد","رئيسي","مؤسسة","مؤسسة","0"," الدمام","الدمام","2015-04-30 00:00:00.000"',
  'the rest of a name broken over two lines","x"',
].join('\n');

let registry: CrRegistry;
let report: Awaited<ReturnType<typeof prepareCrNumbersFile>>;

beforeAll(async () => {
  const folder = await mkdtemp(join(tmpdir(), 'darb-cr-'));
  const csv = join(folder, 'sample.csv');
  const out = join(folder, 'numbers.txt.gz');
  await writeFile(csv, SAMPLE_CSV, 'utf8');
  report = await prepareCrNumbersFile([csv], out, { quarter: '2026 Q3', as_of: '2026-09-30' });
  registry = await loadCrRegistry(out);
});

describe('the preparation step', () => {
  it('keeps only the numbers, and skips lines that are not registrations', () => {
    expect(report).toEqual({ rows: 3, unified: 2, old: 2, skipped_lines: 1 });
    expect(registry.info).toEqual({ quarter: '2026 Q3', as_of: '2026-09-30', unified_count: 2, old_count: 2 });
  });
});

describe('reading a number', () => {
  it('tells unified, old, VAT, empty and invalid numbers apart', () => {
    expect(readCrNumber('7012345678').type).toBe('unified');
    expect(readCrNumber('1010123456').type).toBe('old');
    expect(readCrNumber('300123456700003').type).toBe('vat');
    expect(readCrNumber('   ').type).toBe('empty');
    expect(readCrNumber('70123').type).toBe('invalid');
    expect(readCrNumber('CR7012345678').type).toBe('invalid');
  });
});

describe('the CR check (test plan TC-3.2 to TC-3.8)', () => {
  it('TC-3.2: the number exactly as in the file → match', () => {
    expect(checkCr('7012345678', registry)).toMatchObject({ result: 'match', number_type: 'unified' });
  });

  it('TC-3.3: with spaces → match', () => {
    expect(checkCr('70 1234 5678', registry)).toMatchObject({ result: 'match', number_checked: '7012345678' });
  });

  it('TC-3.4: with dashes → match', () => {
    expect(checkCr('701-234-5678', registry).result).toBe('match');
  });

  it('TC-3.5: in Arabic digits → match', () => {
    expect(checkCr('٧٠١٢٣٤٥٦٧٨', registry)).toMatchObject({ result: 'match', number_checked: '7012345678' });
    expect(checkCr('۷۰۱۲۳۴۵۶۷۸', registry).result).toBe('match'); // Persian-style digits too
  });

  it('TC-3.6: a number not in the file → unknown, never fail', () => {
    const answer = checkCr('7999999999', registry);
    expect(answer).toMatchObject({ result: 'unknown', number_type: 'unified' });
    expect(answer.reason).toContain('does not mean the company is not real');
  });

  it('TC-3.7: an old-format number → match when the file has it, unknown otherwise, no error', () => {
    expect(checkCr('1010123456', registry)).toMatchObject({ result: 'match', number_type: 'old' });
    expect(checkCr('1010999999', registry)).toMatchObject({ result: 'match', number_type: 'old' }); // no unified number yet
    expect(checkCr('1010000000', registry)).toMatchObject({ result: 'unknown', number_type: 'old' });
  });

  it('TC-3.8: empty input and a 15-digit VAT number → unknown, no error, no false match', () => {
    expect(checkCr('', registry)).toMatchObject({ result: 'unknown', number_type: 'empty' });
    expect(checkCr(undefined, registry)).toMatchObject({ result: 'unknown', number_type: 'empty' });
    expect(checkCr('300123456700003', registry)).toMatchObject({ result: 'unknown', number_type: 'vat' });
  });

  it('says which list was used', () => {
    expect(checkCr('7012345678', registry).list).toEqual(registry.info);
  });

  it('answers unknown when the list is not loaded on the server', () => {
    expect(checkCr('7012345678', null)).toMatchObject({ result: 'unknown', list: null });
  });
});
