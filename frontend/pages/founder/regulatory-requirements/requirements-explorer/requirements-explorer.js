/* Regulatory Explorer: every requirement as a card, with a search box,
   authority and sector filters, and one pill per business stage. */

import { t } from '../../../../shared/language.js';
import { icon } from '../../../../shared/layout.js';
import {
  loadRequirements, field, label, sectorsOf, stagesOf, allStages, sectorsText, stagesText, detailsLink, fillFilter, SECTORS,
} from '../../../../shared/regulatory.js';

const cards = document.querySelector('#cards');
const empty = document.querySelector('#empty');
const search = document.querySelector('#search');
const authorityFilter = document.querySelector('#authority-filter');
const sectorFilter = document.querySelector('#sector-filter');
const stagesBox = document.querySelector('#stages');

let requirements = [];
let stage = '';           // the chosen business stage, '' = all stages
let loading = true;       // the spinner stays until the cards arrive
let loadFailed = false;

/* ---------- Filters ---------- */

// Does a requirement fit the search and the two dropdowns? (the stage pills are checked separately)
function fitsFilters(row) {
  const words = search.value.trim().toLowerCase();
  const text = [field(row, 'name'), row.name_en, field(row, 'authority'), field(row, 'category'), field(row, 'applies_when')]
    .join(' ').toLowerCase();

  // a requirement for "All" sectors applies to every sector
  const sectors = sectorsOf(row);
  const fitsSector = !sectorFilter.value || sectors.includes(sectorFilter.value) || sectors.includes('All');

  return text.includes(words)
    && (!authorityFilter.value || row.authority === authorityFilter.value)
    && fitsSector;
}

// Fills the two dropdowns, keeping what was chosen (the words change with the language)
function fillDropdowns() {
  // authority: the English name is the value, the label is in the page's language
  const authorities = new Map();
  requirements.forEach((row) => authorities.set(row.authority, field(row, 'authority')));
  fillFilter(authorityFilter, 'reg.authority', 'reg.allAuthorities',
    [...authorities].sort((a, b) => a[1].localeCompare(b[1])));

  fillFilter(sectorFilter, 'reg.sector', 'reg.sector.all',
    SECTORS.filter((sector) => sector !== 'All').map((sector) => [sector, label('sector', sector)]));
}

/* ---------- Stage pills ---------- */

function showStages(matching) {
  const count = (value) => matching.filter((row) => stagesOf(row).includes(value)).length;

  stagesBox.innerHTML = [
    `<button type="button" class="pill ${stage ? '' : 'is-active'}" data-stage="">${t('reg.allStages')} <span class="reg-pill-count">${matching.length}</span></button>`,
    ...allStages(requirements).map((value) => `
      <button type="button" class="pill ${stage === value ? 'is-active' : ''}" data-stage="${value}">
        ${label('stage', value)} <span class="reg-pill-count">${count(value)}</span>
      </button>`),
  ].join('');
}

stagesBox.addEventListener('click', (event) => {
  const button = event.target.closest('[data-stage]');
  if (!button) return;
  stage = button.dataset.stage;
  showAll();
});

/* ---------- Cards ---------- */

function showAll() {
  if (loading) return;

  const matching = requirements.filter(fitsFilters);
  const visible = stage ? matching.filter((row) => stagesOf(row).includes(stage)) : matching;

  showStages(matching);

  cards.innerHTML = visible.map((row) => `
    <a class="card card-hover reg-card" href="${detailsLink(row.requirement_id)}">
      <div class="reg-card-top">
        <span class="chip reg-card-stage"></span>
      </div>
      <span class="reg-card-icon">${icon('file')}</span>
      <h3 class="reg-card-title"></h3>
      <p class="reg-card-authority text-3">${icon('landmark')}<span></span></p>
      <p class="reg-card-summary text-2"></p>
      <div class="reg-card-foot">
        <span class="text-3 reg-card-sector"></span>
        <span class="link reg-card-more">${t('reg.viewDetails')} ${icon('chevron')}</span>
      </div>
    </a>`).join('');

  // the texts come from the database, so they are added as text
  cards.querySelectorAll('.reg-card').forEach((card, index) => {
    const row = visible[index];
    card.querySelector('.reg-card-stage').textContent = stagesText(row) || '—';
    card.querySelector('.reg-card-title').textContent = field(row, 'name');
    card.querySelector('.reg-card-authority span').textContent = field(row, 'authority');
    card.querySelector('.reg-card-summary').textContent = field(row, 'applies_when');
    card.querySelector('.reg-card-sector').textContent = sectorsText(row);
  });

  document.querySelector('#count').textContent = t('reg.count').replace('{n}', visible.length);
  empty.textContent = t(loadFailed ? 'reg.loadError' : 'reg.noMatch');
  empty.hidden = visible.length > 0;
}

function showStats() {
  const sectors = new Set(requirements.flatMap(sectorsOf).filter((sector) => sector !== 'All'));
  document.querySelector('#stat-requirements').textContent = requirements.length;
  document.querySelector('#stat-authorities').textContent = new Set(requirements.map((row) => row.authority)).size;
  document.querySelector('#stat-sectors').textContent = sectors.size;
}

search.addEventListener('input', showAll);
authorityFilter.addEventListener('change', showAll);
sectorFilter.addEventListener('change', showAll);

// names, labels and dropdowns are in the current language, so draw them again when it changes
document.addEventListener('darb:language', () => {
  if (loading) return;
  fillDropdowns();
  showAll();
});

/* ---------- Start ---------- */

document.querySelector('#search-icon').innerHTML = icon('search');
fillDropdowns();

const rows = await loadRequirements();
if (rows) {
  requirements = rows;
} else {
  loadFailed = true;
}
loading = false;
fillDropdowns();
showStats();
showAll();
