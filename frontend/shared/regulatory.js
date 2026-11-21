/* ==========================================================
   Regulatory requirements: the ONE place that knows the
   regulatory_requirements table (migrations 0006, 0010, 0012, 0013 and 0014).

   Used by the founder Regulatory Explorer, the requirement details page,
   the admin Regulatory page and the assessment's roadmap:

     import { loadRequirements, field, isicOf, stagesOf, label } from '../../../shared/regulatory.js';
     const list = await loadRequirements();     // null when it could not load
     field(row, 'authority')                    // Arabic when the page is in Arabic and there is an Arabic text
     isicOf(row)                                // ['C', 'G'] — its ISIC4 sections, or ['ALL']
     stagesOf(row)                              // ['Pre-operation', 'Hiring']
     label('stage', 'Pre-operation')            // "Pre-operation" / "ما قبل التشغيل"

   Sectors are ISIC4 only (as in the survival model and the market indicators):
   sections (A … U) for the filters, 2-digit divisions for the roadmap.

   Fixed lists (stages, mandatory, status, ISIC4 sections) are translated with
   reg.<kind>.<value> keys in the translation files. A value with no key
   (for example a new stage typed by an admin) is shown as it is.
   ========================================================== */

import { supabase } from './supabase.js';
import { getLanguage, t } from './language.js';

const ROOT = new URL('..', import.meta.url).href;
const DETAILS_PAGE = `${ROOT}pages/founder/regulatory-requirements/requirement-details/requirement-details.html`;

/* The 20 sections of ISIC Rev.4 used by GASTAT's Saudi classification (SSIC), in order.
   The value is the international letter; ar is the letter GASTAT writes in Arabic.
   Their names are in the translation files: reg.isic.A, reg.isic.B … (migration 0013). */
export const ISIC_SECTIONS = [
  { code: 'A', ar: 'أ' }, { code: 'B', ar: 'ب' }, { code: 'C', ar: 'ج' }, { code: 'D', ar: 'د' },
  { code: 'E', ar: 'هـ' }, { code: 'F', ar: 'و' }, { code: 'G', ar: 'ز' }, { code: 'H', ar: 'ح' },
  { code: 'I', ar: 'ط' }, { code: 'J', ar: 'ي' }, { code: 'K', ar: 'ك' }, { code: 'L', ar: 'ل' },
  { code: 'M', ar: 'م' }, { code: 'N', ar: 'ن' }, { code: 'O', ar: 'س' }, { code: 'P', ar: 'ع' },
  { code: 'Q', ar: 'ف' }, { code: 'R', ar: 'ص' }, { code: 'S', ar: 'ق' }, { code: 'U', ar: 'ش' },
];

/* The ISIC4 section of a 2-digit division, by the ranges of ISIC Rev.4: '62' → 'J'.
   '' when the division is empty or unknown. */
const SECTION_RANGES = [
  ['A', 1, 3], ['B', 5, 9], ['C', 10, 33], ['D', 35, 35], ['E', 36, 39], ['F', 41, 43], ['G', 45, 47],
  ['H', 49, 53], ['I', 55, 56], ['J', 58, 63], ['K', 64, 66], ['L', 68, 68], ['M', 69, 75], ['N', 77, 82],
  ['O', 84, 84], ['P', 85, 85], ['Q', 86, 88], ['R', 90, 93], ['S', 94, 96], ['U', 99, 99],
];
export function sectionOfDivision(division) {
  const number = Number.parseInt(division, 10);
  const found = SECTION_RANGES.find(([, from, to]) => number >= from && number <= to);
  return found ? found[0] : '';
}

/* The ISIC4 sections of a requirement: ['C', 'G'], or ['ALL'] when it applies to every business */
export function isicOf(row) {
  return Array.isArray(row.isic_sections) ? row.isic_sections : [];
}

/* Is the requirement for this ISIC4 section? Requirements for every business ('ALL') always are. */
export function fitsIsic(row, code) {
  const sections = isicOf(row);
  return sections.includes('ALL') || sections.includes(code);
}

/* The 85 ISIC4 divisions (2 digits) in GASTAT's classification, for checking what admins type */
export const ISIC_DIVISIONS = ['01', '02', '03', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14',
  '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29',
  '30', '31', '32', '33', '35', '36', '37', '38', '39', '41', '42', '43', '45', '46', '47',
  '49', '50', '51', '52', '53', '55', '56', '58', '59', '60', '61', '62', '63', '64', '65',
  '66', '68', '69', '70', '71', '72', '73', '74', '75', '77', '78', '79', '80', '81', '82',
  '84', '85', '86', '87', '88', '90', '91', '93', '94', '95', '96', '99'];

/* The ISIC4 divisions of an idea, from the sector the founder chose in the chat. They are
   the divisions the market indicators link to each sector (datasets/market-indicators),
   so the roadmap and the market numbers describe the same activities. */
export const IDEA_DIVISIONS = {
  ai: ['58', '62', '63'],          // publishing (incl. software), programming, information services
  food: ['10', '11', '56'],        // food products, beverages, food and beverage service
  fashion: ['13', '14', '15'],     // textiles, wearing apparel, leather
  furniture: ['31'],               // furniture
};

/* The ISIC4 divisions of a requirement: ['10', '11'], or ['ALL'] when it applies to every business */
export function divisionsOf(row) {
  return Array.isArray(row.isic_divisions) ? row.isic_divisions : [];
}

/* Is the requirement for one of these divisions? Requirements for every business ('ALL') always are. */
export function fitsDivisions(row, divisions) {
  const own = divisionsOf(row);
  return own.includes('ALL') || own.some((code) => divisions.includes(code));
}

/* The sections as words: "C · Manufacturing, G · Wholesale …" or "Every economic sector" */
export function isicListText(row) {
  return isicOf(row).map(isicText).join(getLanguage() === 'ar' ? '، ' : ', ');
}

/* A section with its letter in the page's language: "C · Manufacturing" / "ج · الصناعة التحويلية" */
export function isicText(code) {
  if (code === 'ALL') return t('reg.isicEvery');
  const section = ISIC_SECTIONS.find((item) => item.code === code);
  const letter = getLanguage() === 'ar' && section ? section.ar : code;
  return `${letter} · ${t(`reg.isic.${code}`)}`;
}

/* The order business stages are shown in: from the idea to a running business */
const STAGE_ORDER = ['Planning', 'Design', 'Pre-market', 'Establishment', 'Pre-operation', 'Product launch',
  'Hiring', 'Operation', 'Growth', 'Trust', 'Pre-import', 'Import', 'Pre-export', 'Export'];

export const MANDATORY = ['Required', 'Required when in scope', 'Conditional', 'Optional'];
export const STATUSES = ['Active', 'Announced'];

/* A requirement's ISIC4 sections and divisions are kept in their own tables (migration 0029).
   This asks for them together with the requirement. */
export const REQUIREMENT_COLUMNS = '*, requirement_isic_sections (isic_section), requirement_isic_divisions (isic_division)';

/* Puts the two lists back on the row as simple lists:
   row.isic_sections = ['C', 'G'] and row.isic_divisions = ['10', '11'] (or ['ALL']) */
export function withIsic(row) {
  if (!row) return row;
  const { requirement_isic_sections: sections = [], requirement_isic_divisions: divisions = [], ...rest } = row;
  return {
    ...rest,
    isic_sections: sections.map((item) => item.isic_section),
    isic_divisions: divisions.map((item) => item.isic_division),
  };
}

/* Saves a requirement's ISIC4 sections and divisions: the old rows are replaced by the new ones.
   Returns the error, or null when it worked. */
export async function saveIsic(requirementId, sections, divisions) {
  const lists = [
    { table: 'requirement_isic_sections', column: 'isic_section', values: sections },
    { table: 'requirement_isic_divisions', column: 'isic_division', values: divisions },
  ];
  for (const list of lists) {
    const removed = await supabase.from(list.table).delete().eq('requirement_id', requirementId);
    if (removed.error) return removed.error;
    const rows = list.values.map((value) => ({ requirement_id: requirementId, [list.column]: value }));
    if (rows.length) {
      const added = await supabase.from(list.table).insert(rows);
      if (added.error) return added.error;
    }
  }
  return null;
}

/* All requirements, sorted by id (GEN-001, GEN-002 …). Returns null when loading failed. */
export async function loadRequirements() {
  const { data, error } = await supabase.from('regulatory_requirements').select(REQUIREMENT_COLUMNS).order('requirement_id');
  if (error) {
    console.error('regulatory_requirements:', error.message);
    return null;
  }
  return data.map(withIsic);
}

/* One requirement: { requirement, failed }.
   requirement is null when there is no such id; failed is true when the database did not answer. */
export async function loadRequirement(id) {
  const { data, error } = await supabase.from('regulatory_requirements').select(REQUIREMENT_COLUMNS).eq('requirement_id', id).maybeSingle();
  if (error) console.error('regulatory_requirements:', error.message);
  return { requirement: withIsic(data) || null, failed: Boolean(error) };
}

/* ---------- Look: color, logo, initials ---------- */

/* The requirement's color, from 0 to 5 (six shades of green, color-N in the explorer and
   details pages). Worked out from its id (GEN-014, FOOD-003 …), so a requirement always
   keeps the same color and its card and details page match. */
export function colorOf(row) {
  const id = row.requirement_id || '';
  let sum = 0;
  for (const letter of id.replace(/[^A-Za-z]/g, '')) sum += letter.charCodeAt(0);   // the letters: GEN, FOOD …
  return (sum + (Number(id.replace(/\D/g, '')) || 0)) % 6;                          // plus the number: 1, 2, 3 …
}

/* The full address of the authority's logo (authority_logo, migration 0012), or '' when there is none */
export function logoUrl(row) {
  return row.authority_logo ? `${ROOT}${row.authority_logo}` : '';
}

/* The authority's short name from its brackets, or the first letters of its words:
   "Communications, Space and Technology Commission (CST)" → "CST", "Saudi Post" → "SP" */
export function initials(authority) {
  const short = (authority || '').match(/\(([^)]+)\)\s*$/);
  if (short) return short[1].slice(0, 4).toUpperCase();
  const words = (authority || '').split(/[\s/]+/).filter((word) => /^[A-Za-z]/.test(word) && !['and', 'of', 'for', 'the'].includes(word));
  return (words.slice(0, 2).map((word) => word[0]).join('') || '?').toUpperCase();
}

/* A text column in the page's language: field(row, 'name') reads name_ar or name_en,
   field(row, 'authority') reads authority_ar or authority. English when there is no Arabic. */
export function field(row, name) {
  const english = name === 'name' ? row.name_en : row[name];
  if (getLanguage() !== 'ar') return english || '';
  return row[`${name}_ar`] || english || '';
}

// "Food & Beverages" → "food_beverages", the end of a translation key
function keyOf(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/* The words for a fixed value: label('stage', 'Import'),
   label('mandatory', 'Conditional'), label('status', 'Active') */
export function label(kind, value) {
  const key = `reg.${kind}.${keyOf(value)}`;
  return t(key) === key ? value : t(key);
}

/* "Pre-operation / Hiring" → ['Pre-operation', 'Hiring'] */
export function stagesOf(row) {
  return (row.business_stage || '').split('/').map((item) => item.trim()).filter(Boolean);
}

/* Every stage that appears in the list, in the order above (unknown ones at the end) */
export function allStages(rows) {
  const found = [...new Set(rows.flatMap(stagesOf))];
  const rank = (stage) => (STAGE_ORDER.includes(stage) ? STAGE_ORDER.indexOf(stage) : STAGE_ORDER.length);
  return found.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/* The stages as words: "Pre-operation / Hiring" */
export function stagesText(row) {
  return stagesOf(row).map((stage) => label('stage', stage)).join(' / ');
}

/* How many pastel colors there are (chip-pastel-1 … chip-pastel-15 in shared.css) */
const PASTELS = 15;

/* A pastel color number for each authority: the authorities in A–Z order take the
   colors in turn, so every authority has its own color (up to 15 authorities;
   after that the colors start again).
     const colors = authorityColors(rows);   colors.get('Saudi Post (SPL)') → 13 */
export function authorityColors(rows) {
  const names = [...new Set(rows.map((row) => row.authority).filter(Boolean))].sort();
  return new Map(names.map((name, index) => [name, (index % PASTELS) + 1]));
}

/* Fills a filter dropdown, keeping what was chosen (call it again when the language changes).
     nameKey  shown while nothing is chosen, e.g. "Sector" (it is not in the open list)
     allKey   the first choice in the list, e.g. "All sectors": shows everything again
     options  [value, words] pairs
   Both "nothing chosen" and "All" have the value '', so a page only checks select.value. */
export function fillFilter(select, nameKey, allKey, options) {
  const chosen = select.value;
  const pickedAll = select.selectedIndex === 1;

  select.innerHTML = '';
  const name = new Option(t(nameKey), '');
  name.hidden = true;
  select.add(name);
  select.add(new Option(t(allKey), ''));
  options.forEach(([value, text]) => select.add(new Option(text, value)));

  if (chosen && options.some(([value]) => value === chosen)) select.value = chosen;
  else select.selectedIndex = pickedAll ? 1 : 0;
}

/* Address of a requirement's details page */
export function detailsLink(id) {
  return `${DETAILS_PAGE}?id=${encodeURIComponent(id)}`;
}

/* "mc.gov.sa" from "https://mc.gov.sa/en/…" */
export function siteName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url || '';
  }
}

/* A date like "8 Sep 2026" / "8 سبتمبر 2026" */
export function dateText(date) {
  return new Date(date).toLocaleDateString(getLanguage() === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}
