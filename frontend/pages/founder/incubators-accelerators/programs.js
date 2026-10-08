/* ==========================================================
   Programs: the incubators and accelerators (table support_organisations,
   migration 0006). Used by the founder explorer, the founder details page
   and the admin management page, so they all read the data the same way.

     import { getPrograms, programType, sectorList } from '../programs.js';

   The rows come straight from the dataset in datasets/incubators-accelerators,
   where a missing value is written as "—". clean() turns those into ''.

   Each text field has an Arabic twin (name_ar, description_ar ..., migration 0008).
   text(program, 'description') gives the Arabic one when the site is in Arabic,
   and the English one when the site is in English or the Arabic one is empty.
   ========================================================== */

import { supabase } from '../../../shared/supabase.js';
import { getLanguage } from '../../../shared/language.js';

// Address of the frontend/ folder, so links work from any page depth
const ROOT = new URL('../../../', import.meta.url).href;

export const DETAILS_PAGE = `${ROOT}pages/founder/incubators-accelerators/incubator-accelerator-details/incubator-accelerator-details.html`;
export const EXPLORER_PAGE = `${ROOT}pages/founder/incubators-accelerators/incubators-accelerators-explorer/incubators-accelerators-explorer.html`;

// The fields the data dictionary marks as required. The admin page measures how complete a record is with them.
export const REQUIRED_FIELDS = ['name', 'type', 'sector', 'location', 'description', 'target_stage', 'services_support', 'eligibility', 'website'];

// Sector words that mean "open to every sector", in English and Arabic
const ALL_SECTORS = /all sectors|all industries|industry-agnostic|multiple sectors|agnostic|جميع القطاعات|كل القطاعات|جميع الصناعات|قطاعات متعددة/i;

// The fields that have an Arabic twin column (field + "_ar")
export const ARABIC_FIELDS = ['name', 'sector', 'location', 'description', 'target_stage', 'program_duration', 'services_support', 'funding_investment', 'eligibility'];

/* ---------- Reading a row ---------- */

/* '' for empty values and the dataset's "—" placeholder; the trimmed text otherwise */
export function clean(value) {
  const text = (value ?? '').toString().replace(/⁠/g, '').trim();
  return /^[—–-]*$/.test(text) ? '' : text;
}

/* A text field in the site's language: the Arabic twin when the site is in
   Arabic and it has one, the English text otherwise */
export function text(program, field) {
  if (getLanguage() === 'ar' && ARABIC_FIELDS.includes(field)) {
    const arabic = clean(program[`${field}_ar`]);
    if (arabic) return arabic;
  }
  return clean(program[field]);
}

/* 'incubator', 'accelerator', 'both' or 'other' */
export function programType(program) {
  const type = clean(program.type).toLowerCase();
  const incubator = type.includes('incubat');
  const accelerator = type.includes('accelerat');
  if (incubator && accelerator) return 'both';
  if (incubator) return 'incubator';
  if (accelerator) return 'accelerator';
  return 'other';
}

/* The chip color of each type */
export const TYPE_CHIP = { incubator: 'chip-teal', accelerator: 'chip-navy', both: 'chip-navy', other: '' };

/* "Technology / Deep Technology" → ['Technology', 'Deep Technology'].
   Words like "All sectors" are left out: isOpenToAll() answers that instead. */
export function sectorList(program) {
  const parts = text(program, 'sector').split(/[,;/،؛]/).map((part) => part.trim()).filter(Boolean);
  return [...new Set(parts)].filter((part) => !ALL_SECTORS.test(part));
}

/* Is the program open to every sector? */
export function isOpenToAll(program) {
  return ALL_SECTORS.test(clean(program.sector)) || ALL_SECTORS.test(clean(program.sector_ar));
}

/* "Riyadh, Saudi Arabia (Hybrid)" → "Riyadh" (in the site's language) */
export function cityOf(program) {
  const first = text(program, 'location').split(/[,،(—–]/)[0].trim();
  return first || '';
}

/* A list written in one cell: "Mentorship, workshops; networking" → ['Mentorship', 'workshops', 'networking'].
   A cell with ";" is split only there, because its parts can contain commas themselves.
   Arabic cells use "،" and "؛" the same way. */
export function listItems(value) {
  const cell = clean(value);
  if (!cell) return [];
  const parts = /[;؛]/.test(cell) ? cell.split(/[;؛]/) : cell.split(/[,،](?![^(]*\))/);
  return parts
    .map((part) => part.trim().replace(/^and\s+/i, '').replace(/\.$/, ''))
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
}

/* The website as a safe link, or '' */
export function websiteOf(program) {
  const text = clean(program.website);
  if (!text) return '';
  const address = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    return new URL(address).href;
  } catch {
    return '';
  }
}

/* ---------- Logo (migration 0007) ---------- */

// The Storage bucket the admin page uploads logos to
export const LOGO_BUCKET = 'program-logos';

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

/* The logo's address, or ''. Only http(s) addresses, so a bad value can never run. */
export function logoOf(program) {
  try {
    const address = new URL(clean(program.logo_url));
    return address.protocol === 'https:' || address.protocol === 'http:' ? address.href : '';
  } catch {
    return '';
  }
}

/* "The Garage Incubator" → "TG" */
function initialsOf(name) {
  const words = clean(name).split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word[0] || ''));
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '?';
}

/* The program's logo, or its initials on a soft color when it has none
   (the same name always gets the same color). Each page sizes .program-logo itself. */
export function logoHtml(program) {
  const logo = logoOf(program);
  if (logo) {
    return `<span class="program-logo has-image"><img src="${escapeHtml(logo)}" alt="" loading="lazy"></span>`;
  }
  const tone = [...clean(program.name)].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 3;
  return `<span class="program-logo tone-${tone}" aria-hidden="true">${escapeHtml(initialsOf(program.name))}</span>`;
}

/* How many required fields are filled, from 0 to 100 */
export function completeness(program) {
  const filled = REQUIRED_FIELDS.filter((field) => clean(program[field])).length;
  return Math.round((filled / REQUIRED_FIELDS.length) * 100);
}

export function detailsLink(id) {
  return `${DETAILS_PAGE}?id=${encodeURIComponent(id)}`;
}

/* ---------- Database ---------- */

function report(action, error) {
  // shown in the browser console (Developer Tools) so the real cause is easy to find
  console.error(`Programs: could not ${action}:`, error.code, error.message);
}

/* Every program, A to Z. Returns null when the database could not be reached. */
export async function getPrograms() {
  const { data, error } = await supabase.from('support_organisations').select('*').order('name');
  if (error) {
    report('load the programs', error);
    return null;
  }
  return data;
}

/* One program, or null */
export async function getProgram(id) {
  const { data, error } = await supabase.from('support_organisations').select('*').eq('support_org_id', id).maybeSingle();
  if (error) {
    report('load the program', error);
    return null;
  }
  return data;
}
