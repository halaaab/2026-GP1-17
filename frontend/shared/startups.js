/* ==========================================================
   Startups: the ONE place that knows the startups table
   (migration 0006, filled by backend/supabase/seed/startups.sql).

   Used by the founder Startup Explorer, the startup details page
   and the admin Startups page:

     import { loadStartups, listOf, listText, label, initials } from '../../../shared/startups.js';
     const list = await loadStartups();       // null when it could not load
     listOf(row, 'sector')                    // ['Technology', 'Food & Beverages']
     listText(row, 'stage')                   // "Seed / Series A" in the page's language
     label('region', 'Eastern')               // "Eastern" / "الشرقية"
     initials('Foodics')                      // "FO"

   The names and descriptions are written by the startups, in English, and
   are shown as they are. Fixed lists (sector, stage, region)
   are translated with startup.<kind>.<value> keys in the translation files.
   A value with no key (for example a new one typed by an admin) is shown as it is.
   ========================================================== */

import { supabase } from './supabase.js';
import { getLanguage, t } from './language.js';
import { ISIC_SECTIONS, sectionOfDivision } from './regulatory.js?v=3';

/* The 20 ISIC4 sections of GASTAT's classification (SSIC), A to U: the sectors of both explorers */
export const ISIC_CODES = ISIC_SECTIONS.map((section) => section.code);

// The same small helpers the regulatory pages use
export { fillFilter, siteName, dateText } from './regulatory.js';

const ROOT = new URL('..', import.meta.url).href;
const DETAILS_PAGE = `${ROOT}pages/founder/startups/startup-details/startup-details.html`;

/* The sectors, as written in the database (the seed cleans the dataset into this list) */
export const SECTORS = [
  'Technology', 'Technology & Telecommunications', 'AI & Deep Tech', 'Cybersecurity',
  'Financial Services & Fintech', 'Education, Research & Talent', 'Health & Life Sciences',
  'Real Estate', 'Construction & Infrastructure', 'Food & Beverages', 'Agriculture & Food',
  'Retail & E-commerce', 'Transportation & Logistics', 'Manufacturing', 'Travel, Tourism & Hospitality',
  'HR & Recruitment', 'Professional Services', 'Consumer Services', 'Sports & Entertainment', 'Gaming',
  'Creative Industries & Media', 'Marketing & Advertising', 'Energy & Sustainability',
  'Aerospace & Defense', 'Government & Public Sector', 'Fashion',
];

/* Funding stages, from the earliest to the latest */
export const STAGES = [
  'No Funding Yet/Bootstrapped', 'Pre-Seed', 'Seed', 'Pre-Series A', 'Series A', 'Pre-Series B',
  'Series B', 'Series C', 'Series C, D+', 'Private Equity', 'IPO',
];

/* Where a startup works: Saudi regions first, then the wider markets */
export const REGIONS = [
  'Riyadh', 'Makkah', 'Madinah', 'Eastern', 'Asir', 'Jazan',
  'MENA', 'Middle East', 'Africa', 'Asia', 'Europe', 'UK and Ireland',
  'North America', 'LATAM', 'South America', 'Oceania',
];

/* The 13 regions of Saudi Arabia, in this order in the founder explorers' region filters.
   A filter shows only the regions that have something in them. */
export const SAUDI_REGIONS = [
  'Riyadh', 'Makkah', 'Madinah', 'Eastern', 'Qassim', 'Asir', 'Tabuk',
  'Hail', 'Northern Borders', 'Jazan', 'Najran', 'Al Baha', 'Al Jouf',
];


/* A startup's sectors and tags are kept one per row in their own tables (migration 0043).
   This asks for them together with the startup. */
const STARTUP_COLUMNS = '*, startup_sectors (sector, display_order), startup_tags (tag, display_order)';

/* Puts the two lists back on the row as text, as the pages read them:
   row.sector = 'Technology; Retail & E-commerce' and row.tags = 'SaaS, ERP' */
function withLists(row) {
  if (!row) return row;
  const { startup_sectors: sectors = [], startup_tags: tags = [], ...rest } = row;
  const inOrder = (items) => [...items].sort((a, b) => a.display_order - b.display_order);
  return {
    ...rest,
    sector: inOrder(sectors).map((item) => item.sector).join('; ') || null,
    // the ISIC4 section of its economic activity ('62' → 'J'), the sector the explorers filter by
    isic: sectionOfDivision(rest.isic_division) || null,
    tags: inOrder(tags).map((item) => item.tag).join(', ') || null,
  };
}

/* Saves a startup's sectors ("A; B") and tags ("x, y"): the old rows are replaced by the new ones.
   Returns the error, or null when it worked. */
export async function saveStartupLists(startupId, sectorText, tagsText) {
  const split = (text, separator) => [...new Set((text || '').split(separator).map((item) => item.trim()).filter(Boolean))];
  const lists = [
    { table: 'startup_sectors', column: 'sector', values: split(sectorText, ';') },
    { table: 'startup_tags', column: 'tag', values: split(tagsText, ',') },
  ];
  for (const list of lists) {
    const removed = await supabase.from(list.table).delete().eq('startup_id', startupId);
    if (removed.error) return removed.error;
    const rows = list.values.map((value, index) => ({ startup_id: startupId, [list.column]: value, display_order: index + 1 }));
    if (rows.length) {
      const added = await supabase.from(list.table).insert(rows);
      if (added.error) return added.error;
    }
  }
  return null;
}

/* Every startup, sorted by name. Returns null when loading failed.
   Supabase sends at most 1,000 rows per request, so they are read in pages. */
export async function loadStartups() {
  const PAGE = 1000;
  const all = [];

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('startups').select(STARTUP_COLUMNS)
      .order('startup_name').order('startup_id').range(from, from + PAGE - 1);
    if (error) {
      console.error('startups:', error.message);
      return null;
    }
    all.push(...data.map(withLists));
    if (data.length < PAGE) return all;
  }
}

/* One startup: { startup, failed }.
   startup is null when there is no startup with this id; failed is true when it could not load. */
export async function loadStartup(id) {
  const { data, error } = await supabase.from('startups').select(STARTUP_COLUMNS).eq('startup_id', id).maybeSingle();
  if (error) console.error('startups:', error.message);
  return { startup: withLists(data) || null, failed: Boolean(error) };
}

/* "Seed; Series A" → ['Seed', 'Series A'] (sector, stage, region) */
export function listOf(row, column) {
  return (row[column] || '').split(';').map((item) => item.trim()).filter(Boolean);
}

/* The description in the page's language: the Arabic one (migration 0011) when the
   page is in Arabic and there is one, the English one otherwise ('' when there is none) */
export function descriptionOf(row) {
  if (getLanguage() === 'ar' && row.startup_description_ar) return row.startup_description_ar;
  return row.startup_description || '';
}

/* The name in the page's language: the Arabic one (migration 0012) when the page
   is in Arabic and there is one, the English one otherwise */
export function nameOf(row) {
  if (getLanguage() === 'ar' && row.startup_name_ar) return row.startup_name_ar;
  return row.startup_name || '';
}

/* The logo's web address, or '' when there is none. Only http(s) links are
   accepted, so a wrong value in the database can never run as code. */
export function logoOf(row) {
  try {
    const address = new URL(row.logo || '');
    return address.protocol === 'https:' || address.protocol === 'http:' ? address.href : '';
  } catch {
    return '';
  }
}

/* What goes inside a startup's logo square: its logo image, or its initials when it has none.
   The square gets the class "has-logo" when there is an image (each page styles it).
     square.classList.toggle('has-logo', Boolean(logoOf(row)));
     square.innerHTML = logoHtml(row); */
export function logoHtml(row) {
  const escape = (text) => String(text).replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
  const logo = logoOf(row);
  const letters = escape(initials(row.startup_name));
  // crossorigin lets the page look at the image's colors (the logo host allows it), see below
  return logo ? `<img src="${escape(logo)}" alt="" loading="lazy" crossorigin="anonymous" data-initials="${letters}">` : letters;
}

/* Some logos are drawn in white for dark backgrounds and would vanish on a white square.
   When a logo loads, a tiny copy is drawn on a canvas, and its square gets the class
   "is-light" (each page then shows it on a dark color) when:
     - almost all of its visible pixels are light (an all-white logo), or
     - it has a see-through background and a good part of it is white
       (white words next to a colored icon: the words would vanish on white).
   A logo on its own solid white background has (almost) no see-through pixels,
   so it stays on the white square. */
function isLightImage(image) {
  const size = 24;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, size, size);
  const pixels = context.getImageData(0, 0, size, size).data;

  let visible = 0;
  let light = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 60) continue;   // (almost) transparent
    visible += 1;
    if (pixels[index] > 225 && pixels[index + 1] > 225 && pixels[index + 2] > 225) light += 1;
  }
  if (visible === 0) return false;

  const lightShare = light / visible;                     // how much of the logo is white
  const seeThrough = 1 - visible / (size * size);         // how much of the square is transparent
  return lightShare > 0.9 || (seeThrough >= 0.1 && lightShare >= 0.3);
}

// "load" does not bubble either, so it is also caught on the way down
document.addEventListener('load', (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.dataset.initials) return;
  try {
    image.parentElement?.classList.toggle('is-light', isLightImage(image));
  } catch {
    // the image host did not allow reading its colors: keep the white square
  }
}, true);

// A logo that cannot load (moved or deleted on the other website) is replaced by the initials.
// "error" does not bubble, so it is caught on the way down (third argument: true).
document.addEventListener('error', (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.dataset.initials) return;
  image.parentElement?.classList.remove('has-logo');
  image.replaceWith(document.createTextNode(image.dataset.initials));
}, true);

/* "SaaS,ERP" → ['SaaS', 'ERP'] (tags are separated by commas in the dataset) */
export function tagsOf(row) {
  return (row.tags || '').split(',').map((item) => item.trim()).filter(Boolean);
}

// "Food & Beverages" → "food_beverages", the end of a translation key
function keyOf(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// The translation kind of each column
const KINDS = { sector: 'sector', stage: 'stage', region: 'region', isic: 'isic' };

/* The words for a fixed value: label('sector', 'Fashion'), label('stage', 'Seed'),
   label('region', 'MENA'), label('market', 'B2B') */
export function label(kind, value) {
  // an ISIC4 section ('J'): its plain name, the same words as the Regulatory Explorer (reg.isic.*)
  if (kind === 'isic') return value === 'All sectors' ? t('isic.all') : t(`reg.isic.${value}`);
  const key = `startup.${kind}.${keyOf(value)}`;
  return t(key) === key ? value : t(key);
}

/* A column's values as words in the page's language: "Seed / Series A" */
export function listText(row, column, separator = ' / ') {
  return listOf(row, column).map((value) => label(KINDS[column], value)).join(separator);
}

/* The values found in the rows, in the order of a fixed list (unknown ones at the end, A–Z).
   So a value an admin typed that is not in the list still appears in the filters. */
export function allValues(rows, column, order) {
  const found = [...new Set(rows.flatMap((row) => listOf(row, column)))];
  const rank = (value) => (order.includes(value) ? order.indexOf(value) : order.length);
  return found.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/* First letters of the first two words: "Lean Technologies" → "LT", "Foodics" → "FO" */
export function initials(name) {
  // only words with a letter or number in them ("Sla | سلا" skips the "|")
  const words = (name || '').trim().split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
  if (words.length === 0) return '?';
  const letters = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return letters.toUpperCase();
}

/* The startup's color, from 0 to 5: the number in its id (ST_073 → 73) decides it,
   so a startup always keeps the same color and the six colors are shared out evenly.
   The explorer's card and the details page's head use it, so they match. */
export function colorOf(row) {
  return (Number((row.startup_id || '').replace(/\D/g, '')) || 0) % 6;
}

/* The country in the page's language. The dataset writes it in English ("Saudi Arabia");
   the browser knows every country's name in both languages, so we find its code
   from the English name and ask for the name in Arabic. */
let countryCodes = null;   // "saudi arabia" → "SA", made the first time it is needed

export function countryName(english) {
  if (!english || getLanguage() !== 'ar') return english || '';

  if (!countryCodes) {
    countryCodes = new Map();
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const first of letters) {
      for (const second of letters) {
        const code = first + second;
        const name = names.of(code);
        if (name && name !== code) countryCodes.set(name.toLowerCase(), code);
      }
    }
  }

  const code = countryCodes.get(english.toLowerCase());
  return code ? new Intl.DisplayNames(['ar'], { type: 'region' }).of(code) : english;
}

/* Address of a startup's details page */
export function detailsLink(id) {
  return `${DETAILS_PAGE}?id=${encodeURIComponent(id)}`;
}
