/* Regulatory management: the regulatory requirements founders see in the
   Regulatory Explorer. Search, four filters, add / edit in a side panel,
   and delete after a confirmation. */

import { t, getLanguage } from '../../../shared/language.js';
import { icon } from '../../../shared/layout.js';
import { showToast, showFormSummary } from '../../../shared/ui.js';
import { makeLogoUpload } from '../../../shared/logo-upload.js';
import { supabase } from '../../../shared/supabase.js';
import { showErrorPage } from '../../../shared/errors.js';
import {
  loadRequirements, field, label, stagesOf, allStages, dateText, fillFilter, authorityColors, fitsIsic, divisionsOf, logoUrl, initials,
  MANDATORY, STATUSES, ISIC_SECTIONS, ISIC_DIVISIONS, isicOf, isicText, saveIsic,
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
  'name_en', 'name_ar', 'authority', 'authority_ar', 'authority_logo', 'category', 'category_ar', 'business_stage',
  'mandatory', 'regulatory_status', 'applies_when', 'applies_when_ar',
  'what_darb_surface', 'what_darb_surface_ar', 'fees_thresholds', 'fees_thresholds_ar',
  'official_source_url', 'service_url', 'last_verified',
];

/* The ID of a new requirement. Admins never see or type it: it is the database's key.
   GEN-024, GEN-025 … for requirements for every business, REQ-001, REQ-002 … for the others. */
function nextId(sections) {
  const prefix = sections.includes('ALL') ? 'GEN' : 'REQ';
  const numbers = requirements
    .filter((row) => row.requirement_id.startsWith(`${prefix}-`))
    .map((row) => Number(row.requirement_id.slice(prefix.length + 1)))
    .filter((number) => Number.isInteger(number));
  return `${prefix}-${String(Math.max(0, ...numbers) + 1).padStart(3, '0')}`;
}

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
  fillFilter(filters.authority, 'reg.authority', 'filter.allAuthorities', pairs('authority', 'authority'));
  // the same 20 ISIC4 sections as the Regulatory Explorer
  fillFilter(filters.sector, 'reg.isic', 'filter.allSectors', ISIC_SECTIONS.map((section) => [section.code, isicText(section.code)]));
  fillFilter(filters.type, 'regAdmin.type', 'filter.allTypes', pairs('category', 'category'));
  fillFilter(filters.stage, 'reg.stage', 'filter.allStages', allStages(requirements).map((s) => [s, label('stage', s)]));
}

function fits(row) {
  const words = search.value.trim().toLowerCase();
  const text = [row.name_en, row.name_ar, row.authority, row.authority_ar, row.category, row.category_ar]
    .join(' ').toLowerCase();

  return text.includes(words)
    && (!filters.authority.value || row.authority === filters.authority.value)
    && (!filters.sector.value || fitsIsic(row, filters.sector.value))
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
        <div class="reg-name-cell">
          ${logoUrl(row)
    ? `<span class="reg-logo has-image"><img src="${logoUrl(row)}" alt="" loading="lazy"></span>`
    : `<span class="reg-logo" aria-hidden="true">${initials(row.authority)}</span>`}
          <span class="cell-title"></span>
        </div>
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
    tr.querySelector('.reg-authority').textContent = field(row, 'authority') || '—';
    tr.querySelector('.reg-type').textContent = field(row, 'category') || '—';
    tr.querySelector('.reg-applies').textContent = isicOf(row).map(isicText).join(getLanguage() === 'ar' ? '، ' : ', ') || '—';
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
  ['name_en', 'isic', 'divisions', 'official_source_url', 'service_url'].forEach((column) => showFieldError(column, ''));
  document.querySelector('#form-summary').hidden = true;
}

// The two dropdowns and the ISIC4 boxes, in the page's language
function fillFormChoices() {
  const mandatory = input('mandatory').value;
  const status = input('regulatory_status').value;
  input('mandatory').innerHTML = MANDATORY.map((value) => `<option value="${value}">${label('mandatory', value)}</option>`).join('');
  input('regulatory_status').innerHTML = STATUSES.map((value) => `<option value="${value}">${label('status', value)}</option>`).join('');
  if (mandatory) input('mandatory').value = mandatory;
  if (status) input('regulatory_status').value = status;

  // the ISIC4 sections: "Every sector" first, then the 20 sections in their official order
  const tickedIsic = [...document.querySelectorAll('[name="isic"]:checked')].map((box) => box.value);
  document.querySelector('#f-isic').innerHTML = ['ALL', ...ISIC_SECTIONS.map((section) => section.code)].map((code) => `
    <label class="check"><input type="checkbox" name="isic" value="${code}"> ${code === 'ALL' ? t('regAdmin.isicEvery') : isicText(code)}</label>`).join('');
  document.querySelectorAll('[name="isic"]').forEach((box) => { box.checked = tickedIsic.includes(box.value); });

  // suggestions while typing an authority or a type (the English names already used)
  document.querySelector('#authority-list').innerHTML = pairs('authority', 'authority').map(([value]) => `<option value="${value}">`).join('');
  document.querySelector('#type-list').innerHTML = pairs('category', 'category').map(([value]) => `<option value="${value}">`).join('');

  // the logos already in use, each named after its authority (frontend/assets/images/authorities/)
  const logo = input('authority_logo').value;
  input('authority_logo').innerHTML = `<option value="">${t('regAdmin.noLogo')}</option>`
    + logoChoices().map(([path, name]) => `<option value="${path}">${name}</option>`).join('');
  input('authority_logo').value = logo;
}

// [logo address, authority name in the page's language], A to Z
function logoChoices() {
  const found = new Map();
  requirements.forEach((row) => {
    if (row.authority_logo && !found.has(row.authority_logo)) found.set(row.authority_logo, field(row, 'authority'));
  });
  return [...found].sort((a, b) => a[1].localeCompare(b[1]));
}

// Typing an authority that already has a logo picks that logo (the admin can still change it)
input('authority').addEventListener('change', () => {
  const same = requirements.find((row) => row.authority === input('authority').value.trim() && row.authority_logo);
  if (same && !input('authority_logo').value) input('authority_logo').value = same.authority_logo;
  showLogoPreview();
});

// Opens the panel to edit a requirement, or to add a new one when id is null
function openForm(id) {
  editingId = id;
  const row = id ? findRequirement(id) : { mandatory: 'Conditional', regulatory_status: 'Active' };

  fillFormChoices();
  TEXT_COLUMNS.forEach((column) => { input(column).value = row[column] ?? ''; });
  document.querySelectorAll('[name="isic"]').forEach((box) => { box.checked = isicOf(row).includes(box.value); });
  input('divisions').value = divisionsOf(row).filter((code) => code !== 'ALL').join(', ');
  clearErrors();
  showFormWords();
  logoUpload.reset(row.authority_logo || '');

  panel.querySelector('.panel-body').scrollTop = 0;
  panel.classList.add('is-open');
  input('name_en').focus();
}

// The panel title, the line under it and the save button depend on add or edit (as on the other admin panels)
function showFormWords() {
  const row = editingId ? findRequirement(editingId) : null;
  document.querySelector('#panel-title').textContent = t(row ? 'regAdmin.editTitle' : 'regAdmin.addTitle');
  document.querySelector('#panel-sub').textContent = row
    ? t('startupAdmin.lastUpdated').replace('{date}', dateText(row.updated_at || row.created_at))
    : t('regAdmin.addSub');
  saveButton.textContent = t(row ? 'founders.save' : 'regAdmin.add');
}

// The logo row: upload a picture (the "authority-logos" bucket, migration 0049) or pick one already used
const logoUpload = makeLogoUpload({
  bucket: 'authority-logos',
  row: '#logo-picker',
  preview: '#logo-preview',
  choose: '#logo-choose',
  remove: '#logo-remove',
  file: '#f-logo-file',
  error: '#logo-error',
  initials: () => initials(input('authority').value.trim() || '?'),
  addressOf: (path) => (path ? logoUrl({ authority_logo: path }) : ''),
  // a new picture (or Remove) replaces the logo picked from the list
  onChange: () => { input('authority_logo').value = ''; },
});
const showLogoPreview = () => logoUpload.useAddress(input('authority_logo').value);
input('authority_logo').addEventListener('change', showLogoPreview);
input('authority').addEventListener('input', () => logoUpload.show());

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
  // "Every sector" on its own when it is ticked, otherwise the ticked ISIC4 sections
  const isic = [...document.querySelectorAll('[name="isic"]:checked')].map((box) => box.value);
  // (saved in their own tables after the requirement, see saveIsic)
  const sections = isic.includes('ALL') ? ['ALL'] : isic;
  // the ISIC4 divisions decide whose roadmap it is in; "Every sector" means every division
  const typed = input('divisions').value.split(/[\s,،;]+/).filter(Boolean).map((code) => code.padStart(2, '0'));
  const divisions = sections.includes('ALL') ? ['ALL'] : [...new Set(typed)];

  // check the answers here first, so the admin sees each problem next to its field
  clearErrors();
  const problems = [];
  if (!values.name_en) problems.push(['name_en', 'regAdmin.nameRequired']);
  if (!sections.length) problems.push(['isic', 'regAdmin.isicRequired']);
  if (!sections.includes('ALL')
    && (!divisions.length || divisions.some((code) => !ISIC_DIVISIONS.includes(code)))) {
    problems.push(['divisions', 'regAdmin.divisionsError']);
  }
  if (!isWebAddress(values.official_source_url)) problems.push(['official_source_url', 'regAdmin.urlError']);
  if (!isWebAddress(values.service_url)) problems.push(['service_url', 'regAdmin.urlError']);
  problems.forEach(([column, key]) => showFieldError(column, key));
  // "N fields need attention" above the form, then the first one, as on the other admin panels
  if (showFormSummary(form, (n) => (n === 1 ? t('form.oneProblem') : t('form.problems').replace('{n}', n)))) return;

  const id = editingId || nextId(sections);

  saveButton.classList.add('is-loading');
  // a new or removed logo: uploaded under the requirement's id first, then its address is saved
  if (logoUpload.hasNewPicture() || logoUpload.isRemoved()) {
    try {
      values.authority_logo = await logoUpload.save(id);
    } catch (error) {
      console.error('authority logo:', error.message);
      saveButton.classList.remove('is-loading');
      showToast(t('form.logoNotSaved'), 'risk');
      return;
    }
  }
  let result;
  if (editingId) {
    result = await supabase.from('regulatory_requirements').update(values).eq('requirement_id', id).select().single();
  } else {
    // the database remembers which admin added it (requirement_maintenance, migration 0024)
    result = await supabase.from('regulatory_requirements')
      .insert({ ...values, requirement_id: id })
      .select().single();
  }
  // then its ISIC4 sections and divisions, in their own tables
  const isicError = result.error ? null : await saveIsic(id, sections, divisions);
  saveButton.classList.remove('is-loading');

  if (result.error || isicError) {
    console.error('regulatory_requirements:', (result.error || isicError).message);
    showToast(t('founders.actionError'), 'risk');
    return;
  }
  result.data.isic_sections = sections;
  result.data.isic_divisions = divisions;

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
  showErrorPage(500);   // the requirements could not be loaded: the 500 page offers "Try again"
}
loading = false;
fillFilters();
showRows();
