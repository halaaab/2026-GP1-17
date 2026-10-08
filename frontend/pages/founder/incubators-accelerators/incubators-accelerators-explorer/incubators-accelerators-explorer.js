/* Incubators & Accelerators Explorer: every support program, with a search box,
   type / sector / city filters, cards, and pages of 12.
   The layout follows the Regulatory & Licensing Explorer.
   The filters are kept in the address (?q=...&type=...), so a filtered list can be shared. */

import { t } from '../../../../shared/language.js';
import { icon } from '../../../../shared/layout.js';
import '../../../../shared/guard.js';
import {
  getPrograms, programType, sectorList, isOpenToAll, cityOf, clean, text, detailsLink, logoOf, logoHtml,
} from '../programs.js';

const PAGE_SIZE = 12;   // three rows of four cards

const cards = document.querySelector('#cards-view');
const search = document.querySelector('#search');
const sectorFilter = document.querySelector('#sector-filter');
const cityFilter = document.querySelector('#city-filter');
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
  const searchable = fields.flatMap((field) => [program[field], program[`${field}_ar`]])
    .map(clean).join(' ').toLowerCase();

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
  const total = (value, label) => `<div class="programs-total"><strong>${value}</strong><span>${label}</span></div>`;
  document.querySelector('#totals').innerHTML = total(programs.length, t('programs.totalPrograms'))
    + total(count('incubator'), t('programs.incubators'))
    + total(count('accelerator'), t('programs.accelerators'));
}

// The numbers inside the type buttons follow the other filters
function showTypeCounts() {
  const fitting = programs.filter((program) => matches(program, true));
  const count = (kind) => fitting.filter((program) => kind === 'all' || programType(program) === kind || programType(program) === 'both').length;
  document.querySelectorAll('[data-count]').forEach((element) => {
    element.textContent = count(element.dataset.count);
  });
}

// A small coins icon for the funding line (layout.js has none)
const COINS = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>';

// The sectors in the card's footer: "Open to all sectors", or the first two
function sectorText(program) {
  if (isOpenToAll(program)) return t('programs.openToAll');
  const sectors = sectorList(program);
  return sectors.slice(0, 2).join(t('programs.listComma')) + (sectors.length > 2 ? ` +${sectors.length - 2}` : '') || '—';
}

/* One card, laid out like the Regulatory Explorer's: a band with the type,
   the logo on its edge, the name, where it is (and its funding), what it does,
   and a footer with its sectors and "View details". The band is the program's own:
   its logo, blurred, fills it. */
function cardHtml(program, index) {
  const kind = programType(program);
  const funding = text(program, 'funding_investment');
  const logo = logoOf(program);
  return `
    <a class="programs-card fade-up" style="--i: ${index}" href="${detailsLink(program.support_org_id)}">
      <div class="programs-card-banner ${logo ? 'has-image' : ''}">
        ${logo ? `<span class="programs-card-glow" aria-hidden="true"><img class="programs-card-backdrop" src="${safe(logo)}" alt="" loading="lazy"></span>` : ''}
        <span class="programs-card-type">${typeLabel(program)}</span>
        ${logoHtml(program)}
      </div>
      <div class="programs-card-body">
        <h3 class="programs-card-name">${safe(text(program, 'name'))}</h3>
        <p class="programs-card-meta">${icon('map')}<span>${safe(text(program, 'location') || '—')}</span></p>
        ${funding ? `<p class="programs-card-meta">${COINS}<span>${safe(funding)}</span></p>` : ''}
        <p class="programs-card-about">${safe(text(program, 'description'))}</p>
      </div>
      <div class="programs-card-foot">
        <span class="programs-card-sectors">${safe(sectorText(program))}</span>
        <span class="programs-card-more">${t('programs.viewDetails')}${icon('chevron')}</span>
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

  document.querySelector('#found').textContent = t('programs.found').replace('{n}', visible.length);
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

  document.querySelectorAll('[data-type]').forEach((item) => item.classList.toggle('is-active', item.dataset.type === type));
}

/* ---------- Events ---------- */

function startOver() {
  page = 0;
  show();
}

search.addEventListener('input', startOver);
sectorFilter.addEventListener('change', startOver);
cityFilter.addEventListener('change', startOver);

document.querySelector('#type-filter').addEventListener('click', (event) => {
  const button = event.target.closest('[data-type]');
  if (!button) return;
  type = button.dataset.type;
  document.querySelectorAll('[data-type]').forEach((item) => item.classList.toggle('is-active', item === button));
  startOver();
});

document.querySelector('#clear-filters').addEventListener('click', () => {
  search.value = '';
  sectorFilter.value = '';
  cityFilter.value = '';
  type = 'all';
  document.querySelectorAll('[data-type]').forEach((item) => item.classList.toggle('is-active', item.dataset.type === 'all'));
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
programs = data || [];

fillDropdowns();
readFilters();
shownLanguage = document.documentElement.lang;
showTotals();
show();
