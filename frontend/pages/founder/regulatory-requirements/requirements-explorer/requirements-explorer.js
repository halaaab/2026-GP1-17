/* Regulatory Explorer: every requirement, with a search box, authority / sector /
   business-stage filters, colored cards with the authority's logo, and pages of 12
   (the same design as the Startup Explorer).
   The filters are kept in the address (?q=...&sector=...), so a filtered list can be
   shared, and going back from a details page keeps them. */

import { t } from '../../../../shared/language.js';
import { icon } from '../../../../shared/layout.js';
import { showErrorPage } from '../../../../shared/errors.js';
import {
  loadRequirements, field, label, sectorsOf, stagesOf, allStages, stagesText,
  colorOf, logoUrl, initials, detailsLink, SECTORS,
} from '../../../../shared/regulatory.js';

const PAGE_SIZE = 12;   // four rows of three cards

const cards = document.querySelector('#cards');
const search = document.querySelector('#search');
const authorityFilter = document.querySelector('#authority-filter');
const sectorFilter = document.querySelector('#sector-filter');
const stageFilter = document.querySelector('#stage-filter');
const empty = document.querySelector('#empty');
const pager = document.querySelector('#pager');

let requirements = [];
let page = 0;
let loading = true;   // the spinner stays until the cards arrive

/* ---------- Small helpers ---------- */

// Requirement text comes from the database, so it is escaped before it goes into HTML
function safe(text) {
  return String(text ?? '').replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

// A requirement for "All" sectors applies to every sector
function fitsSector(row, sector) {
  const sectors = sectorsOf(row);
  return sectors.includes(sector) || sectors.includes('All');
}

/* ---------- Filtering ---------- */

function matches(row, ignore = '') {
  const words = search.value.trim().toLowerCase();
  const searchable = [field(row, 'name'), row.name_en, field(row, 'authority'), field(row, 'category'), field(row, 'applies_when')]
    .join(' ').toLowerCase();

  return (!words || searchable.includes(words))
    && (ignore === 'authority' || !authorityFilter.value || row.authority === authorityFilter.value)
    && (ignore === 'sector' || !sectorFilter.value || fitsSector(row, sectorFilter.value))
    && (ignore === 'stage' || !stageFilter.value || stagesOf(row).includes(stageFilter.value));
}

/* ---------- Drawing ---------- */

function showTotals() {
  const sectors = new Set(requirements.flatMap(sectorsOf).filter((sector) => sector !== 'All'));
  const total = (value, words, iconName) => `
    <div class="reg-total">
      <span class="reg-total-icon">${icon(iconName)}</span>
      <span class="reg-total-text"><strong>${value}</strong><span>${words}</span></span>
    </div>`;
  document.querySelector('#totals').innerHTML = total(requirements.length, t('reg.statRequirements'), 'file')
    + total(new Set(requirements.map((row) => row.authority)).size, t('reg.statAuthorities'), 'landmark')
    + total(sectors.size, t('reg.statSectors'), 'grid');
}

/* Fills a dropdown: its name (shown while nothing is chosen), "All …", then each option
   with how many requirements it has. The values are the database's English words,
   so a choice stays chosen when the language changes; only the words are redrawn. */
function fillSelect(select, nameKey, allKey, options) {
  const chosen = select.value;
  const pickedAll = select.selectedIndex === 1;
  select.innerHTML = `<option value="" hidden>${t(nameKey)}</option><option value="">${t(allKey)}</option>`
    + options.map(([value]) => `<option value="${safe(value)}"></option>`).join('');
  if (chosen && options.some(([value]) => value === chosen)) select.value = chosen;
  else select.selectedIndex = pickedAll ? 1 : 0;
}

function fillDropdowns() {
  const authorities = [...new Set(requirements.map((row) => row.authority).filter(Boolean))].map((value) => [value]);
  fillSelect(authorityFilter, 'reg.authority', 'reg.allAuthorities', authorities);
  fillSelect(sectorFilter, 'reg.sector', 'reg.sector.all', SECTORS.filter((sector) => sector !== 'All').map((value) => [value]));
  fillSelect(stageFilter, 'reg.stage', 'reg.allStages', allStages(requirements).map((value) => [value]));
}

/* The words in each dropdown, with how many requirements each choice has. The numbers
   follow the other filters, so they always say what choosing that option would show. */
function showCounts() {
  const write = (select, allKey, ignore, fits, words) => {
    const fitting = requirements.filter((row) => matches(row, ignore));
    [...select.options].forEach((option, index) => {
      if (index === 0) return;   // the name ("Sector") has no number
      const text = index === 1 ? t(allKey) : words(option.value);
      const count = index === 1 ? fitting.length : fitting.filter((row) => fits(row, option.value)).length;
      option.textContent = `${text} (${count})`;
    });
  };

  const authorityWords = new Map(requirements.map((row) => [row.authority, field(row, 'authority')]));
  write(authorityFilter, 'reg.allAuthorities', 'authority', (row, value) => row.authority === value, (value) => authorityWords.get(value) || value);
  write(sectorFilter, 'reg.sector.all', 'sector', fitsSector, (value) => label('sector', value));
  write(stageFilter, 'reg.allStages', 'stage', (row, value) => stagesOf(row).includes(value), (value) => label('stage', value));

  // authorities from A to Z in the page's language
  const chosen = authorityFilter.value;
  const sorted = [...authorityFilter.options].slice(2).sort((a, b) => a.textContent.localeCompare(b.textContent));
  sorted.forEach((option) => authorityFilter.add(option));
  authorityFilter.value = chosen;
}

/* The sectors as small chips: the first two, then "+N" */
function sectorChips(row) {
  const sectors = sectorsOf(row);
  return sectors.slice(0, 2).map((sector) => `<span class="reg-chip">${safe(label('sector', sector))}</span>`).join('')
    + (sectors.length > 2 ? `<span class="reg-chip">+${sectors.length - 2}</span>` : '');
}

/* The authority's logo on white, or a tilted colored square with its initials */
function logoHtml(row) {
  const logo = logoUrl(row);
  return logo
    ? `<span class="reg-card-logo has-logo"><img src="${safe(logo)}" alt="" loading="lazy"></span>`
    : `<span class="reg-card-logo is-initials" aria-hidden="true">${safe(initials(row.authority))}</span>`;
}

/* One card: a colored band with the business stage and the authority's logo, the name,
   when it applies, the sector chips, and a footer with the authority and an arrow.
   The color is the requirement's own (colorOf), so the details page opens in the same color. */
function cardHtml(row, index) {
  const stage = stagesText(row);
  return `
    <a class="reg-card color-${colorOf(row)} fade-up" style="--i: ${index}" href="${detailsLink(row.requirement_id)}">
      <div class="reg-card-band">
        ${stage ? `<span class="reg-card-stage">${safe(stage)}</span>` : ''}
        ${logoHtml(row)}
      </div>
      <div class="reg-card-body">
        <h3 class="reg-card-name">${safe(field(row, 'name'))}</h3>
        <p class="reg-card-about">${safe(field(row, 'applies_when'))}</p>
        <div class="reg-card-chips">${sectorChips(row)}</div>
      </div>
      <div class="reg-card-foot">
        <span class="reg-card-authority">${icon('landmark')}<span>${safe(field(row, 'authority') || '—')}</span></span>
        <span class="reg-card-arrow" aria-label="${t('reg.viewDetails')}">${icon('chevron')}</span>
      </div>
    </a>`;
}

function show() {
  if (loading) return;

  const visible = requirements.filter((row) => matches(row));
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  page = Math.min(page, pages - 1);
  const onThisPage = visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  cards.hidden = visible.length === 0;
  cards.innerHTML = onThisPage.map(cardHtml).join('');

  document.querySelector('#found').innerHTML = t('reg.found').replace('{n}', `<strong>${visible.length}</strong>`);
  showCounts();

  // Nothing matches: say so, with a button that clears the filters
  empty.hidden = visible.length > 0;
  document.querySelector('#clear-filters').hidden = !(search.value || authorityFilter.value || sectorFilter.value || stageFilter.value);

  // "Showing 13–24 of 44 requirements"
  pager.hidden = visible.length === 0;
  document.querySelector('#showing').textContent = t('reg.showing')
    .replace('{from}', page * PAGE_SIZE + 1)
    .replace('{to}', page * PAGE_SIZE + onThisPage.length)
    .replace('{n}', visible.length);
  document.querySelector('#previous').disabled = page === 0;
  document.querySelector('#next').disabled = page >= pages - 1;

  rememberFilters();
}

/* ---------- The address keeps the filters ---------- */

function rememberFilters() {
  const params = new URLSearchParams();
  if (search.value) params.set('q', search.value);
  if (authorityFilter.value) params.set('authority', authorityFilter.value);
  if (sectorFilter.value) params.set('sector', sectorFilter.value);
  if (stageFilter.value) params.set('stage', stageFilter.value);
  if (page > 0) params.set('page', page + 1);
  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
}

function readFilters() {
  const params = new URLSearchParams(window.location.search);
  search.value = params.get('q') || '';
  authorityFilter.value = params.get('authority') || '';
  sectorFilter.value = params.get('sector') || '';
  stageFilter.value = params.get('stage') || '';
  // a value that is not in the list leaves the dropdown on its name
  [authorityFilter, sectorFilter, stageFilter].forEach((select) => {
    if (select.selectedIndex < 0) select.selectedIndex = 0;
  });
  page = Math.max(0, (Number(params.get('page')) || 1) - 1);
}

/* ---------- Events ---------- */

function startOver() {
  page = 0;
  show();
}

search.addEventListener('input', startOver);
authorityFilter.addEventListener('change', startOver);
sectorFilter.addEventListener('change', startOver);
stageFilter.addEventListener('change', startOver);

// The list already follows what is typed; the Search button takes the person down to it
document.querySelector('#filters').addEventListener('submit', (event) => {
  event.preventDefault();
  startOver();
  document.querySelector('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.querySelector('#clear-filters').addEventListener('click', () => {
  search.value = '';
  [authorityFilter, sectorFilter, stageFilter].forEach((select) => { select.selectedIndex = 0; });
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

// labels are in the current language, so draw them again when it changes (the choices stay)
document.addEventListener('darb:language', () => {
  if (loading) return;
  fillDropdowns();
  showTotals();
  show();
});

/* ---------- Start ---------- */

document.querySelector('#search-icon').innerHTML = icon('search');
document.querySelector('#empty-icon').innerHTML = icon('search');

// the requirements could not be loaded → the 500 page, with "Try again"
const rows = await loadRequirements();
if (!rows) {
  showErrorPage(500);
} else {
  requirements = rows;
  loading = false;

  // the loading spinner gives way to the "no match" words (shown only when nothing matches)
  document.querySelector('#loading').remove();
  ['#empty-icon', '#empty-title', '#empty-text'].forEach((selector) => { document.querySelector(selector).hidden = false; });

  fillDropdowns();
  readFilters();
  showTotals();
  show();
}
