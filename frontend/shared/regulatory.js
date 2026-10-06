/* ==========================================================
   Regulatory requirements: the ONE place that knows the
   regulatory_requirements table (migrations 0006 and 0010).

   Used by the founder Regulatory Explorer, the requirement details page
   and the admin Regulatory page:

     import { loadRequirements, field, sectorsOf, stagesOf, label } from '../../../shared/regulatory.js';
     const list = await loadRequirements();     // null when it could not load
     field(row, 'authority')                    // Arabic when the page is in Arabic and there is an Arabic text
     sectorsOf(row)                             // ['Fashion', 'Furniture']
     stagesOf(row)                              // ['Pre-operation', 'Hiring']
     label('stage', 'Pre-operation')            // "Pre-operation" / "ما قبل التشغيل"

   Fixed lists (sectors, stages, mandatory, status) are translated with
   reg.<kind>.<value> keys in the translation files. A value with no key
   (for example a new stage typed by an admin) is shown as it is.
   ========================================================== */

import { supabase } from './supabase.js';
import { getLanguage, t } from './language.js';

const ROOT = new URL('..', import.meta.url).href;
const DETAILS_PAGE = `${ROOT}pages/founder/regulatory-requirements/requirement-details/requirement-details.html`;

/* The sectors a requirement can be for, as written in the dataset ("All" = every business) */
export const SECTORS = ['All', 'AI & Software', 'Food & Beverages', 'Fashion', 'Furniture'];

/* The order business stages are shown in: from the idea to a running business */
const STAGE_ORDER = ['Planning', 'Design', 'Pre-market', 'Establishment', 'Pre-operation', 'Product launch',
  'Hiring', 'Operation', 'Growth', 'Trust', 'Pre-import', 'Import', 'Pre-export', 'Export'];

export const MANDATORY = ['Required', 'Required when in scope', 'Conditional', 'Optional'];
export const STATUSES = ['Active', 'Announced'];

/* All requirements, sorted by id (GEN-001, GEN-002 …). Returns null when loading failed. */
export async function loadRequirements() {
  const { data, error } = await supabase.from('regulatory_requirements').select('*').order('requirement_id');
  if (error) {
    console.error('regulatory_requirements:', error.message);
    return null;
  }
  return data;
}

/* One requirement, or null */
export async function loadRequirement(id) {
  const { data, error } = await supabase.from('regulatory_requirements').select('*').eq('requirement_id', id).maybeSingle();
  if (error) console.error('regulatory_requirements:', error.message);
  return data || null;
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

/* The words for a fixed value: label('sector', 'Fashion'), label('stage', 'Import'),
   label('mandatory', 'Conditional'), label('status', 'Active') */
export function label(kind, value) {
  const key = `reg.${kind}.${keyOf(value)}`;
  return t(key) === key ? value : t(key);
}

/* "Fashion; Furniture" → ['Fashion', 'Furniture'] */
export function sectorsOf(row) {
  return (row.sector || '').split(';').map((item) => item.trim()).filter(Boolean);
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

/* The sectors as words: "All sectors" or "Fashion, Furniture" */
export function sectorsText(row) {
  return sectorsOf(row).map((sector) => label('sector', sector)).join(getLanguage() === 'ar' ? '، ' : ', ');
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
