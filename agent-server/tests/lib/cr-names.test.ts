// Tests for the legal-name check (Task 8, Hala 14 Nov 2026): Arabic cleaning, fingerprints, shared names, finding a
// legal name on a page. A tiny list made here: no Ministry file needed.
import { describe, expect, it } from 'vitest';
import { checkLegalName, csvCells, repairPdfArabic, findLegalNameMatch, legalNamesOn, nameFingerprint, normalizeLegalName, parseCrNamesFile } from '../../src/mastra/lib/cr-names';

const fp = (name: string) => nameFingerprint(normalizeLegalName(name)).toString(16);
const LIST = parseCrNamesFile(
  [
    `# ${JSON.stringify({ quarter: '2026 Q3', as_of: '2026-09-30', companies: 3, ambiguous: 1, cities: ['جده', 'الرياض'] })}`,
    `${fp('شركة النوادي التفاعلية لتقنية المعلومات')},7007504611,0`,
    `${fp('شركة دينار إنفستمنت')},7025808135,1`,
    `${fp('شركة الحلول الذكية')},0,1`, // shared by two companies
  ].join('\n'),
);

describe('cleaning Arabic names', () => {
  it('treats the usual spelling differences as the same name', () => {
    const clean = normalizeLegalName('شركة النوادي التفاعلية لتقنية المعلومات');
    for (const written of [
      'شركه النوادي التفاعليه لتقنيه المعلومات', // ة written as ه
      'شركـة النَّوادي التفاعلِيّة لتقنية المعلومات', // tatweel and diacritics
      'شركة النوادي التفاعلية لتقنية المعلومات ذات مسؤولية محدودة', // legal form added
      'شركة النوادي التفاعلية لتقنية المعلومات (ش.م.م)',
      '‏شركة  النوادي   التفاعلية لتقنية المعلومات.',
    ])
      expect(normalizeLegalName(written)).toBe(clean);
    expect(normalizeLegalName('شركة أحمد إبراهيم آل سعيد')).toBe(normalizeLegalName('شركه احمد ابراهيم ال سعيد'));
    expect(normalizeLegalName('مستشفى الهدى')).toBe(normalizeLegalName('مستشفي الهدي')); // ى and ي
  });

  it('reads names with commas inside quotes from the Ministry file', () => {
    expect(csvCells('7001,1001,"شركة أ، ب",رئيسي,شركة')).toEqual(['7001', '1001', 'شركة أ، ب', 'رئيسي', 'شركة']);
  });
});

describe('checking a legal name', () => {
  it('an exact match gives the unified number and the city', () => {
    expect(checkLegalName('شركه النوادي التفاعليه لتقنيه المعلومات', LIST)).toMatchObject({ result: 'match', unified: '7007504611', city: 'جده' });
  });

  it('a name shared by two companies never counts', () => {
    expect(checkLegalName('شركة الحلول الذكية', LIST).result).toBe('ambiguous');
  });

  it('a part of a name, or a name too short, never counts', () => {
    expect(checkLegalName('شركة النوادي التفاعلية', LIST).result).toBe('unknown');
    expect(checkLegalName('شركة النوادي', LIST).result).toBe('unknown');
  });

  it('the list holds no names, only fingerprints', () => {
    expect(JSON.stringify(LIST)).not.toContain('النوادي');
  });
});

describe('finding a legal name on a page', () => {
  it('finds it in the VAT certificate, with the words after it cut away', () => {
    const page = 'تشهد الهيئة بأن المكلف : شركه النوادي التفاعليه لتقنيه المعلومات مسجل في ضريبة القيمة المضافة';
    expect(legalNamesOn(page)).toContain('شركه النوادي التفاعليه لتقنيه المعلومات');
    expect(findLegalNameMatch([page], LIST)).toMatchObject({ unified: '7007504611', quote: 'شركه النوادي التفاعليه لتقنيه المعلومات' });
  });

  it('finds it in a footer next to the CR words', () => {
    expect(findLegalNameMatch(['جميع الحقوق محفوظة © 2026 شركة دينار إنفستمنت تحمل سجل تجاري رقم'], LIST)).toMatchObject({ unified: '7025808135' });
  });

  it('a page without a legal name: no match', () => {
    expect(findLegalNameMatch(['1pass gyms in Riyadh'], LIST)).toBeNull();
  });
});

describe('Arabic read out of a PDF (1pass’s VAT certificate, as Tavily read it)', () => {
  const PDF = 'رشﻛﻪ اﻟﻨﻮادي اﻟﺘﻔﺎﻋﻠﻴﻪ ﻟﺘﻘﻨﻴﻪ املﻌﻠﻮﻣﺎت ﺗﺸﻬﺪ اﻟﻬﻴﺌﺔ اﻟﻌﺎﻣﺔ ﻟﻠﺰﻛﺎة واﻟﺪﺧﻞ ﺑﺄن املﻜﻠﻒ : ﻣﺴﺠﻞ يف رضﻳﺒﺔ اﻟﻘﻴﻤﺔ املﻀﺎﻓﺔ ، وﺗﺤﻤﻞ اﻟﺮﻗﻢ اﻟرضﻳﺒﻲ : ٣٠٢٠٠٤٧٣٠٥٠٠٠٠٣';

  it('repairs the letter shapes and the swapped letters', () => {
    const repaired = repairPdfArabic(PDF);
    expect(repaired).toContain('شركه النوادي التفاعليه لتقنيه المعلومات');
    expect(repaired).toContain('في ضريبة');
    expect(repaired).toContain('الرقم الضريبي');
  });

  it('finds the legal name in the PDF text', () => {
    expect(findLegalNameMatch([PDF], LIST)).toMatchObject({ unified: '7007504611' });
  });
});
