/* Regulatory management: the regulatory requirements founders see in the
   Regulatory Explorer. Search, four filters, add / edit in a side panel,
   and delete after a confirmation. */

import { t } from '../../../shared/language.js';
import { icon } from '../../../shared/layout.js';
import { showToast } from '../../../shared/ui.js';
import { supabase } from '../../../shared/supabase.js';
import { getCurrentUser } from '../../../shared/auth.js';
import {
  loadRequirements, field, label, sectorsOf, stagesOf, allStages, sectorsText, dateText, fillFilter, authorityColors,
  SECTORS, MANDATORY, STATUSES,
} from '../../../shared/regulatory.js';
import '../../../shared/guard.js';

const rows = document.querySelector('#rows');
const empty = document.querySelector('#empty');
const search = document.querySelector('#search');
const filters = {
  authority: document.querySelector('#authority-filter'),
  sector: document.querySelector('#sector-filter'),
  type: document.querySelector('#type-filter'),
  stage: document.querySelector('#stage-filter'),
};
const panel = document.querySelector('#reg-panel');
const form = document.querySelector('#reg-form');
const saveButton = document.querySelector('#save');
const deleteModal = document.querySelector('#delete-modal');
const deleteConfirm = document.querySelector('#delete-confirm');

// The text columns the form edits: each one has an input with id "f-<column>"
const TEXT_COLUMNS = [
  'name_en', 'name_ar', 'authority', 'authority_ar', 'category', 'category_ar', 'business_stage',
  'mandatory', 'regulatory_status', 'applies_when', 'applies_when_ar',
  'what_darb_should_surface', 'what_darb_should_surface_ar', 'fees_thresholds', 'fees_thresholds_ar',
  'official_source_url', 'service_url', 'last_verified', 'founder_trigger_fields', 'notes',
];

// An id like GEN-024 or FOOD-009: capital letters, a dash, numbers
const ID_RULE = /^[A-Z]{2,6}-\d{3}$/;

let requirements = [];
let editingId = null;     // the requirement open in the panel, null when adding a new one
let deleteId = null;      // the requirement the delete pop-up is asking about
let loading = true;       // the spinner stays until the rows arrive
let loadFailed = false;

function findRequirement(id) {
  return requirements.find((row) => row.requirement_id === id);
}

const input = (column) => document.querySelector(`#f-${column}`);

/* ---------- Filters ---------- */

// [english value, words in the page's language], sorted by the words
function pairs(columnEn, columnName) {
  const found = new Map();
  requirements.forEach((row) => {
    if (row[columnEn]) found.set(row[columnEn], field(row, columnName));
  });
  return [...found].sort((a, b) => a[1].localeCompare(b[1]));
}

function fillFilters() {
  fillFilter(filters.authority, 'reg.authority', 'reg.allAuthorities', pairs('authority', 'authority'));
  fillFilter(filters.sector, 'reg.sector', 'reg.sector.all', SECTORS.filter((s) => s !== 'All').map((s) => [s, label('sector', s)]));
  fillFilter(filters.type, 'regAdmin.type', 'regAdmin.allTypes', pairs('category', 'category'));
  fillFilter(filters.stage, 'reg.stage', 'reg.allStages', allStages(requirements).map((s) => [s, label('stage', s)]));
}

function fits(row) {
  const words = search.value.trim().toLowerCase();
  const text = [row.requirement_id, row.name_en, row.name_ar, row.authority, row.authority_ar, row.category, row.category_ar]
    .join(' ').toLowerCase();
  const sectors = sectorsOf(row);

  return text.includes(words)
    && (!filters.authority.value || row.authority === filters.authority.value)
    && (!filters.sector.value || sectors.includes(filters.sector.value) || sectors.includes('All'))
    && (!filters.type.value || row.category === filters.type.value)
    && (!filters.stage.value || stagesOf(row).includes(filters.stage.value));
}

/* ---------- The table ---------- */

function showRows() {
  if (loading) return;

  const visible = requirements.filter(fits);
  const colors = authorityColors(requirements);   // one pastel color per authority

  rows.innerHTML = visible.map((row) => `
    <tr class="reg-row" data-id="${row.requirement_id}" tabindex="0">
      <td>
        <span class="cell-title"></span>
        <span class="cell-detail"></span>
      </td>
      <td class="hide-small"><span class="chip chip-pastel-${colors.get(row.authority) || 8} reg-authority"></span></td>
      <td class="hide-small text-2 reg-type"></td>
      <td class="hide-small text-2 reg-applies"></td>
      <td class="hide-small text-2">${dateText(row.updated_at || row.created_at)}</td>
      <td>
        <div class="reg-actions">
          <button type="button" class="btn-icon" data-action="edit" aria-label="${t('founders.edit')}">${icon('pencil')}</button>
          <button type="button" class="btn-icon is-danger" data-action="delete" aria-label="${t('regAdmin.delete')}">${icon('trash')}</button>
        </div>
      </td>
    </tr>`).join('');

  // the texts come from the database, so they are added as text
  rows.querySelectorAll('tr').forEach((tr, index) => {
    const row = visible[index];
    tr.querySelector('.cell-title').textContent = field(row, 'name');
    tr.querySelector('.cell-detail').textContent = `${row.requirement_id} · ${field(row, 'category')}`;
    tr.querySelector('.reg-authority').textContent = field(row, 'authority') || '—';
    tr.querySelector('.reg-type').textContent = field(row, 'category') || '—';
    tr.querySelector('.reg-applies').textContent = sectorsText(row);
  });

  empty.textContent = t(loadFailed ? 'reg.loadError' : 'reg.noMatch');
  empty.hidden = visible.length > 0;
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

/* ---------- Add / edit form ---------- */

function showFieldError(column, key) {
  const message = document.querySelector(`#f-${column}-error`);
  input(column)?.classList.toggle('is-error', Boolean(key));
  message.textContent = key ? t(key) : '';
  message.hidden = !key;
}

function clearErrors() {
  ['id', 'name_en', 'sectors', 'official_source_url', 'service_url'].forEach((column) => showFieldError(column, ''));
}

// The two dropdowns and the sector boxes, in the page's language
function fillFormChoices() {
  const mandatory = input('mandatory').value;
  const status = input('regulatory_status').value;
  input('mandatory').innerHTML = MANDATORY.map((value) => `<option value="${value}">${label('mandatory', value)}</option>`).join('');
  input('regulatory_status').innerHTML = STATUSES.map((value) => `<option value="${value}">${label('status', value)}</option>`).join('');
  if (mandatory) input('mandatory').value = mandatory;
  if (status) input('regulatory_status').value = status;

  const ticked = [...document.querySelectorAll('[name="sector"]:checked')].map((box) => box.value);
  document.querySelector('#f-sectors').innerHTML = SECTORS.map((sector) => `
    <label class="check"><input type="checkbox" name="sector" value="${sector}"> ${label('sector', sector)}</label>`).join('');
  document.querySelectorAll('[name="sector"]').forEach((box) => { box.checked = ticked.includes(box.value); });

  // suggestions while typing an authority or a type (the English names already used)
  document.querySelector('#authority-list').innerHTML = pairs('authority', 'authority').map(([value]) => `<option value="${value}">`).join('');
  document.querySelector('#type-list').innerHTML = pairs('category', 'category').map(([value]) => `<option value="${value}">`).join('');
}

// Opens the panel to edit a requirement, or to add a new one when id is null
function openForm(id) {
  editingId = id;
  const row = id ? findRequirement(id) : { mandatory: 'Conditional', regulatory_status: 'Active', sector: '' };

  fillFormChoices();
  input('id').value = id || '';
  input('id').disabled = Boolean(id);
  TEXT_COLUMNS.forEach((column) => { input(column).value = row[column] ?? ''; });
  document.querySelectorAll('[name="sector"]').forEach((box) => { box.checked = sectorsOf(row).includes(box.value); });
  clearErrors();
  showFormWords();

  panel.querySelector('.panel-body').scrollTop = 0;
  panel.classList.add('is-open');
  (id ? input('name_en') : input('id')).focus();
}

// The panel title and the id hint depend on add or edit
function showFormWords() {
  document.querySelector('#panel-title').textContent = t(editingId ? 'regAdmin.editTitle' : 'regAdmin.addTitle');
  document.querySelector('#f-id-hint').textContent = t(editingId ? 'regAdmin.idLocked' : 'regAdmin.idHint');
}

function isWebAddress(value) {
  return !value || /^https?:\/\/\S+$/.test(value);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const values = {};
  TEXT_COLUMNS.forEach((column) => {
    // an empty answer is saved as "no value", never as an empty text
    values[column] = input(column).value.trim() || null;
  });
  values.sector = [...document.querySelectorAll('[name="sector"]:checked')].map((box) => box.value).join('; ');
  const id = editingId || input('id').value.trim().toUpperCase();

  // check the answers here first, so the admin sees each problem next to its field
  clearErrors();
  const problems = [];
  if (!editingId && !ID_RULE.test(id)) problems.push(['id', 'regAdmin.idError']);
  if (!editingId && findRequirement(id)) problems.push(['id', 'regAdmin.idTaken']);
  if (!values.name_en) problems.push(['name_en', 'regAdmin.nameRequired']);
  if (!values.sector) problems.push(['sectors', 'regAdmin.sectorRequired']);
  if (!isWebAddress(values.official_source_url)) problems.push(['official_source_url', 'regAdmin.urlError']);
  if (!isWebAddress(values.service_url)) problems.push(['service_url', 'regAdmin.urlError']);
  problems.forEach(([column, key]) => showFieldError(column, key));
  if (problems.length) return;

  saveButton.classList.add('is-loading');
  let result;
  if (editingId) {
    result = await supabase.from('regulatory_requirements').update(values).eq('requirement_id', id).select().single();
  } else {
    const user = await getCurrentUser();
    result = await supabase.from('regulatory_requirements')
      .insert({ ...values, requirement_id: id, created_by_admin_id: user?.id ?? null })
      .select().single();
  }
  saveButton.classList.remove('is-loading');

  if (result.error) {
    // 23505: another requirement already has this id
    if (result.error.code === '23505') {
      showFieldError('id', 'regAdmin.idTaken');
    } else {
      console.error('regulatory_requirements:', result.error.message);
      showToast(t('founders.actionError'), 'risk');
    }
    return;
  }

  if (editingId) {
    Object.assign(findRequirement(id), result.data);
  } else {
    requirements.push(result.data);
    requirements.sort((a, b) => a.requirement_id.localeCompare(b.requirement_id));
  }
  panel.classList.remove('is-open');
  showToast(t(editingId ? 'regAdmin.saved' : 'regAdmin.added'), 'good');
  editingId = null;
  fillFilters();
  showRows();
});

document.querySelector('#add').addEventListener('click', () => openForm(null));

/* ---------- Delete ---------- */

function deleteText() {
  return t('regAdmin.deleteText').replace('{name}', field(findRequirement(deleteId), 'name'));
}

function askToDelete(id) {
  deleteId = id;
  document.querySelector('#delete-text').textContent = deleteText();
  deleteModal.showModal();
}

deleteConfirm.addEventListener('click', async () => {
  const id = deleteId;

  deleteConfirm.classList.add('is-loading');
  const { error } = await supabase.from('regulatory_requirements').delete().eq('requirement_id', id);
  deleteConfirm.classList.remove('is-loading');
  deleteModal.close();

  if (error) {
    console.error('regulatory_requirements:', error.message);
    showToast(t('founders.actionError'), 'risk');
    return;
  }

  requirements = requirements.filter((row) => row.requirement_id !== id);
  if (editingId === id) panel.classList.remove('is-open');
  showToast(t('regAdmin.deleted'), 'good');
  fillFilters();
  showRows();
});

/* ---------- Search, filters, language ---------- */

search.addEventListener('input', showRows);
Object.values(filters).forEach((select) => select.addEventListener('change', showRows));

// labels, dates and dropdowns are in the current language, so draw them again when it changes
// (the form keeps what the admin typed)
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

const data = await loadRequirements();
if (data) {
  requirements = data;
} else {
  loadFailed = true;
}
loading = false;
fillFilters();
showRows();
