/* ==========================================================
   Programs: the incubators and accelerators (table support_organizations,
   migration 0006). Used by the founder explorer, the founder details page
   and the admin management page, so they all read the data the same way.

     import { getPrograms, programType, sectorList } from '../programs.js';

   The rows come straight from the dataset in datasets/incubators-accelerators,
   where a missing value is written as "—". clean() turns those into ''.

   Each text field has an Arabic twin (name_ar, description_ar ..., migration 0012).
   text(program, 'description') gives the Arabic one when the site is in Arabic,
   and the English one when the site is in English or there is no Arabic.
   Until the database has the Arabic columns, the Arabic of the 19 dataset
   programs comes from ./programs-ar.js.
   ========================================================== */

import { supabase } from '../../../shared/supabase.js';
import { getLanguage } from '../../../shared/language.js';
import { PROGRAMS_AR } from './programs-ar.js';
import { label } from '../../../shared/startups.js?v=4';

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

/* The Arabic of a text field, or '': the database column first (field + "_ar"),
   then ./programs-ar.js for the programs of the dataset */
export function arabicOf(program, field) {
  return clean(program[`${field}_ar`]) || clean(PROGRAMS_AR[program.support_org_id]?.[field]);
}

/* A text field in the site's language: the Arabic one when the site is in
   Arabic and it has one, the English text otherwise */
export function text(program, field) {
  if (getLanguage() === 'ar' && ARABIC_FIELDS.includes(field)) {
    const arabic = arabicOf(program, field);
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

/* The icon of each type (names from layout.js): a sprout grows, a rocket speeds up */
export const TYPE_ICON = { incubator: 'sprout', accelerator: 'rocket', both: 'rocket', other: 'spark' };

/* The program's color, from 0 to 5 (the same name always gets the same one).
   The explorer's card and the details page's head use it, so they match. */
export function colorOf(program) {
  return [...clean(program.name)].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 6;
}

/* The program's sectors as the database writes them, in English:
   ['AI & Deep Tech', 'Education, Research & Talent'] (the same sector list as the startups,
   migration 0045). "All sectors" is left out: isOpenToAll() answers that instead.
   The English words are the filter values, so a chosen sector stays chosen when the language changes;
   sectorName() gives the words to show. */
export function sectorList(program) {
  const parts = program.sectors
    ? program.sectors.map((item) => clean(item.sector))
    : clean(program.sector).split(';').map((part) => part.trim());
  return [...new Set(parts.filter(Boolean))].filter((part) => !ALL_SECTORS.test(part));
}

/* A sector in the page's language, with the same words as the Startup Explorer
   (label('sector', ...) from shared/startups.js). A sector with no translation shows
   the program's own Arabic (sector_ar) in Arabic, or the English as it is. */
export function sectorName(program, sector) {
  // an ISIC4 section ('J'): its plain name, the same words as the Startup Explorer
  if (/^[A-U]$/.test(sector)) return label('isic', sector);
  const words = label('sector', sector);
  if (words !== sector || getLanguage() !== 'ar') return words;
  const row = (program.sectors || []).find((item) => item.sector === sector);
  return clean(row?.sector_ar) || sector;
}

/* Is the program open to every sector? */
export function isOpenToAll(program) {
  return ALL_SECTORS.test(clean(program.sector)) || ALL_SECTORS.test(arabicOf(program, 'sector'));
}

/* "Riyadh, Saudi Arabia (Hybrid)" → "Riyadh" (in the site's language) */
export function cityOf(program) {
  const first = text(program, 'location').split(/[,،(—–]/)[0].trim();
  return first || '';
}

/* The Saudi region of each city a program can be in, so the explorer can filter by
   the 13 regions (the same names as the startups: SAUDI_REGIONS in shared/startups.js) */
const CITY_REGIONS = {
  riyadh: 'Riyadh',
  jeddah: 'Makkah', makkah: 'Makkah', taif: 'Makkah', thuwal: 'Makkah', rabigh: 'Makkah',
  madinah: 'Madinah', yanbu: 'Madinah', alula: 'Madinah',
  dammam: 'Eastern', al_khobar: 'Eastern', khobar: 'Eastern', dhahran: 'Eastern', al_ahsa: 'Eastern',
  jubail: 'Eastern', qatif: 'Eastern', hafar_al_batin: 'Eastern', eastern_province: 'Eastern',
  buraidah: 'Qassim', unaizah: 'Qassim', qassim: 'Qassim',
  abha: 'Asir', khamis_mushait: 'Asir', asir: 'Asir',
  tabuk: 'Tabuk', neom: 'Tabuk',
  hail: 'Hail',
  arar: 'Northern Borders', northern_borders: 'Northern Borders',
  jazan: 'Jazan',
  najran: 'Najran',
  al_baha: 'Al Baha',
  sakaka: 'Al Jouf', al_jouf: 'Al Jouf',
};

/* The program's Saudi region ("Al Khobar, Saudi Arabia" → 'Eastern'), 'saudi' for a
   program that covers all of Saudi Arabia, or '' when the place is not known */
export function regionOf(program) {
  const first = clean(program.location).split(/[,،(—–/]/)[0].trim();
  const key = first.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (key === 'saudi_arabia') return 'saudi';
  return CITY_REGIONS[key] || '';
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

/* ---------- Logo (migration 0011) ---------- */

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

/* A program's sectors and services are kept one per row, in English with their Arabic, in their own
   tables (migration 0043). This asks for them together with the program. */
const PROGRAM_COLUMNS = '*, organization_sectors (sector, sector_ar, display_order), organization_services (service, service_ar, display_order)';

/* Puts the two lists back on the row as text, as the pages read them:
   sector 'Gaming; Education, Research & Talent' (sector_ar with "؛") and services_support 'Mentorship; Workshops'
   (services_support_ar with "؛"). Sectors are joined with ";" because a sector name can have a comma in it.
   The sector rows are kept too (row.sectors), for sectorList() and sectorName(). */
function withLists(row) {
  if (!row) return row;
  const { organization_sectors: sectors = [], organization_services: services = [], ...rest } = row;
  const inOrder = (items) => [...items].sort((a, b) => a.display_order - b.display_order);
  const join = (items, column, separator) => items.map((item) => item[column]).filter(Boolean).join(separator) || null;
  return {
    ...rest,
    sectors: inOrder(sectors),
    sector: join(inOrder(sectors), 'sector', '; '),
    sector_ar: join(inOrder(sectors), 'sector_ar', '؛ '),
    services_support: join(inOrder(services), 'service', '; '),
    services_support_ar: join(inOrder(services), 'service_ar', '؛ '),
  };
}

/* The parts of a list from the admin form. Sectors: separated by ";" (the form joins the chosen
   sectors with it; a sector name can have a comma in it). Services: by ";" when there
   is one (a service can contain a comma), otherwise by "," outside brackets. Arabic uses "،" and "؛" too. */
function partsOf(text, kind) {
  const cell = clean(text);
  if (!cell) return [];
  const parts = kind === 'sector'
    ? cell.split(/[;؛]/)
    : /[;؛]/.test(cell) ? cell.split(/[;؛]/) : cell.split(/[,،](?![^(]*\))/);
  return parts.map((part) => part.trim().replace(/^and\s+/i, '').replace(/\.$/, '')).filter(Boolean);
}

/* Saves a program's sectors and services, each English part with the Arabic part in the same place.
   Returns 'mismatch' when the English and Arabic lists do not have the same number of parts,
   the database error when saving failed, or null when it worked. */
/* True when an Arabic list has a different number of items than its English list.
   Checked before anything is saved, so a wrong form never leaves a half-saved program. */
export function listsMismatch(values) {
  return [['sector', 'sector_ar', 'sector'], ['services_support', 'services_support_ar', 'service']]
    .some(([en, ar, kind]) => {
      const arabic = partsOf(values[ar], kind);
      return arabic.length > 0 && arabic.length !== partsOf(values[en], kind).length;
    });
}

export async function saveProgramLists(programId, values) {
  const lists = [
    { table: 'organization_sectors', column: 'sector', en: partsOf(values.sector, 'sector'), ar: partsOf(values.sector_ar, 'sector') },
    { table: 'organization_services', column: 'service', en: partsOf(values.services_support, 'service'), ar: partsOf(values.services_support_ar, 'service') },
  ];
  if (lists.some((list) => list.ar.length && list.ar.length !== list.en.length)) return 'mismatch';

  for (const list of lists) {
    const removed = await supabase.from(list.table).delete().eq('support_org_id', programId);
    if (removed.error) return removed.error;
    const seen = new Set();
    const rows = list.en
      .map((value, index) => ({ support_org_id: programId, [list.column]: value, [`${list.column}_ar`]: list.ar[index] || null, display_order: index + 1 }))
      .filter((row) => !seen.has(row[list.column]) && seen.add(row[list.column]));
    if (rows.length) {
      const added = await supabase.from(list.table).insert(rows);
      if (added.error) return added.error;
    }
  }
  return null;
}

/* Every program, A to Z. Returns null when the database could not be reached. */
export async function getPrograms() {
  const { data, error } = await supabase.from('support_organizations').select(PROGRAM_COLUMNS).order('name');
  if (error) {
    report('load the programs', error);
    return null;
  }
  return data.map(withLists);
}

/* One program, or null */
export async function getProgram(id) {
  const { data, error } = await supabase.from('support_organizations').select(PROGRAM_COLUMNS).eq('support_org_id', id).maybeSingle();
  if (error) {
    report('load the program', error);
    return null;
  }
  return withLists(data);
}
