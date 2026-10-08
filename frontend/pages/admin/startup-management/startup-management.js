/* Startup management: the startups founders see in the Startup Explorer.
   Search, three filters, add / edit in a side panel, and delete after a confirmation. */

import { t } from '../../../shared/language.js';
import { icon } from '../../../shared/layout.js';
import { showToast } from '../../../shared/ui.js';
import { supabase } from '../../../shared/supabase.js';
import { getCurrentUser } from '../../../shared/auth.js';
import { showErrorPage } from '../../../shared/errors.js';
import {
  loadStartups, listOf, listText, label, allValues, initials, detailsLink, fillFilter, dateText,
  SECTORS, STAGES, REGIONS, MARKETS,
} from '../../../shared/startups.js';
import '../../../shared/guard.js';

const rows = document.querySelector('#rows');
const empty = document.querySelector('#empty');
const search = document.querySelector('#search');
const moreButton = document.querySelector('#more');
const filters = {
  sector: document.querySelector('#sector-filter'),
  stage: document.querySelector('#stage-filter'),
  region: document.querySelector('#region-filter'),
};
const panel = document.querySelector('#startup-panel');
const form = document.querySelector('#startup-form');
const saveButton = document.querySelector('#save');
const deleteModal = document.querySelector('#delete-modal');
const deleteConfirm = document.querySelector('#delete-confirm');

// The text columns the form edits: each one has an input with id "f-<column>"
const TEXT_COLUMNS = [
  'startup_name', 'startup_description', 'country', 'products_services', 'tags',
  'website', 'ecosystemsa_profile_url', 'description_source',
];

// The columns chosen with check boxes, and the fixed list of choices for each
const CHOICE_COLUMNS = { sector: SECTORS, stage: STAGES, region: REGIONS, target_market: MARKETS };
const KINDS = { sector: 'sector', stage: 'stage', region: 'region', target_market: 'market' };

const URL_COLUMNS = ['website', 'ecosystemsa_profile_url', 'description_source'];

// More than a thousand startups: the table shows them a page at a time
const PAGE_SIZE = 50;

let startups = [];
let shown = PAGE_SIZE;    // how many rows are on screen
let editingId = null;     // the startup open in the panel, null when adding a new one
let deleteId = null;      // the startup the delete pop-up is asking about
let loading = true;       // the spinner stays until the rows arrive

function findStartup(id) {
  return startups.find((row) => row.startup_id === id);
}

const input = (column) => document.querySelector(`#f-${column}`);

/* ---------- Filters ---------- */

function fillFilters() {
  const pairs = (column, order) => allValues(startups, column, order).map((value) => [value, label(KINDS[column], value)]);
  fillFilter(filters.sector, 'startups.sector', 'startups.allSectors', pairs('sector', SECTORS).sort((a, b) => a[1].localeCompare(b[1])));
  fillFilter(filters.stage, 'startups.stage', 'startups.allStages', pairs('stage', STAGES));
  fillFilter(filters.region, 'startups.region', 'startups.allRegions', pairs('region', REGIONS));
}

function fits(row) {
  const words = search.value.trim().toLowerCase();
  const text = [row.startup_id, row.startup_name, row.country, row.tags, row.website].join(' ').toLowerCase();

  return text.includes(words)
    && Object.entries(filters).every(([column, select]) => !select.value || listOf(row, column).includes(select.value));
}

/* ---------- The table ---------- */

function showRows() {
  if (loading) return;

  const visible = startups.filter(fits);
  const page = visible.slice(0, shown);

  rows.innerHTML = page.map((row) => `
    <tr class="sm-row" data-id="${row.startup_id}" tabindex="0">
      <td>
        <div class="sm-cell">
          <span class="sm-logo"></span>
          <div>
            <span class="cell-title"></span>
            <span class="cell-detail"></span>
          </div>
        </div>
      </td>
      <td class="hide-small text-2 sm-sector"></td>
      <td class="hide-small"><span class="chip chip-teal sm-stage"></span></td>
      <td class="hide-small text-2 sm-market"></td>
      <td class="hide-small text-2">${dateText(row.updated_at || row.created_at)}</td>
      <td>
        <div class="sm-actions">
          <button type="button" class="btn-icon" data-action="edit" aria-label="${t('founders.edit')}">${icon('pencil')}</button>
          <button type="button" class="btn-icon is-danger" data-action="delete" aria-label="${t('startupAdmin.delete')}">${icon('trash')}</button>
        </div>
      </td>
    </tr>`).join('');

  // the texts come from the database, so they are added as text
  rows.querySelectorAll('tr').forEach((tr, index) => {
    const row = page[index];
    const stage = listText(row, 'stage');
    tr.querySelector('.sm-logo').textContent = initials(row.startup_name);
    tr.querySelector('.cell-title').textContent = row.startup_name;
    tr.querySelector('.cell-detail').textContent = [row.startup_id, listText(row, 'region', ', ')].filter(Boolean).join(' · ');
    tr.querySelector('.sm-sector').textContent = listText(row, 'sector', ', ') || '—';
    tr.querySelector('.sm-stage').textContent = stage;
    tr.querySelector('.sm-stage').hidden = !stage;
    tr.querySelector('.sm-market').textContent = listText(row, 'target_market', ', ') || '—';
  });

  document.querySelector('#count').textContent = t('startupAdmin.showing')
    .replace('{shown}', page.length).replace('{total}', visible.length);
  empty.textContent = t('startups.noMatch');
  empty.hidden = visible.length > 0;
  moreButton.hidden = visible.length <= shown;
}

rows.addEventListener('click', (event) => {
  const tr = event.target.closest('[data-id]');
  if (!tr) return;
  if (event.target.closest('[data-action="delete"]')) askToDelete(tr.dataset.id);
  else openForm(tr.dataset.id);
});

rows.addEventListener('keydown', (event) => {
  const tr = event.target.closest('[data-id]');
  if (tr && event.target === tr && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    openForm(tr.dataset.id);
  }
});

moreButton.addEventListener('click', () => {
  shown += PAGE_SIZE;
  showRows();
});

/* ---------- Add / edit form ---------- */

function showFieldError(column, key) {
  const message = document.querySelector(`#f-${column}-error`);
  input(column)?.classList.toggle('is-error', Boolean(key));
  message.textContent = key ? t(key) : '';
  message.hidden = !key;
}

function clearErrors() {
  ['startup_name', 'sector', ...URL_COLUMNS].forEach((column) => showFieldError(column, ''));
}

// The boxes ticked in one group, as the database writes them: "Seed; Series A"
function tickedText(column) {
  return [...document.querySelectorAll(`[name="${column}"]:checked`)].map((box) => box.value).join('; ');
}

// The check boxes, in the page's language. The fixed list comes first, then any
// other value already in the data, so editing a startup never loses one.
function fillFormChoices() {
  Object.entries(CHOICE_COLUMNS).forEach(([column, order]) => {
    const ticked = tickedText(column).split('; ');
    const values = [...new Set([...order, ...allValues(startups, column, order)])];

    document.querySelector(`#f-${column}`).innerHTML = values.map((value) => `
      <label class="check"><input type="checkbox" name="${column}" value="${value}"> ${label(KINDS[column], value)}</label>`).join('');
    document.querySelectorAll(`[name="${column}"]`).forEach((box) => { box.checked = ticked.includes(box.value); });
  });

  // suggestions while typing a country (the ones already used)
  const countries = [...new Set(startups.map((row) => row.country).filter(Boolean))].sort();
  document.querySelector('#country-list').innerHTML = countries.map((country) => `<option value="${country}">`).join('');
}

// Opens the panel to edit a startup, or to add a new one when id is null
function openForm(id) {
  editingId = id;
  const row = id ? findStartup(id) : {};

  fillFormChoices();
  TEXT_COLUMNS.forEach((column) => { input(column).value = row[column] ?? ''; });
  Object.keys(CHOICE_COLUMNS).forEach((column) => {
    const values = listOf(row, column);
    document.querySelectorAll(`[name="${column}"]`).forEach((box) => { box.checked = values.includes(box.value); });
  });
  clearErrors();
  showFormWords();

  panel.querySelector('.panel-body').scrollTop = 0;
  panel.classList.add('is-open');
  input('startup_name').focus();
}

// The panel title, the line under it and the save button depend on add or edit
function showFormWords() {
  const row = editingId ? findStartup(editingId) : null;
  document.querySelector('#panel-title').textContent = t(row ? 'startupAdmin.editTitle' : 'startupAdmin.addTitle');
  document.querySelector('#panel-sub').textContent = row
    ? t('startupAdmin.lastUpdated').replace('{date}', dateText(row.updated_at || row.created_at))
    : t('startupAdmin.addSub');
  saveButton.textContent = t(row ? 'founders.save' : 'startupAdmin.add');

  // "View as founder" opens the startup's page in the Startup Explorer
  const view = document.querySelector('#panel-view');
  view.hidden = !row;
  view.href = row ? detailsLink(row.startup_id) : '#';
}

function isWebAddress(value) {
  return !value || /^https?:\/\/\S+$/.test(value);
}

// The next free id: ST_1128 → ST_1129
function nextId() {
  const highest = Math.max(0, ...startups.map((row) => Number((row.startup_id.match(/^ST_(\d+)$/) || [])[1]) || 0));
  return `ST_${String(highest + 1).padStart(3, '0')}`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const values = {};
  TEXT_COLUMNS.forEach((column) => {
    // an empty answer is saved as "no value", never as an empty text
    values[column] = input(column).value.trim() || null;
  });
  Object.keys(CHOICE_COLUMNS).forEach((column) => { values[column] = tickedText(column) || null; });

  // products: one per line or separated by ";", saved separated by ";"
  if (values.products_services) {
    values.products_services = values.products_services.split(/[;\n]/).map((item) => item.trim()).filter(Boolean).join('; ');
  }

  // check the answers here first, so the admin sees each problem next to its field
  clearErrors();
  const problems = [];
  if (!values.startup_name) problems.push(['startup_name', 'startupAdmin.nameRequired']);
  if (!values.sector) problems.push(['sector', 'startupAdmin.sectorRequired']);
  URL_COLUMNS.forEach((column) => {
    if (!isWebAddress(values[column])) problems.push([column, 'regAdmin.urlError']);
  });
  problems.forEach(([column, key]) => showFieldError(column, key));
  if (problems.length) return;

  saveButton.classList.add('is-loading');
  let result;
  if (editingId) {
    result = await supabase.from('startups').update(values).eq('startup_id', editingId).select().single();
  } else {
    const user = await getCurrentUser();
    result = await supabase.from('startups')
      .insert({ ...values, startup_id: nextId(), created_by_admin_id: user?.id ?? null })
      .select().single();
  }
  saveButton.classList.remove('is-loading');

  if (result.error) {
    console.error('startups:', result.error.message);
    showToast(t('founders.actionError'), 'risk');
    return;
  }

  if (editingId) {
    Object.assign(findStartup(editingId), result.data);
  } else {
    startups.push(result.data);
    startups.sort((a, b) => a.startup_name.localeCompare(b.startup_name));
  }
  panel.classList.remove('is-open');
  showToast(t(editingId ? 'founders.saved' : 'startupAdmin.added'), 'good');
  editingId = null;
  fillFilters();
  showRows();
});

document.querySelector('#add').addEventListener('click', () => openForm(null));

/* ---------- Delete ---------- */

function deleteText() {
  return t('startupAdmin.deleteText').replace('{name}', findStartup(deleteId).startup_name);
}

function askToDelete(id) {
  deleteId = id;
  document.querySelector('#delete-text').textContent = deleteText();
  deleteModal.showModal();
}

deleteConfirm.addEventListener('click', async () => {
  const id = deleteId;

  deleteConfirm.classList.add('is-loading');
  const { error } = await supabase.from('startups').delete().eq('startup_id', id);
  deleteConfirm.classList.remove('is-loading');
  deleteModal.close();

  if (error) {
    console.error('startups:', error.message);
    showToast(t('founders.actionError'), 'risk');
    return;
  }

  startups = startups.filter((row) => row.startup_id !== id);
  if (editingId === id) panel.classList.remove('is-open');
  showToast(t('startupAdmin.deleted'), 'good');
  fillFilters();
  showRows();
});

/* ---------- Search, filters, language ---------- */

// a new search or filter starts again from the first page of rows
function filterChanged() {
  shown = PAGE_SIZE;
  showRows();
}

search.addEventListener('input', filterChanged);
Object.values(filters).forEach((select) => select.addEventListener('change', filterChanged));

// labels, dates and dropdowns are in the current language, so draw them again when it changes
// (the form keeps what the admin typed and ticked)
document.addEventListener('darb:language', () => {
  if (loading) return;
  fillFilters();
  showRows();
  fillFormChoices();
  showFormWords();
  if (deleteModal.open) document.querySelector('#delete-text').textContent = deleteText();
});

/* ---------- Start ---------- */

document.querySelector('#search-icon').innerHTML = icon('search');
document.querySelector('#add-icon').innerHTML = icon('plus');
document.querySelector('#panel-close').innerHTML = icon('close');
document.querySelector('#delete-icon').innerHTML = icon('trash');
fillFilters();

// the startups could not be loaded → the 500 page, with "Try again"
const data = await loadStartups();
if (!data) {
  showErrorPage(500);
} else {
  startups = data;
  loading = false;
  fillFilters();
  showRows();
}
