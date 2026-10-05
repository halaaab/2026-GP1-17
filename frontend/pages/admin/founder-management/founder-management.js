/* Founder management: the list of founder accounts, a search box, a status
   filter, and a side panel to deactivate / activate or delete one founder. */

import { t, getLanguage } from '../../../shared/language.js';
import { icon } from '../../../shared/layout.js';
import { showToast } from '../../../shared/ui.js';
import { supabase } from '../../../shared/supabase.js';
import '../../../shared/guard.js';

const rows = document.querySelector('#rows');
const search = document.querySelector('#search');
const empty = document.querySelector('#empty');
const panel = document.querySelector('#founder-panel');
const statusButton = document.querySelector('#status-button');
const deleteModal = document.querySelector('#delete-modal');
const deleteConfirm = document.querySelector('#delete-confirm');

let founders = [];
let filter = 'all';       // 'all', 'active' or 'deactivated'
let selectedId = null;    // the founder open in the side panel
let loadFailed = false;

/* ---------- Small helpers ---------- */

// First letter of the first two words: "Nora Alharbi" → "NA"
function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

function dateText(date) {
  return new Date(date).toLocaleDateString(getLanguage() === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/* The founder's field, from the sign-up answers:
   project sector (student, entrepreneur), business sector (business owner),
   or field of study. Saved as a code like "ai_software", or as the founder's
   own words when they picked "Other". */
function fieldText(founder) {
  const sector = founder.project_sector || founder.current_business_sector;
  if (sector) {
    const key = `signup.sector.${sector}`;
    return t(key) === key ? sector : t(key);
  }
  if (founder.field_of_study) {
    const key = `signup.study.${founder.field_of_study}`;
    return t(key) === key ? founder.field_of_study : t(key);
  }
  return '—';
}

function findFounder(id) {
  return founders.find((founder) => founder.user_id === id);
}

/* ---------- The table ---------- */

function showRows() {
  const words = search.value.trim().toLowerCase();

  const visible = founders.filter((founder) => {
    const fitsFilter = filter === 'all' || founder.status === filter;
    const fitsSearch = `${founder.full_name} ${founder.email}`.toLowerCase().includes(words);
    return fitsFilter && fitsSearch;
  });

  rows.innerHTML = visible.map((founder) => `
    <tr class="founder-row ${founder.user_id === selectedId ? 'is-selected' : ''}" data-id="${founder.user_id}" tabindex="0">
      <td>
        <div class="founder-cell">
          <span class="avatar founder-avatar"></span>
          <div>
            <span class="cell-title"></span>
            <span class="cell-detail"></span>
          </div>
          ${founder.status === 'deactivated' ? `<span class="chip chip-risk chip-dot">${t('founders.deactivatedOne')}</span>` : ''}
        </div>
      </td>
      <td><span class="chip founder-field-chip"></span></td>
      <td class="hide-small text-2">${dateText(founder.created_at)}</td>
      <td class="hide-small text-2">—</td>
    </tr>`).join('');

  // names, emails and "Other" answers are written by founders, so they are added as text
  rows.querySelectorAll('tr').forEach((row, index) => {
    const founder = visible[index];
    row.querySelector('.founder-avatar').textContent = initials(founder.full_name);
    row.querySelector('.cell-title').textContent = founder.full_name;
    row.querySelector('.cell-detail').textContent = founder.email;
    row.querySelector('.founder-field-chip').textContent = fieldText(founder);
  });

  empty.textContent = t(loadFailed ? 'founders.loadError' : founders.length ? 'founders.noMatch' : 'founders.none');
  empty.hidden = visible.length > 0;
}

/* ---------- The side panel ---------- */

function showPanel() {
  const founder = findFounder(selectedId);
  if (!founder) {
    panel.classList.remove('is-open');
    return;
  }

  const isActive = founder.status === 'active';

  document.querySelector('#panel-avatar').textContent = initials(founder.full_name);
  document.querySelector('#panel-name').textContent = founder.full_name;
  document.querySelector('#panel-email').textContent = founder.email;
  document.querySelector('#panel-field').textContent = fieldText(founder);
  document.querySelector('#panel-joined').textContent = dateText(founder.created_at);
  document.querySelector('#panel-language').textContent = t(founder.locale === 'en' ? 'founders.english' : 'founders.arabic');

  const status = document.querySelector('#panel-status');
  status.textContent = t(isActive ? 'founders.activeOne' : 'founders.deactivatedOne');
  status.classList.toggle('is-good', isActive);
  status.classList.toggle('is-risk', !isActive);

  // PDF reports: no reports table yet, so the list is empty
  document.querySelector('#panel-report-count').textContent = t('founders.reportCount').replace('{n}', 0);
  document.querySelector('#panel-reports').innerHTML = '';
  document.querySelector('#panel-reports-empty').hidden = false;

  statusButton.textContent = t(isActive ? 'founders.deactivate' : 'founders.activate');

  panel.classList.add('is-open');
}

function openFounder(id) {
  selectedId = id;
  showRows();
  showPanel();
}

rows.addEventListener('click', (event) => {
  const row = event.target.closest('[data-id]');
  if (row) openFounder(row.dataset.id);
});

rows.addEventListener('keydown', (event) => {
  const row = event.target.closest('[data-id]');
  if (row && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    openFounder(row.dataset.id);
  }
});

// ui.js closes the panel; here we only clear the highlighted row
panel.addEventListener('click', (event) => {
  if (event.target.closest('[data-panel-close]')) {
    selectedId = null;
    showRows();
  }
});

/* ---------- Actions ---------- */

statusButton.addEventListener('click', async () => {
  const founder = findFounder(selectedId);
  const newStatus = founder.status === 'active' ? 'deactivated' : 'active';

  statusButton.classList.add('is-loading');
  const { error } = await supabase.rpc('set_user_status', { target_user_id: founder.user_id, new_status: newStatus });
  statusButton.classList.remove('is-loading');

  if (error) {
    showToast(t('founders.actionError'), 'risk');
    return;
  }

  founder.status = newStatus;
  showToast(t(newStatus === 'active' ? 'founders.activated' : 'founders.deactivatedToast'), 'good');
  showRows();
  showPanel();
});

// the modal opens through ui.js (data-modal-open); fill in whose account it is
document.querySelector('[data-modal-open="delete-modal"]').addEventListener('click', () => {
  const founder = findFounder(selectedId);
  document.querySelector('#delete-text').textContent = t('founders.deleteText').replace('{name}', founder.full_name);
});

deleteConfirm.addEventListener('click', async () => {
  const founder = findFounder(selectedId);

  deleteConfirm.classList.add('is-loading');
  const { error } = await supabase.rpc('admin_delete_founder', { target_user_id: founder.user_id });
  deleteConfirm.classList.remove('is-loading');
  deleteModal.close();

  if (error) {
    showToast(t('founders.actionError'), 'risk');
    return;
  }

  founders = founders.filter((item) => item.user_id !== founder.user_id);
  selectedId = null;
  panel.classList.remove('is-open');
  showToast(t('founders.deleted'), 'good');
  showRows();
});

/* ---------- Search and filter ---------- */

document.querySelector('#filter').addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;

  filter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('is-active', item === button));
  showRows();
});

search.addEventListener('input', showRows);

// dates, fields and statuses are text in the current language, so draw them again when it changes
document.addEventListener('darb:language', () => {
  showRows();
  if (selectedId) showPanel();
});

/* ---------- Start ---------- */

document.querySelector('#search-icon').innerHTML = icon('search');
document.querySelector('#panel-close').innerHTML = icon('close');
document.querySelector('#panel-field-icon').innerHTML = icon('briefcase');

const { data, error } = await supabase.rpc('admin_list_founders');
if (error) {
  loadFailed = true;
  console.error('admin_list_founders:', error.message);
} else {
  founders = data;
}
showRows();
