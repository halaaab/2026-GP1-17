/* Incubators & Accelerators Explorer: every support program, with a search box,
   type / sector / city filters, colored cards, and pages of 12.
   The filters are kept in the address (?q=...&type=...), so a filtered list can be shared. */

import { t } from '../../../../shared/language.js';
import { icon } from '../../../../shared/layout.js';
import '../../../../shared/guard.js';
import { showErrorPage } from '../../../../shared/errors.js';
import {
  getPrograms, programType, sectorList, isOpenToAll, cityOf, clean, text, arabicOf, detailsLink, logoOf, colorOf, TYPE_ICON,
} from '../programs.js';

const PAGE_SIZE = 12;   // four rows of three cards

const cards = document.querySelector('#cards-view');
const search = document.querySelector('#search');
const sectorFilter = document.querySelector('#sector-filter');
const cityFilter = document.querySelector('#city-filter');
const typeFilter = document.querySelector('#type-filter');
const empty = document.querySelector('#empty');
const pager = document.querySelector('#pager');

let programs = [];
let loadFailed = false;
let type = 'all';      // 'all', 'incubator' or 'accelerator'
let page = 0;

/* ---------- Small helpers ---------- */

// Program text is typed by admins, so it is escaped before it goes into HTML
function safe(text) {
  return String(text ?? '').replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

function typeLabel(program) {
  return t(`programs.type.${programType(program)}`);
}

/* ---------- Filtering ---------- */

function matches(program, ignoreType = false) {
  const words = search.value.trim().toLowerCase();
  const fields = ['name', 'sector', 'location', 'description', 'target_stage'];
  const searchable = fields.flatMap((field) => [clean(program[field]), arabicOf(program, field)])
    .join(' ').toLowerCase();

  const fitsSearch = !words || searchable.includes(words);
  const fitsType = ignoreType || type === 'all' || programType(program) === type || programType(program) === 'both';
  // a program open to every sector fits any sector filter
  const fitsSector = !sectorFilter.value || sectorList(program).includes(sectorFilter.value) || isOpenToAll(program);
  const fitsCity = !cityFilter.value || cityOf(program) === cityFilter.value;

  return fitsSearch && fitsType && fitsSector && fitsCity;
}

/* ---------- Drawing ---------- */

function showTotals() {
  const count = (kind) => programs.filter((program) => programType(program) === kind || programType(program) === 'both').length;
  const total = (value, label, iconName) => `
    <div class="programs-total">
      <span class="programs-total-icon">${icon(iconName)}</span>
      <span class="programs-total-text"><strong>${value}</strong><span>${label}</span></span>
    </div>`;
  document.querySelector('#totals').innerHTML = total(programs.length, t('programs.totalPrograms'), 'grid')
    + total(count('incubator'), t('programs.incubators'), TYPE_ICON.incubator)
    + total(count('accelerator'), t('programs.accelerators'), TYPE_ICON.accelerator);
}

// The type dropdown says how many programs each type has; the numbers follow the other filters
function showTypeCounts() {
  const fitting = programs.filter((program) => matches(program, true));
  const count = (kind) => fitting.filter((program) => kind === 'all' || programType(program) === kind || programType(program) === 'both').length;
  typeFilter.querySelectorAll('option').forEach((option) => {
    option.textContent = `${t(option.dataset.label)} (${count(option.value)})`;
  });
}

/* The sectors as small chips: "Open to all sectors", or the first two and "+N" */
function sectorChips(program) {
  if (isOpenToAll(program)) return `<span class="programs-chip">${t('programs.openToAll')}</span>`;
  const sectors = sectorList(program);
  return sectors.slice(0, 2).map((sector) => `<span class="programs-chip">${safe(sector)}</span>`).join('')
    + (sectors.length > 2 ? `<span class="programs-chip">+${sectors.length - 2}</span>` : '');
}

/* One card: a colored band with the type and a big tilted square holding the
   program's logo (or, without one, its type's icon), the name, what it does, the sector chips, and a footer with the
   city and an arrow. The color is the program's own (colorOf), so the details
   page opens in the same color. */
function cardHtml(program, index) {
  const kind = programType(program);
  const logo = logoOf(program);
  return `
    <a class="programs-card color-${colorOf(program)} fade-up" style="--i: ${index}" href="${detailsLink(program.support_org_id)}">
      <div class="programs-card-band">
        <span class="programs-card-type">${typeLabel(program)}</span>
        <span class="programs-card-icon ${logo ? 'has-logo' : ''}" aria-hidden="true">
          ${logo ? `<img src="${safe(logo)}" alt="" loading="lazy">` : icon(TYPE_ICON[kind])}
        </span>
      </div>
      <div class="programs-card-body">
        <h3 class="programs-card-name">${safe(text(program, 'name'))}</h3>
        <p class="programs-card-about">${safe(text(program, 'description') || t('programs.noDescription'))}</p>
        <div class="programs-card-chips">${sectorChips(program)}</div>
      </div>
      <div class="programs-card-foot">
        <span class="programs-card-city">${icon('map')}<span>${safe(cityOf(program) || '—')}</span></span>
        <span class="programs-card-arrow" aria-label="${t('programs.viewDetails')}">${icon('chevron')}</span>
      </div>
    </a>`;
}

function show() {
  const visible = programs.filter((program) => matches(program));
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  page = Math.min(page, pages - 1);
  const onThisPage = visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  cards.hidden = visible.length === 0;
  cards.innerHTML = onThisPage.map(cardHtml).join('');

  document.querySelector('#found').innerHTML = t('programs.found').replace('{n}', `<strong>${visible.length}</strong>`);
  showTypeCounts();

  // Nothing to show: the database failed, it is empty, or the filters found nothing
  empty.hidden = visible.length > 0;
  const filtersOn = search.value || sectorFilter.value || cityFilter.value || type !== 'all';
  const state = loadFailed ? 'error' : programs.length === 0 ? 'none' : 'noMatch';
  document.querySelector('#empty-title').textContent = t(`programs.empty.${state}`);
  document.querySelector('#empty-text').textContent = t(`programs.empty.${state}Text`);
  document.querySelector('#clear-filters').hidden = !filtersOn || state !== 'noMatch';

  // "Showing 11–20 of 34 programs"
  pager.hidden = visible.length === 0;
  document.querySelector('#showing').textContent = t('programs.showing')
    .replace('{from}', page * PAGE_SIZE + 1)
    .replace('{to}', page * PAGE_SIZE + onThisPage.length)
    .replace('{n}', visible.length);
  document.querySelector('#previous').disabled = page === 0;
  document.querySelector('#next').disabled = page >= pages - 1;

  rememberFilters();
}

/* The sector and city dropdowns list what the programs really have, most common first,
   in the site's language. They are filled again when the language changes. */
function fillDropdowns() {
  sectorFilter.querySelectorAll('option:not(:first-child)').forEach((option) => option.remove());
  cityFilter.querySelectorAll('option:not(:first-child)').forEach((option) => option.remove());

  const tally = (values) => {
    const counts = new Map();
    values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };

  const sectors = tally(programs.flatMap(sectorList));
  const cities = tally(programs.map(cityOf).filter(Boolean));

  sectorFilter.insertAdjacentHTML('beforeend', sectors.map(([name, count]) => `<option value="${safe(name)}">${safe(name)} (${count})</option>`).join(''));
  cityFilter.insertAdjacentHTML('beforeend', cities.map(([name, count]) => `<option value="${safe(name)}">${safe(name)} (${count})</option>`).join(''));
}

/* ---------- The address keeps the filters ---------- */

function rememberFilters() {
  const params = new URLSearchParams();
  if (search.value) params.set('q', search.value);
  if (type !== 'all') params.set('type', type);
  if (sectorFilter.value) params.set('sector', sectorFilter.value);
  if (cityFilter.value) params.set('city', cityFilter.value);
  if (page > 0) params.set('page', page + 1);
  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
}

function readFilters() {
  const params = new URLSearchParams(window.location.search);
  search.value = params.get('q') || '';
  type = ['incubator', 'accelerator'].includes(params.get('type')) ? params.get('type') : 'all';
  sectorFilter.value = params.get('sector') || '';
  cityFilter.value = params.get('city') || '';
  page = Math.max(0, (Number(params.get('page')) || 1) - 1);
  typeFilter.value = type;
}

/* ---------- Events ---------- */

function startOver() {
  page = 0;
  show();
}

search.addEventListener('input', startOver);

// The list already follows what is typed; the Search button takes the person down to it
document.querySelector('#filters').addEventListener('submit', (event) => {
  event.preventDefault();
  startOver();
  document.querySelector('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
sectorFilter.addEventListener('change', startOver);
cityFilter.addEventListener('change', startOver);

typeFilter.addEventListener('change', () => {
  type = typeFilter.value;
  startOver();
});

document.querySelector('#clear-filters').addEventListener('click', () => {
  search.value = '';
  sectorFilter.value = '';
  cityFilter.value = '';
  type = 'all';
  typeFilter.value = 'all';
  startOver();
});

document.querySelector('#previous').addEventListener('click', () => {
  page -= 1;
  show();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
document.querySelector('#next').addEventListener('click', () => {
  page += 1;
  show();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// labels and program text are in the current language, so draw them again when it changes.
// A chosen sector or city is in the old language, so those two filters start over.
let shownLanguage = null;
document.addEventListener('darb:language', () => {
  const language = document.documentElement.lang;
  if (shownLanguage && language !== shownLanguage) {
    sectorFilter.value = '';
    cityFilter.value = '';
    page = 0;
  }
  shownLanguage = language;
  fillDropdowns();
  showTotals();
  show();
});

/* ---------- Start ---------- */

document.querySelector('#search-icon').innerHTML = icon('search');
document.querySelector('#empty-icon').innerHTML = icon('sprout');

const data = await getPrograms();
loadFailed = data === null;
if (loadFailed) showErrorPage(500);   // the programs could not be loaded: the 500 page offers "Try again"
programs = data || [];

fillDropdowns();
readFilters();
shownLanguage = document.documentElement.lang;
showTotals();
show();
