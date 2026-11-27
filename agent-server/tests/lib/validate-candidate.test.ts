// Tests for Task 8, the four validity checks and the evidence status. Fake pages, a fake AI and a fake reader:
// no Tavily, no OpenAI, no database. The real cases (8-A to 8-L) are run in Studio and compared with the team's labels.
import { describe, expect, it, vi } from 'vitest';
import {
  aiSignals,
  askEachPage,
  arabicPage,
  codeSignals,
  decide,
  findCrNumbers,
  findVatNumbers,
  activeSignals,
  copyrightYear,
  dateInLink,
  isWithin12Months,
  quoteHasItsYear,
  validateCompanies,
  appLinkOn,
  FOUNDED,
  addressCitiesOn,
  isoDate,
  newsAboutCompany,
  sellerIsTheCompany,
  isAddressPart,
  type AiAnswer,
  type ReadPages,
} from '../../src/mastra/lib/validate-candidate';
import { nameFingerprint, normalizeLegalName, parseCrNamesFile } from '../../src/mastra/lib/cr-names';

const ONE_PASS_PDF = 'رشﻛﻪ اﻟﻨﻮادي اﻟﺘﻔﺎﻋﻠﻴﻪ ﻟﺘﻘﻨﻴﻪ املﻌﻠﻮﻣﺎت ﺗﺸﻬﺪ اﻟﻬﻴﺌﺔ ﺑﺄن املﻜﻠﻒ : ﻣﺴﺠﻞ يف رضﻳﺒﺔ اﻟﻘﻴﻤﺔ املﻀﺎﻓﺔ ، وﺗﺤﻤﻞ اﻟﺮﻗﻢ اﻟرضﻳﺒﻲ : ٣٠٢٠٠٤٧٣٠٥٠٠٠٠٣ اﻟﺤﻲ : اﻟﺰﻫﺮاء املﺪﻳﻨﺔ : ﺟﺪة';

const NOW = new Date('2026-11-14T09:00:00Z');
const none: AiAnswer = { offering: [], blocking: [], dated: [], saudi_address: [] };

const DINAR_FOOTER = 'دينار إنفستمنت هي شركة مساهمة مغلقة تحمل سجل تجاري رقم (1010742917) ورقم موحد (7025808135) ومرخص';

describe('numbers next to their words', () => {
  it('finds CR and unified numbers only next to CR words', () => {
    expect(findCrNumbers(DINAR_FOOTER).map((c) => c.number)).toEqual(['1010742917', '7025808135']);
    expect(findCrNumbers('C.R. No: ٧٠٣٨٧١٢٠١٩').map((c) => c.number)).toEqual(['7038712019']);
  });

  it('never takes a random 10-digit number (like an App Store id) as a CR', () => {
    expect(findCrNumbers('https://apps.apple.com/sa/app/1pass/id1261918868 call 1261918868')).toEqual([]);
  });

  it('finds a Saudi VAT number (15 digits, 3…3) next to VAT words', () => {
    expect(findVatNumbers('الرقم الضريبي: 300123456700003').map((v) => v.number)).toEqual(['300123456700003']);
    expect(findVatNumbers('VAT 123')).toEqual([]);
  });
});

describe('signals found by code', () => {
  const page = (text: string) => [{ url: 'https://1pass.app', text }];

  it('finds the name, a company email, +966, SAR prices, a Saudi city, the Saudi App Store and Arabic text', () => {
    const text = '1pass – contact info@1pass.app or +966 55 123 4567. Plans from 99 SAR. Gyms in Riyadh. https://apps.apple.com/sa/app/1pass/id1 الصالات الرياضية في الرياض واشتراك واحد لجميع النوادي';
    const signals = codeSignals({ name: '1pass' }, page(text), '1pass.app').map((s) => `${s.check}:${s.signal}`);
    expect(signals).toEqual(
      expect.arrayContaining([
        'real_entity:working channel',
        'real_entity:name on its own page',
        'real_entity:company email',
        'real_entity:Saudi phone number',
        'saudi_reach:Saudi phone number (+966)',
        'saudi_reach:prices in SAR',
        'saudi_reach:Saudi city mentioned',
        'saudi_reach:Saudi App Store listing',
        'saudi_reach:Arabic site',
      ]),
    );
  });

  it('a startup from Darb’s list counts as a Saudi ecosystem listing, and .sa is a strong signal', () => {
    const signals = codeSignals({ name: 'Aajil', startup_id: 'ST_291' }, page('Aajil'), 'aajil.sa').filter((s) => s.check === 'saudi_reach').map((s) => s.signal);
    expect(signals).toEqual(['listed in a Saudi ecosystem directory (EcosystemSA, Darb list)', '.sa domain']);
  });

  it('an email on another domain (gmail) is not a company email', () => {
    const signals = codeSignals({ name: 'X' }, page('X: x.company@gmail.com'), 'x.com').map((s) => s.signal);
    expect(signals).not.toContain('company email');
  });
});

describe('signals found by the AI', () => {
  const pages = [{ url: 'https://1pass.app', text: 'Subscribe now. Plans & Pricing. Blog: ١٩ يناير ٢٠٢٦ قوة الإرادة. Copyright © 2025 Interactive Gyms Company.' }];

  it('keeps only quotes that are really on the page', () => {
    const answer: AiAnswer = { ...none, offering: [{ signal: 'pricing', quote: 'Plans & Pricing', page: 1 }, { signal: 'customers or reviews', quote: '10,000 happy users', page: 1 }] };
    expect(aiSignals(answer, pages, NOW).map((s) => s.signal)).toEqual(['pricing']);
  });

  it('a date within 12 months counts for Active; a copyright year never does', () => {
    const answer: AiAnswer = { ...none, dated: [{ date: '2026-01-19', quote: '١٩ يناير ٢٠٢٦', page: 1 }, { date: '2025-01', quote: 'Copyright © 2025', page: 1 }] };
    const dated = aiSignals(answer, pages, NOW).filter((s) => s.check === 'active');
    expect(dated.map((s) => s.kind)).toEqual(['positive']);
  });

  it('a date the AI made up (the quote shows no year) is dropped', () => {
    expect(quoteHasItsYear('2026-07', 'An issue accessing the gym?')).toBe(false);
    expect(quoteHasItsYear('2026-01-19', '١٩ يناير ٢٠٢٦')).toBe(true);
    expect(quoteHasItsYear('2025-08-01', '٨ صفر ١٤٤٧هـ')).toBe(true);
    const answer: AiAnswer = { ...none, dated: [{ date: '2026-07', quote: 'Subscribe now', page: 1 }] };
    expect(aiSignals(answer, pages, NOW)).toEqual([]);
  });

  it('measures 12 months from today', () => {
    expect(isWithin12Months('2026-01-19', NOW)).toBe(true);
    expect(isWithin12Months('2025-10-01', NOW)).toBe(false);
    expect(isWithin12Months('2026-11', NOW)).toBe(true);
  });
});

describe('the four checks and the evidence status (Hala’s rules)', () => {
  const s = (check: string, kind: string, signal = kind) => ({ check, kind, signal, quote: 'q', url: 'u', by: 'code' }) as never;
  const valid = [
    s('real_entity', 'channel'), s('real_entity', 'name'), s('real_entity', 'identity', 'company email'),
    s('real_offering', 'positive'), s('active', 'positive'), s('saudi_reach', 'strong', '.sa domain'),
  ];

  it('all four pass without a CR match → Likely', () => {
    expect(decide(valid, true, null)).toMatchObject({ real_entity: 'pass', real_offering: 'pass', active: 'pass', saudi_reach: 'pass', evidence_status: 'likely' });
  });

  it('all four pass with a matching CR → Confirmed (the only way to Confirmed)', () => {
    expect(decide(valid, true, { result: 'match' } as never).evidence_status).toBe('confirmed');
  });

  it('"coming soon" fails Real offering → Unconfirmed', () => {
    const out = decide([...valid, s('real_offering', 'blocking', 'coming soon or waitlist')], true, null);
    expect(out).toMatchObject({ real_offering: 'fail', evidence_status: 'unconfirmed' });
  });

  it('closed, or only content older than 12 months, fails Active → Unconfirmed', () => {
    const noRecent = valid.filter((x: { check: string }) => x.check !== 'active');
    expect(decide([...noRecent, s('active', 'blocking', 'closed or discontinued')], true, null).active).toBe('fail');
    expect(decide([...noRecent, s('active', 'blocking', 'dated content (2024-05)')], true, null).active).toBe('fail');
  });

  it('no Saudi signal fails Saudi reach; two weak signals pass it', () => {
    const noSaudi = valid.filter((x: { check: string }) => x.check !== 'saudi_reach');
    expect(decide(noSaudi, true, null)).toMatchObject({ saudi_reach: 'fail', evidence_status: 'unconfirmed' });
    expect(decide([...noSaudi, s('saudi_reach', 'weak', 'Arabic site'), s('saudi_reach', 'weak', 'Saudi city mentioned')], true, null).saudi_reach).toBe('pass');
  });

  it('the name missing from its own page fails Real entity', () => {
    const noName = valid.filter((x: { kind: string }) => x.kind !== 'name');
    expect(decide(noName, true, null).real_entity).toBe('fail');
  });

  it('nothing read → every check unknown → Unconfirmed, never shown', () => {
    expect(decide([], false, null)).toMatchObject({ real_entity: 'unknown', active: 'unknown', saudi_reach: 'unknown', evidence_status: 'unconfirmed' });
  });
});

describe('Active: app updates, news dates and the copyright year', () => {
  const s = (check: string, kind: string, signal = kind) => ({ check, kind, signal, quote: 'q', url: 'u', by: 'code' }) as never;
  const others = [s('real_entity', 'channel'), s('real_entity', 'name'), s('real_entity', 'identity', 'company email'), s('saudi_reach', 'strong', '.sa domain')];

  it('finds the newest copyright year, in English or Arabic, with Arabic digits', () => {
    expect(copyrightYear([{ url: 'u', text: '© 2024 1pass. Copyright 2026 Interactive Gyms' }])?.year).toBe(2026);
    expect(copyrightYear([{ url: 'u', text: 'جميع الحقوق محفوظة ٢٠٢٥' }])?.year).toBe(2025);
    expect(copyrightYear([{ url: 'u', text: 'Founded in 2019' }])).toBeNull();
  });

  it('a current copyright year + a working offering passes Active', () => {
    const sig = activeSignals({ name: 'X' }, [{ url: 'u', text: '© 2026 X' }], NOW);
    expect(decide([...others, s('real_offering', 'positive'), ...sig], true, null)).toMatchObject({ active: 'pass', evidence_status: 'likely' });
  });

  it('a current copyright year alone, with no working offering, does not pass Active', () => {
    const sig = activeSignals({ name: 'X' }, [{ url: 'u', text: '© 2026 X' }], NOW);
    expect(decide([...others, ...sig], true, null).active).toBe('unknown');
  });

  it('an old copyright year (2021) with nothing newer fails Active', () => {
    const sig = activeSignals({ name: 'X' }, [{ url: 'u', text: '© 2021 X' }], NOW);
    expect(decide([...others, s('real_offering', 'positive'), ...sig], true, null).active).toBe('fail');
  });

  it('a recent news article naming the company passes Active; one about another company does not count', () => {
    const news = [
      { url: 'https://menabytes.com/2026/09/1pass-expands', title: '1pass expands to Dammam', published_date: null },
      { url: 'https://wamda.com/2026/10/other', title: 'Jahez raises funds', published_date: '2026-10-01' },
    ];
    const sig = activeSignals({ name: '1pass', news }, [], NOW);
    expect(sig.map((x) => `${x.signal}:${x.kind}`)).toEqual(['news article (2026-09):positive']);
  });

  it('reads a date in a news link', () => {
    expect(dateInLink('https://argaam.com/ar/article/2025/10/12/x')).toBe('2025-10-12');
    expect(dateInLink('https://site.com/news/x')).toBeNull();
  });
});

describe('the whole step', () => {
  const reader = (pages: Record<string, string>): ReadPages & { asked: string[][] } => {
    const asked: string[][] = [];
    const fn = async (urls: string[]) => {
      asked.push(urls);
      const clean = (u: string) => u.replace(/^https?:\/\/(www\.)?/, 'https://').replace(/\/$/, '');
      return {
        pages: urls.filter((u) => pages[clean(u)] !== undefined).map((u) => ({ url: clean(u), text: pages[clean(u)], about_url: null, about_text: null })),
        failed: urls.filter((u) => pages[clean(u)] === undefined).map((u) => ({ url: clean(u) })),
        tavily_calls: 1,
      };
    };
    return Object.assign(fn, { asked });
  };
  const ai = (answer: AiAnswer) => vi.fn(async () => answer);
  const goodAi: AiAnswer = { ...none, offering: [{ signal: 'sign up, download or order', quote: 'استثمر الآن', page: 1 }], dated: [{ date: '2026-09-01', quote: 'سبتمبر 2026', page: 1 }] };

  it('reads the homepage and the Arabic page in one batch, finds the CR there, and Confirms (Dinar)', async () => {
    const read = reader({ 'https://dinar.sa': 'Dinar invest app', 'https://dinar.sa/ar': `دينار استثمر الآن سبتمبر 2026 ${DINAR_FOOTER}` });
    const saved: unknown[] = [];
    // The quotes are on page [2], the Arabic page.
    const dinarAi: AiAnswer = { ...none, offering: [{ signal: 'sign up, download or order', quote: 'استثمر الآن', page: 2 }], dated: [{ date: '2026-09-01', quote: 'سبتمبر 2026', page: 2 }] };
    const out = await validateCompanies(
      [{ name: 'Dinar', aliases: ['دينار'], website: 'https://www.dinar.sa', startup_id: 'ST_181' }],
      { read, askAi: ai(dinarAi), checkCr: (n) => ({ result: n === '1010742917' ? 'match' : 'unknown', number_checked: n }) as never, save: async (id, row) => void saved.push({ id, ...row }) },
      NOW,
    );
    expect(read.asked).toEqual([['https://www.dinar.sa', 'https://www.dinar.sa/ar']]);
    expect(out.results[0]).toMatchObject({ evidence_status: 'confirmed', cr: { result: 'match', number_checked: '1010742917' } });
    expect(saved).toEqual([{ id: 'ST_181', validation_status: 'pass', evidence_status: 'confirmed', validated_at: NOW.toISOString() }]);
  });

  it('a blocked site falls back to its Saudi App Store page (decision 1)', async () => {
    const read = reader({ 'https://apps.apple.com/sa/app/bayut/id1': 'Bayut عقارات استثمر الآن سبتمبر 2026' });
    const out = await validateCompanies([{ name: 'Bayut', website: 'https://www.bayut.sa', app_store_url: 'https://apps.apple.com/sa/app/bayut/id1' }], { read, askAi: ai(goodAi) }, NOW);
    expect(read.asked).toHaveLength(2);
    expect(out.results[0].pages_read).toEqual(['https://apps.apple.com/sa/app/bayut/id1']);
    expect(out.results[0].signals.map((s) => s.signal)).toContain('Saudi App Store listing');
  });

  it('a site that cannot be read, with no App Store page: Unconfirmed, saved with no status (still searched, re-checked in 90 days)', async () => {
    const save = vi.fn();
    const out = await validateCompanies([{ name: 'Bayut', website: 'https://www.bayut.sa', startup_id: 'ST_489' }], { read: reader({}), askAi: ai(none), save }, NOW);
    expect(out.results[0].evidence_status).toBe('unconfirmed');
    expect(save).toHaveBeenCalledWith('ST_489', { validation_status: null, evidence_status: null, validated_at: NOW.toISOString() });
  });

  it('reads the app page linked on the homepage, without its About page, for its last update', async () => {
    const read = reader({
      'https://gymy.sa': 'GymY gyms. Download: https://apps.apple.com/sa/app/gymy/id9 info@gymy.sa',
      'https://apps.apple.com/sa/app/gymy/id9': 'GymY app. Version 3.2 · Oct 3, 2026',
    });
    const askAi = ai({ ...none, offering: [{ signal: 'sign up, download or order', quote: 'Download:', page: 1 }], dated: [{ date: '2026-10-03', quote: 'Oct 3, 2026', page: 2 }] });
    const options: unknown[] = [];
    const tracked: ReadPages = async (urls, o) => (options.push(o), read(urls));
    const out = await validateCompanies([{ name: 'GymY', website: 'https://gymy.sa' }], { read: tracked, askAi }, NOW);
    expect(read.asked[1]).toEqual(['https://apps.apple.com/sa/app/gymy/id9']);
    expect(options[1]).toEqual({ about: false });
    expect(out.results[0]).toMatchObject({ active: 'pass', evidence_status: 'likely' });
  });

  it('does not read the app page when the reading calls are used up', async () => {
    const read = reader({ 'https://gymy.sa': 'GymY https://apps.apple.com/sa/app/gymy/id9' });
    await validateCompanies([{ name: 'GymY', website: 'https://gymy.sa' }], { read, askAi: ai(none), maxCalls: 1 }, NOW);
    expect(read.asked).toHaveLength(1);
  });

  it('a definite failure is saved as fail, so Task 9 and the search leave the startup out', async () => {
    const save = vi.fn();
    await validateCompanies(
      [{ name: 'OldCo', website: 'https://oldco.sa', startup_id: 'ST_900' }],
      { read: reader({ 'https://oldco.sa': 'OldCo has closed.' }), askAi: ai({ ...none, blocking: [{ signal: 'closed or discontinued', quote: 'OldCo has closed', page: 1 }] }), save },
      NOW,
    );
    expect(save).toHaveBeenCalledWith('ST_900', { validation_status: 'fail', evidence_status: null, validated_at: NOW.toISOString() });
  });

  it('an AI failure never makes a company look valid', async () => {
    const out = await validateCompanies([{ name: 'X', website: 'https://x.sa' }], { read: reader({ 'https://x.sa': 'X' }), askAi: async () => { throw new Error('busy'); } }, NOW);
    expect(out.results[0]).toMatchObject({ evidence_status: 'unconfirmed' });
    expect(out.results[0].notes).toContain('signal_reading_failed');
  });

  it('the same About page linked from both homepages is read by the AI once', async () => {
    const read: ReadPages = async () => ({
      pages: ['https://x.sa', 'https://x.sa/ar'].map((url) => ({ url, text: 'X', about_url: 'https://x.sa/about', about_text: 'About X' })),
      failed: [],
      tavily_calls: 1,
    });
    const askAi = ai(none);
    await validateCompanies([{ name: 'X', website: 'https://x.sa' }], { read, askAi }, NOW);
    // One page per AI call: 3 pages, so 3 calls, and the About page only once.
    expect(askAi.mock.calls).toHaveLength(3);
    expect(askAi.mock.calls.filter((c) => ((c as unknown[])[1] as { url: string }[])[0].url === 'https://x.sa/about')).toHaveLength(1);
  });

  it('the AI reads each page on its own, and the answers are put together with their own page numbers', async () => {
    const pages = [{ url: 'https://a.sa', text: 'Get started now' }, { url: 'https://a.sa/about', text: 'About us' }];
    const askAi = vi.fn(async (_n: string, p: { url: string }[]) =>
      p[0].url === 'https://a.sa'
        ? { ...none, offering: [{ signal: 'sign up, download or order' as const, quote: 'Get started now', page: 1 }], same_product: { answer: 'same' as const, quote: 'Get started now', page: 1 } }
        : { ...none, same_product: { answer: 'different' as const, quote: 'About us', page: 1 } },
    );
    const answer = await askEachPage(askAi, 'A', pages, 'a product');
    expect(answer.offering).toEqual([{ signal: 'sign up, download or order', quote: 'Get started now', page: 1 }]);
    expect(answer.same_product?.answer).toBe('same'); // "different" only when no page says "same"
  });

  it('keeps the company name the AI read only if it is really on the page (eshq.coffee)', async () => {
    const pages = [{ url: 'https://eshq.coffee/ar', text: 'متجر عشق القهوة المختصة سجل تجاري 2055127142' }];
    const askAi = vi.fn(async () => ({ ...none, name_ar: 'عشق القهوة', name_en: 'Eshq Coffee' }));
    const answer = await askEachPage(askAi, 'Coffee', pages);
    expect(answer.name_ar).toBe('عشق القهوة'); // on the page
    expect(answer.name_en).toBe(''); // not written on the page: never a guess or a transliteration
  });

  it('reads the VAT certificate behind a badge, and its legal name makes the company Confirmed', async () => {
    const names = parseCrNamesFile(
      `# ${JSON.stringify({ quarter: 'Q3', as_of: '2026-09-30', companies: 1, ambiguous: 0, cities: ['جده'] })}\n${nameFingerprint(normalizeLegalName('شركة النوادي التفاعلية لتقنية المعلومات')).toString(16)},7007504611,0`,
    );
    const read = reader({
      'https://1pass.app': '1pass gyms in Riyadh An Nahdah. Join now © 2026 [vat](https://1pass.app/files/vat_certificate.pdf) info@1pass.app',
      'https://1pass.app/files/vat_certificate.pdf': ONE_PASS_PDF, // as Tavily really read it
    });
    const askAi = ai({ ...none, offering: [{ signal: 'sign up, download or order', quote: 'Join now', page: 1 }] });
    const out = await validateCompanies([{ name: '1pass', website: 'https://1pass.app' }], { read, askAi, crNames: names }, NOW);
    expect(read.asked[1]).toEqual(['https://1pass.app/files/vat_certificate.pdf']);
    expect(out.results[0]).toMatchObject({ evidence_status: 'confirmed', cr: { matched_by: 'legal_name', number_checked: '7007504611' } });
    expect(out.results[0].signals.map((x) => x.signal)).toEqual(expect.arrayContaining(['VAT number or certificate', 'legal name matches the Ministry of Commerce list']));
  });

  it('a VAT link’s name alone is never trusted', () => {
    const signals = codeSignals({ name: 'X' }, [{ url: 'https://x.sa', text: 'X [vat](https://x.sa/vat_certificate.pdf)' }], 'x.sa').map((x) => x.signal);
    expect(signals).not.toContain('VAT number or certificate');
  });

  const ONE_NAME = () =>
    parseCrNamesFile(
      `# ${JSON.stringify({ quarter: 'Q3', as_of: '2026-09-30', companies: 1, ambiguous: 0, cities: ['جده'] })}\n${nameFingerprint(normalizeLegalName('شركة النوادي التفاعلية لتقنية المعلومات')).toString(16)},7007504611,0`,
    );

  it('a city the company only mentions (where it serves) never blocks the legal name (1pass: Jeddah, gyms in Riyadh)', async () => {
    const read = reader({ 'https://x.sa': 'X gyms in Riyadh and Dammam. © 2026 شركة النوادي التفاعلية لتقنية المعلومات' });
    const out = await validateCompanies([{ name: 'X', website: 'https://x.sa' }], { read, askAi: ai(none), crNames: ONE_NAME() }, NOW);
    expect(out.results[0].cr).toMatchObject({ matched_by: 'legal_name', number_checked: '7007504611' });
    expect(out.results[0].notes).not.toContain('legal_name_city_conflict');
  });

  it("a customer's company name in a testimonial is never the legal name (Aajil)", async () => {
    const read = reader({ 'https://aajil.sa': 'شاهد التجربة ليث مؤمني الرئيس التنفيذي • شركة النوادي التفاعلية لتقنية المعلومات [اقرأ القصة كاملة]' });
    const out = await validateCompanies([{ name: 'Aajil', website: 'https://aajil.sa' }], { read, askAi: ai(none), crNames: ONE_NAME() }, NOW);
    expect(out.results[0].cr).toBeNull();
  });

  it('a legal name whose own address is in another city is not used', async () => {
    const read = reader({ 'https://x.sa': 'X جميع الحقوق محفوظة لـ شركة النوادي التفاعلية لتقنية المعلومات. العنوان: الدمام، حي الفيصلية' });
    const out = await validateCompanies([{ name: 'X', website: 'https://x.sa' }], { read, askAi: ai(none), crNames: ONE_NAME() }, NOW);
    expect(out.results[0].cr).toBeNull();
    expect(out.results[0].notes).toContain('legal_name_city_conflict');
  });

  it('finds the head office city in the PDF certificate, as Tavily read it', () => {
    expect([...addressCitiesOn([{ url: 'https://1pass.app/vat.pdf', text: ONE_PASS_PDF }])]).toEqual(['جده']);
    expect([...addressCitiesOn([{ url: 'https://x.sa', text: 'Gyms in Riyadh, Jeddah and Dammam' }])]).toEqual([]);
  });

  it('a site that gives almost no text gets the note, and no news search outside the re-check (Aajil)', async () => {
    const read = reader({ 'https://aajil.sa/en': '# Aajil\nAajil buys your business materials. Up to SAR 4 million.' });
    const out = await validateCompanies([{ name: 'Aajil', website: 'https://aajil.sa/en' }], { read, askAi: ai(none) }, NOW);
    expect(out.results[0].notes).toContain('page_mostly_empty');
    expect(out.results[0].notes).not.toContain('news_searched');
    expect(out.tavily_calls).toBe(1);
  });

  it('in the re-check, a thin site gets one news search, and recent news about the company passes Active', async () => {
    const read = reader({ 'https://aajil.sa/en': '# Aajil\nAajil buys your business materials. Up to SAR 4 million.' });
    const findNews = vi.fn(async () => ({ news: [{ url: 'https://argaam.com/x', title: 'Aajil Capital gets CMA licence', published_date: 'Tue, 01 Sep 2026 00:00:00 GMT' }], tavily_calls: 1 }));
    const askAi = ai({ ...none, offering: [{ signal: 'pricing', quote: 'Up to SAR 4 million', page: 1 }] });
    const out = await validateCompanies([{ name: 'Aajil', website: 'https://aajil.sa/en' }], { read, askAi, findNews }, NOW);
    expect(findNews).toHaveBeenCalledTimes(1);
    expect(out.results[0].active).toBe('pass');
    expect(out.results[0].notes).toEqual(expect.arrayContaining(['page_mostly_empty', 'news_searched']));
    expect(out.tavily_calls).toBe(2);
  });

  it('a site with a recent date gets no news search', async () => {
    const read = reader({ 'https://x.sa': `X ${'word '.repeat(200)} Updated on 2026-10-01` });
    const findNews = vi.fn(async () => ({ news: [], tavily_calls: 1 }));
    const askAi = ai({ ...none, dated: [{ date: '2026-10-01', quote: 'Updated on 2026-10-01', page: 1 }] });
    await validateCompanies([{ name: 'X', website: 'https://x.sa' }], { read, askAi, findNews }, NOW);
    expect(findNews).not.toHaveBeenCalled();
  });

  it('in the re-check, a full site with no date at all also gets one news search (Aajil: its © is added by JavaScript)', async () => {
    const read = reader({ 'https://aajil.sa/en': `# Aajil\nAajil buys your business materials. Up to SAR 4 million. ${'word '.repeat(200)}` });
    const findNews = vi.fn(async () => ({ news: [{ url: 'https://argaam.com/x', title: 'Aajil Capital gets CMA licence', published_date: 'Tue, 01 Sep 2026 00:00:00 GMT' }], tavily_calls: 1 }));
    const askAi = ai({ ...none, offering: [{ signal: 'pricing', quote: 'Up to SAR 4 million', page: 1 }] });
    const out = await validateCompanies([{ name: 'Aajil', website: 'https://aajil.sa/en' }], { read, askAi, findNews }, NOW);
    expect(findNews).toHaveBeenCalledTimes(1);
    expect(out.results[0].active).toBe('pass');
    expect(out.results[0].notes).toContain('news_searched');
    expect(out.results[0].notes).not.toContain('page_mostly_empty');
  });

  it('outside the re-check (no news search given), a site with no date stays Active unknown', async () => {
    const read = reader({ 'https://aajil.sa/en': `# Aajil\nAajil buys your business materials. ${'word '.repeat(200)}` });
    const out = await validateCompanies([{ name: 'Aajil', website: 'https://aajil.sa/en' }], { read, askAi: ai(none) }, NOW);
    expect(out.results[0].active).toBe('unknown');
    expect(out.results[0].notes).not.toContain('news_searched');
  });

  it('a founding year is never dated content (Aajil: "2022 سنة التأسيس")', () => {
    const pages = [{ url: 'https://aajil.sa/about-us', text: '2022 سنة التأسيس. Founded in 2021. Blog: September 2026 update' }];
    const answer: AiAnswer = { ...none, dated: [
      { date: '2022-01', quote: '2022 سنة التأسيس', page: 1 },
      { date: '2021-01', quote: 'Founded in 2021', page: 1 },
      { date: '2026-09', quote: 'September 2026 update', page: 1 },
    ] };
    expect(aiSignals(answer, pages, NOW).map((x) => x.signal)).toEqual(['dated content (2026-09)']);
    expect(FOUNDED.test('منذ 2019')).toBe(true);
    expect(FOUNDED.test('تحديث منذ 3 أيام، نوفمبر 2026')).toBe(false);
  });

  it('with a current copyright year, an old date gives unknown, never fail; without it, fail', () => {
    const old = { check: 'active' as const, signal: 'dated content (2022-01)', kind: 'blocking' as const, quote: 'x', url: 'u', by: 'ai' as const };
    const copyright = { check: 'active' as const, signal: 'copyright year (2026)', kind: 'weak' as const, quote: '© 2026', url: 'u', by: 'code' as const };
    expect(decide([old, copyright], true, null).active).toBe('unknown');
    expect(decide([old], true, null).active).toBe('fail');
  });

  it('the App Store page’s copyright is Apple’s, never the company’s (Bayut)', () => {
    expect(copyrightYear([{ url: 'https://apps.apple.com/sa/app/bayut-ksa-real-estate/id1504036401', text: 'Copyright © 2026 Apple Inc.' }])).toBeNull();
    expect(copyrightYear([{ url: 'https://bayut.sa', text: '© 2008 - 2026 بيوت السعودية' }])?.year).toBe(2026);
  });

  it('a site that sells something else than the startup fails Real entity (Abwaab: abwaab.sa is another company)', async () => {
    const read = reader({ 'https://abwaab.sa': 'Abwaab أبواب قسط مشترياتك مع خدمة تمارا. فلوسك في أمان حتى يتم التسليم و الاستلام' });
    const askAi = ai({ ...none, offering: [{ signal: 'pricing', quote: 'قسط مشترياتك مع خدمة تمارا', page: 1 }], same_product: { answer: 'different', quote: 'فلوسك في أمان حتى يتم التسليم و الاستلام', page: 1 } });
    const description = 'An e-learning app offering video lessons for school students.';
    const out = await validateCompanies([{ name: 'Abwaab', website: 'https://abwaab.sa', startup_id: 'ST_486', description }], { read, askAi }, NOW);
    expect((askAi.mock.calls[0] as unknown[])[2]).toBe(description);
    expect(out.results[0]).toMatchObject({ real_entity: 'fail', evidence_status: 'unconfirmed' });
    expect(out.results[0].reasons.real_entity).toContain('another business');
    expect(out.results[0].notes).toContain('different_company');
  });

  it('"same" or "unclear" never fails, and a made-up "different" quote is dropped', () => {
    const pages = [{ url: 'https://x.sa', text: 'X video lessons for students' }];
    expect(aiSignals({ ...none, same_product: { answer: 'same', quote: 'video lessons', page: 1 } }, pages, NOW)).toEqual([]);
    expect(aiSignals({ ...none, same_product: { answer: 'different', quote: 'we sell cars', page: 1 } }, pages, NOW)).toEqual([]);
  });

  it('a Saudi address needs a city, district, street, building or postal code (not a name, not "in Saudi Arabia")', () => {
    const pages = [{ url: 'https://x.sa', text: 'شركة موقع ابواب. نعمل في السعودية. حي الزهراء، جدة 23521' }];
    const answer: AiAnswer = { ...none, saudi_address: [{ quote: 'شركة موقع ابواب', page: 1 }, { quote: 'نعمل في السعودية', page: 1 }, { quote: 'حي الزهراء، جدة 23521', page: 1 }] };
    expect(aiSignals(answer, pages, NOW).filter((x) => x.check === 'saudi_reach').map((x) => x.quote)).toEqual(['حي الزهراء، جدة 23521']);
  });

  it('a real quote under the wrong page number is kept, with the page it is really on', () => {
    const pages = [{ url: 'https://x.sa', text: 'spam' }, { url: 'https://x.sa/ar', text: 'منصة لبيع السلع المستعملة' }];
    const out = aiSignals({ ...none, same_product: { answer: 'different', quote: 'منصة لبيع السلع المستعملة', page: 1 } }, pages, NOW);
    expect(out).toMatchObject([{ signal: 'a different company or product', url: 'https://x.sa/ar' }]);
  });

  it('the homepage HTML gives the footer Tavily left out: Dinar Confirmed by its CR number', async () => {
    const read = reader({ 'https://dinar.sa': 'Dinar invest app. استثمر الآن' });
    const readRaw = async (url: string) => ({ status: 'ok' as const, url, text: `Dinar ${DINAR_FOOTER}` });
    const askAi = ai({ ...none, offering: [{ signal: 'sign up, download or order', quote: 'استثمر الآن', page: 1 }], dated: [{ date: '2026-09-01', quote: 'Dinar invest app. استثمر الآن', page: 1 }] });
    const out = await validateCompanies([{ name: 'Dinar', website: 'https://www.dinar.sa' }], { read, askAi, readRaw, checkCr: (n) => ({ result: 'match', number_checked: n }) as never }, NOW);
    expect(out.results[0].cr).toMatchObject({ matched_by: 'number', number_checked: '1010742917' });
    expect((askAi.mock.calls[0] as unknown[])[1]).toHaveLength(1); // the HTML is never sent to the AI
  });

  it('a site that is down, with no recent app or news, fails Active (Shgardi)', async () => {
    const read = reader({});
    const readRaw = async (url: string) => ({ status: 'down' as const, url, reason: 'HTTP 530' });
    const out = await validateCompanies([{ name: 'Shgardi', website: 'https://shgardi.app' }], { read, askAi: ai(none), readRaw }, NOW);
    expect(out.results[0]).toMatchObject({ active: 'fail', evidence_status: 'unconfirmed' });
    expect(out.results[0].reasons.active).toContain('website no longer works (HTTP 530)');
    expect(out.results[0].notes).toContain('site_down');
  });

  it('a site that did not answer in time is not "down": Active stays unknown and nothing is saved (Dinar)', async () => {
    const save = vi.fn();
    const readRaw = async (url: string) => ({ status: 'down' as const, url, reason: 'no answer' });
    const out = await validateCompanies([{ name: 'Dinar', website: 'https://www.dinar.sa', startup_id: 'ST_181' }], { read: reader({}), askAi: ai(none), readRaw, save }, NOW);
    expect(out.results[0]).toMatchObject({ active: 'unknown', evidence_status: 'unconfirmed' });
    expect(out.results[0].reasons.active).toContain('did not answer this time');
    expect(out.results[0].notes).toContain('site_not_answering');
    expect(out.results[0].notes).not.toContain('site_down');
    expect(out.results[0].signals.some((s) => s.signal.startsWith('website no longer works'))).toBe(false);
    expect(save).not.toHaveBeenCalled();
    // "Connection refused" is the same: the server refused at that moment (Larat, D5).
    const refused = async (url: string) => ({ status: 'down' as const, url, reason: 'connection refused' });
    const out3 = await validateCompanies([{ name: 'Larat', website: 'https://larat.sa', startup_id: 'ST_1' }], { read: reader({}), askAi: ai(none), readRaw: refused, save }, NOW);
    expect(out3.results[0]).toMatchObject({ active: 'unknown', notes: ['site_not_answering'] });
    expect(save).not.toHaveBeenCalled();
    // A domain that no longer exists still fails, and is saved.
    const gone = async (url: string) => ({ status: 'down' as const, url, reason: 'domain not found' });
    const out2 = await validateCompanies([{ name: 'Dinar', website: 'https://www.dinar.sa', startup_id: 'ST_181' }], { read: reader({}), askAi: ai(none), readRaw: gone, save }, NOW);
    expect(out2.results[0].active).toBe('fail');
    expect(save).toHaveBeenCalledWith('ST_181', expect.objectContaining({ validation_status: 'fail' }));
  });

  // Darb reads the company's own pages itself first: the same page gives the same result every run.
  const FULL = (extra: string) => `${'Gyms in Riyadh. '.repeat(40)} ${extra}`;
  const direct = (pages: Record<string, string>) => {
    const asked: string[] = [];
    const fn = async (url: string) => {
      asked.push(url);
      const text = pages[url];
      return text === undefined ? { status: 'skipped' as const, url, reason: 'HTTP 404' } : { status: 'ok' as const, url, text };
    };
    return Object.assign(fn, { asked });
  };

  it('a page read directly is not sent to Tavily, and a missing page (404) is not either', async () => {
    const read = reader({});
    const readRaw = direct({ 'https://1pass.app': FULL('1pass') });
    const out = await validateCompanies([{ name: '1pass', website: 'https://1pass.app' }], { read, askAi: ai(none), readRaw }, NOW);
    expect(read.asked).toEqual([]);
    expect(out.tavily_calls).toBe(0);
    expect(out.results[0].pages_read).toContain('https://1pass.app');
  });

  it('a page too thin to use (a JavaScript site) is read by Tavily instead', async () => {
    const read = reader({ 'https://aajil.sa/en': FULL('Aajil') });
    const readRaw = direct({ 'https://aajil.sa/en': 'Aajil', 'https://aajil.sa/ar': FULL('عاجل') });
    const out = await validateCompanies([{ name: 'Aajil', website: 'https://aajil.sa/en' }], { read, askAi: ai(none), readRaw }, NOW);
    expect(read.asked).toEqual([['https://aajil.sa/en']]);
    expect(out.tavily_calls).toBe(1);
  });

  it('the About page linked on a page read directly is read directly too', async () => {
    const read = reader({});
    const readRaw = direct({ 'https://1pass.app': FULL('1pass [About us](https://1pass.app/about-us)'), 'https://1pass.app/about-us': FULL('info@1pass.app') });
    const out = await validateCompanies([{ name: '1pass', website: 'https://1pass.app' }], { read, askAi: ai(none), readRaw }, NOW);
    expect(readRaw.asked).toContain('https://1pass.app/about-us');
    expect(out.results[0].pages_read).toContain('https://1pass.app/about-us');
  });

  it('a linked VAT certificate is read directly, without Tavily (1pass)', async () => {
    const read = reader({});
    const cert = 'https://1pass.app/media/vat_certificate.pdf';
    const readRaw = direct({ 'https://1pass.app': FULL(`1pass [VAT](${cert})`), [cert]: 'وتحمل الرقم الضريبي : ٣٠٢٠٠٤٧٣٠٥٠٠٠٠٣ عنوان المركز الرئيسي' });
    const out = await validateCompanies([{ name: '1pass', website: 'https://1pass.app' }], { read, askAi: ai(none), readRaw }, NOW);
    expect(read.asked).toEqual([]);
    expect(out.results[0].signals.some((x) => x.signal === 'VAT number or certificate' && x.url === cert)).toBe(true);
  });

  it('a certificate that cannot be read directly is read by Tavily', async () => {
    const cert = 'https://1pass.app/media/vat_certificate.pdf';
    const read = reader({ [cert]: 'وتحمل الرقم الضريبي : ٣٠٢٠٠٤٧٣٠٥٠٠٠٠٣' });
    const readRaw = direct({ 'https://1pass.app': FULL(`1pass [VAT](${cert})`) });
    await validateCompanies([{ name: '1pass', website: 'https://1pass.app' }], { read, askAi: ai(none), readRaw }, NOW);
    expect(read.asked).toEqual([[cert]]);
  });

  it('with the app facts from the store, the app page is not read by Tavily when the site was read', async () => {
    const read = reader({});
    const readRaw = direct({ 'https://1pass.app': FULL('1pass') });
    const appFacts = async (url: string) => ({ store: 'App Store' as const, listed: true, updated: '2026-11-08', quote: '1Pass version 5.22, released 2026-11-08', url });
    const out = await validateCompanies([{ name: '1pass', website: 'https://1pass.app', app_store_url: 'https://apps.apple.com/sa/app/1pass/id1261918868' }], { read, askAi: ai(none), readRaw, appFacts }, NOW);
    expect(read.asked).toEqual([]);
    expect(out.results[0].active).toBe('pass');
  });

  it('a city alone is not an address (1pass: "Jeddah, Saudi Arabia"; 525K: "Riyadh, KSA")', () => {
    const pages = [{ url: 'https://x.sa', text: 'While our main hub is in Jeddah, Saudi Arabia. Riyadh, KSA. 3385 Al Thumamah Road Riyadh 13317 Saudi Arabia' }];
    const answer: AiAnswer = { ...none, saudi_address: [{ quote: 'While our main hub is in Jeddah, Saudi Arabia', page: 1 }, { quote: 'Riyadh, KSA', page: 1 }, { quote: '3385 Al Thumamah Road Riyadh 13317 Saudi Arabia', page: 1 }] };
    expect(aiSignals(answer, pages, NOW).map((x) => x.quote)).toEqual(['3385 Al Thumamah Road Riyadh 13317 Saudi Arabia', '3385 Al Thumamah Road Riyadh 13317 Saudi Arabia']);
  });

  it('an address outside Saudi Arabia is never a Saudi address (Yourparts: Cairo)', () => {
    const pages = [{ url: 'https://yourparts.com', text: 'الدور الرابع - برج ريحانة ريزيدنس B10 - أول شارع الزهراء - البساتين - القاهرة' }];
    const answer: AiAnswer = { ...none, saudi_address: [{ quote: 'الدور الرابع - برج ريحانة ريزيدنس B10 - أول شارع الزهراء - البساتين - القاهرة', page: 1 }] };
    expect(aiSignals(answer, pages, NOW)).toEqual([]);
  });

  it("a server's error page is not the company's page: a closed site is still down (Shgardi, Cloudflare 1016)", async () => {
    const read = reader({ 'https://shgardi.app': `Please enable cookies. # Error 1016 ## Origin DNS error ${'Cloudflare is currently unable to resolve your requested domain (shgardi.app). '.repeat(10)}` });
    const readRaw = async (url: string) => ({ status: 'down' as const, url, reason: 'HTTP 530' });
    const out = await validateCompanies([{ name: 'Shgardi', website: 'https://shgardi.app' }], { read, askAi: ai(none), readRaw }, NOW);
    expect(out.results[0].active).toBe('fail');
    expect(out.results[0].notes).toContain('site_down');
    expect(out.results[0].pages_read).toEqual([]);
  });

  it("the app's own text from the store is read, free (Bayut: support@bayut.sa in its release notes)", async () => {
    const read = reader({});
    const readRaw = direct({ 'https://bayut.sa': FULL('Bayut بيوت') });
    const app = 'https://apps.apple.com/sa/app/bayut-ksa-real-estate/id1504036401';
    const appFacts = async (url: string) => ({ store: 'App Store' as const, listed: true, updated: '2026-11-12', quote: 'Bayut version 5.16.0, released 2026-11-12', url, text: "Bayut KSA\nWhat's New: Feel free to reach out to us at support@bayut.sa." });
    const out = await validateCompanies([{ name: 'Bayut', website: 'https://bayut.sa', app_store_url: app }], { read, askAi: ai(none), readRaw, appFacts }, NOW);
    expect(read.asked).toEqual([]);
    expect(out.results[0].signals.some((x) => x.signal === 'company email' && x.url === app)).toBe(true);
    expect(out.results[0].real_entity).toBe('pass');
  });

  it("the App Store seller counts as identity when it is a company with the company's name (Bayut)", async () => {
    expect(sellerIsTheCompany('BAYUT WEB ALSAUDIAH FOR TECHNOLOGY COMMUNICATION SPC', ['Bayut'])).toBe(true);
    expect(sellerIsTheCompany('Mohammed Alqahtani', ['Bayut'])).toBe(false); // a person, not a company
    expect(sellerIsTheCompany('Bayut Alqahtani', ['Bayut'])).toBe(false); // a person's name with the brand in it
    expect(sellerIsTheCompany('Digital Apps Agency LLC', ['Bayut'])).toBe(false); // an agency, not the company's name
    expect(sellerIsTheCompany(undefined, ['Bayut'])).toBe(false);
    const read = reader({});
    const readRaw = async (url: string) => ({ status: 'skipped' as const, url, reason: 'robots.txt does not allow it' });
    const app = 'https://apps.apple.com/sa/app/bayut-ksa-real-estate/id1504036401';
    const facts = { store: 'App Store' as const, listed: true, updated: '2026-11-12', quote: 'Bayut version 5.16.0, released 2026-11-12', url: app, text: 'Bayut KSA\nSeller: BAYUT WEB ALSAUDIAH FOR TECHNOLOGY COMMUNICATION SPC' };
    const out = await validateCompanies([{ name: 'Bayut', website: 'https://bayut.sa', app_store_url: app }], { read, askAi: ai(none), readRaw, appFacts: async () => ({ ...facts, seller: 'BAYUT WEB ALSAUDIAH FOR TECHNOLOGY COMMUNICATION SPC' }) }, NOW);
    expect(out.results[0].real_entity).toBe('pass');
    expect(out.results[0].cr).toBeNull(); // never Confirmed through the seller name
    const person = await validateCompanies([{ name: 'Bayut', website: 'https://bayut.sa', app_store_url: app }], { read, askAi: ai(none), readRaw, appFacts: async () => ({ ...facts, seller: 'Mohammed Alqahtani' }) }, NOW);
    expect(person.results[0].real_entity).toBe('unknown');
  });

  it('Arabic address words count only as whole words (Aajil: "حي" inside "الحين")', () => {
    expect(isAddressPart('نشتري للمقاولين والتجار والمصنّعين في السعودية موادهم الحين، ويسدّدون بعدين')).toBe(false);
    expect(isAddressPart('نعمل بطريقة سهلة في الرياض')).toBe(false);
    expect(isAddressPart('صبر وجهد في الرياض')).toBe(false);
    expect(isAddressPart('الرياض، 4538 الدائري الشمالي الفرعي ، 6880 حي الوادي ، الرمز البريدي 13313')).toBe(true);
    expect(isAddressPart('جدة، الحي الأول')).toBe(true);
    expect(isAddressPart('الرياض، شارع العليا')).toBe(true);
    expect(isAddressPart('ص.ب 1234 الرياض')).toBe(true);
  });

  it('one quote counts for one signal of a check (Aajil: a price is not also a review)', () => {
    const pages = [{ url: 'https://aajil.sa/en', text: 'Up to SAR 4 million.' }];
    const answer: AiAnswer = { ...none, offering: [{ signal: 'pricing', quote: 'Up to SAR 4 million', page: 1 }, { signal: 'customers or reviews', quote: 'Up to SAR 4 million', page: 1 }] };
    expect(aiSignals(answer, pages, NOW).map((x) => x.signal)).toEqual(['pricing']);
  });

  it('a listed app counts as available now, and its update date counts for Active (Testahel, PureGym KSA)', async () => {
    const read = reader({ 'https://x.sa': 'X kids app' });
    const appFacts = async (url: string) => ({ store: 'Google Play' as const, listed: true, updated: '2026-10-01', quote: 'Updated on 2026-10-01', url });
    const out = await validateCompanies([{ name: 'X', website: 'https://x.sa', app_store_url: 'https://play.google.com/store/apps/details?id=com.x' }], { read, askAi: ai(none), appFacts }, NOW);
    expect(out.results[0]).toMatchObject({ real_offering: 'pass', active: 'pass' });
    const old = await validateCompanies([{ name: 'X', website: 'https://x.sa', app_store_url: 'https://play.google.com/store/apps/details?id=com.x' }], { read, askAi: ai(none), appFacts: async (url) => ({ ...(await appFacts(url)), updated: '2024-06-25' }) }, NOW);
    expect(old.results[0].active).toBe('fail'); // its only date is older than 12 months
  });

  it('the re-check looks for news before failing Active only because of an old copyright year (Dinar © 2024)', async () => {
    const read = reader({ 'https://dinar.sa': `Dinar invest app. استثمر الآن. جميع الحقوق محفوظة لشركة دينار © 2024 ${'x '.repeat(300)}` });
    const askAi = ai({ ...none, offering: [{ signal: 'sign up, download or order', quote: 'استثمر الآن', page: 1 }] });
    const noRecheck = await validateCompanies([{ name: 'Dinar', website: 'https://dinar.sa' }], { read, askAi }, NOW);
    expect(noRecheck.results[0].active).toBe('fail');
    const findNews = vi.fn(async () => ({ news: [{ url: 'https://argaam.com/d', title: 'Dinar launches a new fund', published_date: '2026-10-05' }], tavily_calls: 1 }));
    const recheck = await validateCompanies([{ name: 'Dinar', website: 'https://dinar.sa' }], { read, askAi, findNews }, NOW);
    expect(findNews).toHaveBeenCalledTimes(1);
    expect(recheck.results[0].active).toBe('pass');
    expect(recheck.tavily_calls).toBe(2);
  });

  it('a fail only because of an old copyright year is saved with no status outside the re-check', async () => {
    const read = reader({ 'https://dinar.sa': `Dinar invest app. استثمر الآن. جميع الحقوق محفوظة لشركة دينار © 2024 ${'x '.repeat(300)}` });
    const askAi = ai({ ...none, offering: [{ signal: 'sign up, download or order', quote: 'استثمر الآن', page: 1 }] });
    const saved: unknown[] = [];
    const out = await validateCompanies([{ name: 'Dinar', website: 'https://dinar.sa', startup_id: 'ST_181' }], { read, askAi, save: async (_id, row) => void saved.push(row.validation_status) }, NOW);
    expect(out.results[0].active).toBe('fail');
    expect(saved).toEqual([null]);
  });

  it('finds an app link to any country’s App Store (Dinar links to the US store)', () => {
    expect(appLinkOn([{ url: 'https://dinar.sa', text: 'https://apps.apple.com/us/app/%D8%AF-dinar/id6443503999 App' }])).toBe('https://apps.apple.com/us/app/%D8%AF-dinar/id6443503999');
  });

  it('reads Tavily’s news date format', () => {
    expect(isoDate('Tue, 01 Sep 2026 00:00:00 GMT')).toBe('2026-09-01');
    expect(isoDate('2026-10-20T08:00:00Z')).toBe('2026-10-20');
    expect(isoDate('not a date')).toBeNull();
  });

  it('news counts only when its title names the company and it is about Saudi Arabia', () => {
    const hits = [
      { url: 'https://argaam.com/a', title: 'Dinar raises funding', content: 'The Saudi fintech Dinar…', date: '2026-10-01' },
      { url: 'https://news.com/b', title: 'Iraqi dinar falls against the dollar', content: 'Baghdad markets…', date: '2026-10-02' },
      { url: 'https://news.com/c', title: 'Gold prices rise', content: 'Saudi gold market', date: '2026-10-03' },
    ];
    expect(newsAboutCompany({ name: 'Dinar', website: 'https://www.dinar.sa' }, hits).map((n) => n.url)).toEqual(['https://argaam.com/a']);
  });

  it('builds the Arabic link, unless the link is already Arabic', () => {
    expect(arabicPage('https://www.dinar.sa/')).toBe('https://www.dinar.sa/ar');
    expect(arabicPage('https://lahint.sa/ar')).toBeNull();
  });
});
