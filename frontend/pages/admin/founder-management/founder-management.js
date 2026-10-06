/* Founder management: the list of founder accounts, a search box, a status
   filter, and a side panel to see, edit, deactivate / activate or delete one founder.
   Each row also has an edit and a delete button. */

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
const form = document.querySelector('#panel-form');
const saveButton = document.querySelector('#edit-save');

// what a username may look like (the same rule the database checks)
const USERNAME_RULE = /^[A-Za-z0-9_]{3,20}$/;

// the user types from sign-up, and the words shown for them
const TYPE_LABELS = {
  student: 'signup.student',
  entrepreneur: 'signup.entrepreneur',
  business_owner: 'signup.owner',
  investor: 'signup.investor',
  other: 'signup.other',
};

// one pastel chip color per user type (chip-pastel-N in shared.css); no mint (6), it sits next to the green "Active"
const TYPE_COLORS = { student: 1, entrepreneur: 2, business_owner: 3, investor: 4, other: 5 };

let founders = [];
let filter = 'all';       // 'all', 'active' or 'deactivated'
let selectedId = null;    // the founder open in the side panel
let editing = false;      // the side panel shows the edit form
let deleteId = null;      // the founder the delete pop-up is asking about
let loading = true;       // the spinner stays until the rows arrive
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

function typeText(founder) {
  return TYPE_LABELS[founder.user_type] ? t(TYPE_LABELS[founder.user_type]) : '—';
}

// the user type as a pastel chip, one color per type
function typeChip(founder) {
  const color = TYPE_COLORS[founder.user_type];
  return `<span class="chip ${color ? `chip-pastel-${color}` : ''}">${typeText(founder)}</span>`;
}

function statusChip(founder) {
  return founder.status === 'active'
    ? `<span class="chip chip-good chip-dot">${t('founders.activeOne')}</span>`
    : `<span class="chip chip-risk chip-dot">${t('founders.deactivatedOne')}</span>`;
}

function findFounder(id) {
  return founders.find((founder) => founder.user_id === id);
}

/* ---------- The table ---------- */

function showRows() {
  if (loading) return;

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
        </div>
      </td>
      <td class="hide-small">${typeChip(founder)}</td>
      <td class="hide-small text-2">${dateText(founder.created_at)}</td>
      <td class="hide-small text-2 founder-count">${founder.assessments_count ?? 0}</td>
      <td>${statusChip(founder)}</td>
      <td>
        <div class="founder-actions">
          <button type="button" class="btn-icon" data-action="edit" aria-label="${t('founders.edit')}">${icon('pencil')}</button>
          <button type="button" class="btn-icon is-danger" data-action="delete" aria-label="${t('founders.delete')}">${icon('trash')}</button>
        </div>
      </td>
    </tr>`).join('');

  // names and emails are written by founders, so they are added as text
  rows.querySelectorAll('tr').forEach((row, index) => {
    const founder = visible[index];
    row.querySelector('.founder-avatar').textContent = initials(founder.full_name);
    row.querySelector('.cell-title').textContent = founder.full_name;
    row.querySelector('.cell-detail').textContent = founder.email;
  });

  empty.textContent = t(loadFailed ? 'founders.loadError' : founders.length ? 'founders.noMatch' : 'founders.none');
  empty.hidden = visible.length > 0;
}

/* ---------- The side panel ---------- */

// Fills the panel with the selected founder and shows the view or the edit mode
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
  document.querySelector('#panel-type').innerHTML = typeChip(founder);
  document.querySelector('#panel-joined').textContent = dateText(founder.created_at);
  document.querySelector('#panel-assessments').textContent = founder.assessments_count ?? 0;
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

  // view mode or edit mode
  document.querySelector('#panel-view').hidden = editing;
  document.querySelector('#foot-view').hidden = editing;
  document.querySelector('#panel-edit').hidden = editing;
  form.hidden = !editing;
  document.querySelector('#foot-edit').hidden = !editing;

  panel.classList.add('is-open');
}

/* ---------- Edit form ---------- */

function showFieldError(id, key) {
  const input = document.querySelector(`#${id}`);
  const message = document.querySelector(`#${id}-error`);
  input.classList.toggle('is-error', Boolean(key));
  message.textContent = key ? t(key) : '';
  message.hidden = !key;
}

function clearErrors() {
  showFieldError('edit-name', '');
  showFieldError('edit-username', '');
}

// Puts the founder's current details into the form
function fillForm(founder) {
  document.querySelector('#edit-name').value = founder.full_name;
  document.querySelector('#edit-username').value = founder.username;
  document.querySelector('#edit-email').value = founder.email;
  document.querySelector('#edit-type').value = founder.user_type;
  document.querySelector('#edit-language').value = founder.locale;
  document.querySelector('#edit-status').value = founder.status;
  clearErrors();
}

function openFounder(id, edit = false) {
  selectedId = id;
  editing = edit;
  if (edit) fillForm(findFounder(id));
  showRows();
  showPanel();
}

function startEditing() {
  openFounder(selectedId, true);
  document.querySelector('#edit-name').focus();
}

document.querySelector('#panel-edit').addEventListener('click', startEditing);

document.querySelector('#edit-cancel').addEventListener('click', () => {
  editing = false;
  showPanel();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const founder = findFounder(selectedId);

  const changes = {
    full_name: document.querySelector('#edit-name').value.trim(),
    username: document.querySelector('#edit-username').value.trim(),
    user_type: document.querySelector('#edit-type').value,
    locale: document.querySelector('#edit-language').value,
    status: document.querySelector('#edit-status').value,
  };

  // check the answers here first, so the admin sees the problem next to the field
  showFieldError('edit-name', changes.full_name ? '' : 'founders.nameRequired');
  showFieldError('edit-username', USERNAME_RULE.test(changes.username) ? '' : 'error.username');
  if (!changes.full_name || !USERNAME_RULE.test(changes.username)) return;

  saveButton.classList.add('is-loading');
  const { error } = await supabase.rpc('admin_update_founder', {
    target_user_id: founder.user_id,
    new_full_name: changes.full_name,
    new_username: changes.username,
    new_user_type: changes.user_type,
    new_locale: changes.locale,
    new_status: changes.status,
  });
  saveButton.classList.remove('is-loading');

  if (error) {
    // 23505: the username is already used by another founder or an admin
    if (error.code === '23505') {
      showFieldError('edit-username', 'error.usernameTaken');
    } else {
      console.error('admin_update_founder:', error.message);
      showToast(t('founders.actionError'), 'risk');
    }
    return;
  }

  Object.assign(founder, changes);
  editing = false;
  showToast(t('founders.saved'), 'good');
  showRows();
  showPanel();
});

/* ---------- Clicks in the table ---------- */

rows.addEventListener('click', (event) => {
  const row = event.target.closest('[data-id]');
  if (!row) return;

  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'edit') {
    openFounder(row.dataset.id, true);
  } else if (action === 'delete') {
    askToDelete(row.dataset.id);
  } else {
    openFounder(row.dataset.id);
  }
});

rows.addEventListener('keydown', (event) => {
  const row = event.target.closest('[data-id]');
  // Enter on the edit / delete buttons is handled by their own click
  if (row && event.target === row && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    openFounder(row.dataset.id);
  }
});

// ui.js closes the panel (close button or Escape); here we only clear the highlighted row
function clearSelection() {
  selectedId = null;
  editing = false;
  showRows();
}

panel.addEventListener('click', (event) => {
  if (event.target.closest('[data-panel-close]')) clearSelection();
});

// ui.js runs first, so the panel is already closed when this runs
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && selectedId && !panel.classList.contains('is-open')) clearSelection();
});

/* ---------- Activate / deactivate ---------- */

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

/* ---------- Delete ---------- */

function askToDelete(id) {
  deleteId = id;
  document.querySelector('#delete-text').textContent = t('founders.deleteText').replace('{name}', findFounder(id).full_name);
  deleteModal.showModal();
}

document.querySelector('#panel-delete').addEventListener('click', () => askToDelete(selectedId));

deleteConfirm.addEventListener('click', async () => {
  const founder = findFounder(deleteId);

  deleteConfirm.classList.add('is-loading');
  const { error } = await supabase.rpc('admin_delete_founder', { target_user_id: founder.user_id });
  deleteConfirm.classList.remove('is-loading');
  deleteModal.close();

  if (error) {
    showToast(t('founders.actionError'), 'risk');
    return;
  }

  founders = founders.filter((item) => item.user_id !== founder.user_id);
  if (selectedId === founder.user_id) {
    selectedId = null;
    editing = false;
    panel.classList.remove('is-open');
  }
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

// dates, types and statuses are text in the current language, so draw them again when it changes
// (the form keeps what the admin typed: only the view is drawn again)
document.addEventListener('darb:language', () => {
  showRows();
  if (selectedId) showPanel();
  if (deleteModal.open) {
    document.querySelector('#delete-text').textContent = t('founders.deleteText').replace('{name}', findFounder(deleteId).full_name);
  }
});

/* ---------- Start ---------- */

document.querySelector('#search-icon').innerHTML = icon('search');
document.querySelector('#panel-close').innerHTML = icon('close');
document.querySelector('#panel-edit').innerHTML = icon('pencil');
document.querySelector('#panel-type-icon').innerHTML = icon('user');
document.querySelector('#delete-icon').innerHTML = icon('trash');

const { data, error } = await supabase.rpc('admin_list_founders');
if (error) {
  loadFailed = true;
  console.error('admin_list_founders:', error.message);
} else {
  founders = data;
}
loading = false;
showRows();
