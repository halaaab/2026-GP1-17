/* Startup Explorer: every startup, with a search box, sector / region / stage
   filters, colored cards, and pages of 12 (the same design as the Incubators
   & Accelerators Explorer).
   The filters are kept in the address (?q=...&sector=...), so a filtered list can be
   shared, and going back from a details page keeps them. */

import { t } from '../../../../shared/language.js';
import { icon } from '../../../../shared/layout.js';
import { showErrorPage } from '../../../../shared/errors.js';
import {
  loadStartups, listOf, listText, label, colorOf, detailsLink, descriptionOf, nameOf, logoOf, logoHtml, STAGES, SAUDI_REGIONS,
} from '../../../../shared/startups.js?v=4';

const PAGE_SIZE = 12;   // four rows of three cards

const cards = document.querySelector('#cards');
const search = document.querySelector('#search');
const sectorFilter = document.querySelector('#sector-filter');
const regionFilter = document.querySelector('#region-filter');
const stageFilter = document.querySelector('#stage-filter');
const empty = document.querySelector('#empty');
const pager = document.querySelector('#pager');

let startups = [];
let page = 0;
let loading = true;   // the spinner stays until the cards arrive

/* ---------- Small helpers ---------- */

// Startup text comes from the dataset, so it is escaped before it goes into HTML
function safe(text) {
  return String(text ?? '').replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

/* ---------- Filtering ---------- */

function matches(row, ignoreStage = false) {
  const words = search.value.trim().toLowerCase();
  const searchable = [row.startup_name, row.startup_name_ar, row.startup_description, row.startup_description_ar, row.tags, listText(row, 'sector')]
    .join(' ').toLowerCase();

  return (!words || searchable.includes(words))
    && (!sectorFilter.value || listOf(row, 'sector').includes(sectorFilter.value))
    && (!regionFilter.value || listOf(row, 'region').includes(regionFilter.value))
    && (ignoreStage || !stageFilter.value || listOf(row, 'stage').includes(stageFilter.value));
}

/* ---------- Drawing ---------- */

function showTotals() {
  const sectors = new Set(startups.flatMap((row) => listOf(row, 'sector')));
  const saudi = startups.filter((row) => listOf(row, 'region').some((region) => SAUDI_REGIONS.includes(region)));
  const total = (value, words, iconName) => `
    <div class="st-total">
      <span class="st-total-icon">${icon(iconName)}</span>
      <span class="st-total-text"><strong>${value}</strong><span>${words}</span></span>
    </div>`;
  document.querySelector('#totals').innerHTML = total(startups.length, t('startups.statStartups'), 'store')
    + total(sectors.size, t('startups.statSectors'), 'grid')
    + total(saudi.length, t('startups.statSaudi'), 'map');
}

/* The sector dropdown lists what the startups really have, most common first, with how
   many each has. The region dropdown lists the Saudi regions that have startups, in the
   order of the 13 regions (then any other place a startup has); a region shows up once
   a startup in it is added. Both start with "All". The values are the database's English words, so a
   choice stays chosen when the language changes; only the words are redrawn. */
function fillDropdowns() {
  const counts = (column) => {
    const found = new Map();
    startups.flatMap((row) => listOf(row, column)).forEach((value) => found.set(value, (found.get(value) || 0) + 1));
    return found;
  };

  const fill = (select, allKey, kind, pairs) => {
    const chosen = select.value;
    select.innerHTML = `<option value="">${t(allKey)} (${startups.length})</option>`
      + pairs.map(([value, count]) => `<option value="${safe(value)}">${safe(label(kind, value))} (${count})</option>`).join('');
    select.value = chosen;
  };

  const sectors = [...counts('sector')].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const regions = counts('region');
  const otherPlaces = [...regions.keys()].filter((region) => !SAUDI_REGIONS.includes(region)).sort();
  const regionPairs = [...SAUDI_REGIONS.filter((region) => regions.has(region)), ...otherPlaces].map((region) => [region, regions.get(region)]);

  fill(sectorFilter, 'startups.allSectors', 'sector', sectors);
  fill(regionFilter, 'startups.allRegions', 'region', regionPairs);

  // the stages go from the earliest to the latest
  const chosen = stageFilter.value;
  stageFilter.innerHTML = `<option value="">${t('startups.allStages')}</option>`
    + STAGES.filter((stage) => startups.some((row) => listOf(row, 'stage').includes(stage)))
      .map((stage) => `<option value="${safe(stage)}">${safe(label('stage', stage))}</option>`).join('');
  stageFilter.value = chosen;
}

// The stage dropdown says how many startups each stage has; the numbers follow the other filters
function showStageCounts() {
  const fitting = startups.filter((row) => matches(row, true));
  stageFilter.querySelectorAll('option').forEach((option) => {
    const count = option.value ? fitting.filter((row) => listOf(row, 'stage').includes(option.value)).length : fitting.length;
    const words = option.value ? label('stage', option.value) : t('startups.allStages');
    option.textContent = `${words} (${count})`;
  });
}

/* The sectors as small chips: the first two, then "+N" */
function sectorChips(row) {
  const sectors = listOf(row, 'sector');
  return sectors.slice(0, 2).map((sector) => `<span class="st-chip">${safe(label('sector', sector))}</span>`).join('')
    + (sectors.length > 2 ? `<span class="st-chip">+${sectors.length - 2}</span>` : '');
}

/* One card: a colored band with the funding stage and a big tilted square with
   the logo (or the initials), the name, what it does, the sector chips, and a footer with the
   region and an arrow. The color is the startup's own (colorOf), so the details
   page opens in the same color. */
function cardHtml(row, index) {
  const stage = listText(row, 'stage');
  return `
    <a class="st-card color-${colorOf(row)} fade-up" style="--i: ${index}" href="${detailsLink(row.startup_id)}">
      <div class="st-card-band">
        ${stage ? `<span class="st-card-stage">${safe(stage)}</span>` : ''}
        <span class="st-card-logo ${logoOf(row) ? 'has-logo' : ''}" aria-hidden="true">${logoHtml(row)}</span>
      </div>
      <div class="st-card-body">
        <h3 class="st-card-name">${safe(nameOf(row))}</h3>
        <p class="st-card-about">${safe(descriptionOf(row) || t('startups.noDescription'))}</p>
        <div class="st-card-chips">${sectorChips(row)}</div>
      </div>
      <div class="st-card-foot">
        <span class="st-card-region">${icon('map')}<span>${safe(listText(row, 'region', ', ') || '—')}</span></span>
        <span class="st-card-arrow" aria-label="${t('startups.viewDetails')}">${icon('chevron')}</span>
      </div>
    </a>`;
}

function show() {
  if (loading) return;

  const visible = startups.filter((row) => matches(row));
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  page = Math.min(page, pages - 1);
  const onThisPage = visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  cards.hidden = visible.length === 0;
  cards.innerHTML = onThisPage.map(cardHtml).join('');

  document.querySelector('#found').innerHTML = t('startups.found').replace('{n}', `<strong>${visible.length}</strong>`);
  showStageCounts();

  // Nothing matches: say so, with a button that clears the filters
  empty.hidden = visible.length > 0;
  document.querySelector('#clear-filters').hidden = !(search.value || sectorFilter.value || regionFilter.value || stageFilter.value);

  // "Showing 13–24 of 1128 startups"
  pager.hidden = visible.length === 0;
  document.querySelector('#showing').textContent = t('startups.showing')
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
  if (sectorFilter.value) params.set('sector', sectorFilter.value);
  if (regionFilter.value) params.set('region', regionFilter.value);
  if (stageFilter.value) params.set('stage', stageFilter.value);
  if (page > 0) params.set('page', page + 1);
  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
}

function readFilters() {
  const params = new URLSearchParams(window.location.search);
  search.value = params.get('q') || '';
  sectorFilter.value = params.get('sector') || '';
  regionFilter.value = params.get('region') || '';
  stageFilter.value = params.get('stage') || '';
  page = Math.max(0, (Number(params.get('page')) || 1) - 1);
}

/* ---------- Events ---------- */

function startOver() {
  page = 0;
  show();
}

search.addEventListener('input', startOver);
sectorFilter.addEventListener('change', startOver);
regionFilter.addEventListener('change', startOver);
stageFilter.addEventListener('change', startOver);

// The list already follows what is typed; pressing Enter in the search box takes the person down to it
document.querySelector('#filters').addEventListener('submit', (event) => {
  event.preventDefault();
  startOver();
  document.querySelector('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.querySelector('#clear-filters').addEventListener('click', () => {
  search.value = '';
  sectorFilter.value = '';
  regionFilter.value = '';
  stageFilter.value = '';
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

// the startups could not be loaded → the 500 page, with "Try again"
const rows = await loadStartups();
if (!rows) {
  showErrorPage(500);
} else {
  // startups with a logo first, then those without (each group stays A–Z, as loaded)
  startups = [...rows.filter((row) => logoOf(row)), ...rows.filter((row) => !logoOf(row))];
  loading = false;

  // the loading spinner gives way to the "no match" words (shown only when nothing matches)
  document.querySelector('#loading').remove();
  ['#empty-icon', '#empty-title', '#empty-text'].forEach((selector) => { document.querySelector(selector).hidden = false; });

  fillDropdowns();
  readFilters();
  showTotals();
  show();
}
