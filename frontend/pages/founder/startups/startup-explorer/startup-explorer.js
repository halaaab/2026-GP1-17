/* Startup Explorer: every startup as a card, with a search box, sector and
   region filters, and one pill per funding stage. */

import { t } from '../../../../shared/language.js';
import { icon } from '../../../../shared/layout.js';
import { showErrorPage } from '../../../../shared/errors.js';
import {
  loadStartups, listOf, listText, label, allValues, initials, detailsLink, fillFilter, SECTORS, STAGES, REGIONS,
} from '../../../../shared/startups.js';

const cards = document.querySelector('#cards');
const empty = document.querySelector('#empty');
const search = document.querySelector('#search');
const sectorFilter = document.querySelector('#sector-filter');
const regionFilter = document.querySelector('#region-filter');
const stagesBox = document.querySelector('#stages');
const moreButton = document.querySelector('#more');

// There are more than a thousand startups: the cards are shown a page at a time
const PAGE_SIZE = 48;
const SAUDI_REGIONS = REGIONS.slice(0, 6);

let startups = [];
let stage = '';           // the chosen funding stage, '' = all stages
let shown = PAGE_SIZE;    // how many cards are on screen
let loading = true;       // the spinner stays until the cards arrive

/* ---------- Filters ---------- */

// Does a startup fit the search and the two dropdowns? (the stage pills are checked separately)
function fitsFilters(row) {
  const words = search.value.trim().toLowerCase();
  const text = [row.startup_name, row.startup_description, row.tags, row.products_services, listText(row, 'sector')]
    .join(' ').toLowerCase();

  return text.includes(words)
    && (!sectorFilter.value || listOf(row, 'sector').includes(sectorFilter.value))
    && (!regionFilter.value || listOf(row, 'region').includes(regionFilter.value));
}

// Fills the two dropdowns, keeping what was chosen (the words change with the language)
function fillDropdowns() {
  fillFilter(sectorFilter, 'startups.sector', 'startups.allSectors',
    allValues(startups, 'sector', SECTORS).map((value) => [value, label('sector', value)])
      .sort((a, b) => a[1].localeCompare(b[1])));
  fillFilter(regionFilter, 'startups.region', 'startups.allRegions',
    allValues(startups, 'region', REGIONS).map((value) => [value, label('region', value)]));
}

/* ---------- Stage pills ---------- */

function showStages(matching) {
  const count = (value) => matching.filter((row) => listOf(row, 'stage').includes(value)).length;

  stagesBox.innerHTML = [
    `<button type="button" class="pill ${stage ? '' : 'is-active'}" data-stage="">${t('startups.allStages')} <span class="st-pill-count">${matching.length}</span></button>`,
    ...allValues(startups, 'stage', STAGES).map((value) => `
      <button type="button" class="pill ${stage === value ? 'is-active' : ''}" data-stage="${value}">
        ${label('stage', value)} <span class="st-pill-count">${count(value)}</span>
      </button>`),
  ].join('');
}

stagesBox.addEventListener('click', (event) => {
  const button = event.target.closest('[data-stage]');
  if (!button) return;
  stage = button.dataset.stage;
  shown = PAGE_SIZE;
  showAll();
});

/* ---------- Cards ---------- */

function showAll() {
  if (loading) return;

  const matching = startups.filter(fitsFilters);
  const visible = stage ? matching.filter((row) => listOf(row, 'stage').includes(stage)) : matching;
  const page = visible.slice(0, shown);

  showStages(matching);

  cards.innerHTML = page.map((row) => `
    <a class="card card-hover st-card" href="${detailsLink(row.startup_id)}">
      <div class="st-card-top">
        <span class="chip st-card-stage" ${row.stage ? '' : 'hidden'}></span>
      </div>
      <span class="st-logo"></span>
      <h3 class="st-card-title"></h3>
      <p class="st-card-sector text-3">${icon('briefcase')}<span></span></p>
      <p class="st-card-summary text-2"></p>
      <div class="st-card-foot">
        <span class="text-3 st-card-region"></span>
        <span class="link st-card-more">${t('startups.viewDetails')} ${icon('chevron')}</span>
      </div>
    </a>`).join('');

  // the texts come from the database, so they are added as text
  cards.querySelectorAll('.st-card').forEach((card, index) => {
    const row = page[index];
    card.querySelector('.st-card-stage').textContent = listText(row, 'stage');
    card.querySelector('.st-logo').textContent = initials(row.startup_name);
    card.querySelector('.st-card-title').textContent = row.startup_name;
    card.querySelector('.st-card-sector span').textContent = listText(row, 'sector', ', ') || t('startups.noSector');
    card.querySelector('.st-card-summary').textContent = row.startup_description || t('startups.noDescription');
    card.querySelector('.st-card-region').textContent = listText(row, 'region', ', ');
  });

  document.querySelector('#count').textContent = t('startups.count').replace('{n}', visible.length);
  empty.textContent = t('startups.noMatch');
  empty.hidden = visible.length > 0;
  moreButton.hidden = visible.length <= shown;
}

function showStats() {
  const sectors = new Set(startups.flatMap((row) => listOf(row, 'sector')));
  const saudi = startups.filter((row) => listOf(row, 'region').some((region) => SAUDI_REGIONS.includes(region)));
  document.querySelector('#stat-startups').textContent = startups.length;
  document.querySelector('#stat-sectors').textContent = sectors.size;
  document.querySelector('#stat-saudi').textContent = saudi.length;
}

// a new search or filter starts again from the first page of cards
function filterChanged() {
  shown = PAGE_SIZE;
  showAll();
}

search.addEventListener('input', filterChanged);
sectorFilter.addEventListener('change', filterChanged);
regionFilter.addEventListener('change', filterChanged);

moreButton.addEventListener('click', () => {
  shown += PAGE_SIZE;
  showAll();
});

// labels and dropdowns are in the current language, so draw them again when it changes
document.addEventListener('darb:language', () => {
  if (loading) return;
  fillDropdowns();
  showAll();
});

/* ---------- Start ---------- */

document.querySelector('#search-icon').innerHTML = icon('search');
fillDropdowns();

// the startups could not be loaded → the 500 page, with "Try again"
const rows = await loadStartups();
if (!rows) {
  showErrorPage(500);
} else {
  startups = rows;
  loading = false;
  fillDropdowns();
  showStats();
  showAll();
}
