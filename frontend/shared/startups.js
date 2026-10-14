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
   are shown as they are. Fixed lists (sector, stage, region, target market)
   are translated with startup.<kind>.<value> keys in the translation files.
   A value with no key (for example a new one typed by an admin) is shown as it is.
   ========================================================== */

import { supabase } from './supabase.js';
import { getLanguage, t } from './language.js';

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

export const MARKETS = ['B2B', 'B2C', 'B2G', 'B2B2C'];

/* Every startup, sorted by name. Returns null when loading failed.
   Supabase sends at most 1,000 rows per request, so they are read in pages. */
export async function loadStartups() {
  const PAGE = 1000;
  const all = [];

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('startups').select('*')
      .order('startup_name').order('startup_id').range(from, from + PAGE - 1);
    if (error) {
      console.error('startups:', error.message);
      return null;
    }
    all.push(...data);
    if (data.length < PAGE) return all;
  }
}

/* One startup: { startup, failed }.
   startup is null when there is no startup with this id; failed is true when it could not load. */
export async function loadStartup(id) {
  const { data, error } = await supabase.from('startups').select('*').eq('startup_id', id).maybeSingle();
  if (error) console.error('startups:', error.message);
  return { startup: data || null, failed: Boolean(error) };
}

/* Up to three startups like this one, for its details page.
   Only startups in its first sector are read. Each gets 2 points for every sector
   it shares, 1 for the same funding stage and 1 for a shared region; the best three
   are kept. Returns [] when there are none or they could not be loaded. */
export async function loadSimilar(row) {
  const sectors = listOf(row, 'sector');
  if (sectors.length === 0) return [];

  const { data, error } = await supabase.from('startups').select('*')
    .ilike('sector', `%${sectors[0]}%`).neq('startup_id', row.startup_id).limit(60);
  if (error) {
    console.error('startups:', error.message);
    return [];
  }

  const stages = listOf(row, 'stage');
  const regions = listOf(row, 'region');
  const shared = (other, column, mine) => listOf(other, column).filter((value) => mine.includes(value)).length;

  return data
    .map((other) => ({
      other,
      score: shared(other, 'sector', sectors) * 2
        + (shared(other, 'stage', stages) ? 1 : 0)
        + (shared(other, 'region', regions) ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.other.startup_name.localeCompare(b.other.startup_name))
    .slice(0, 3)
    .map((item) => item.other);
}

/* "Seed; Series A" → ['Seed', 'Series A'] (sector, stage, region, target_market, products_services) */
export function listOf(row, column) {
  return (row[column] || '').split(';').map((item) => item.trim()).filter(Boolean);
}

/* The description in the page's language: the Arabic one (migration 0011) when the
   page is in Arabic and there is one, the English one otherwise ('' when there is none) */
export function descriptionOf(row) {
  if (getLanguage() === 'ar' && row.startup_description_ar) return row.startup_description_ar;
  return row.startup_description || '';
}

/* "SaaS,ERP" → ['SaaS', 'ERP'] (tags are separated by commas in the dataset) */
export function tagsOf(row) {
  return (row.tags || '').split(',').map((item) => item.trim()).filter(Boolean);
}

// "Food & Beverages" → "food_beverages", the end of a translation key
function keyOf(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// The translation kind of each column
const KINDS = { sector: 'sector', stage: 'stage', region: 'region', target_market: 'market' };

/* The words for a fixed value: label('sector', 'Fashion'), label('stage', 'Seed'),
   label('region', 'MENA'), label('market', 'B2B') */
export function label(kind, value) {
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
