/* Admin management: the list of admin accounts with a search box. Read only. */

import { t, getLanguage } from '../../../shared/language.js';
import { icon } from '../../../shared/layout.js';
import { supabase } from '../../../shared/supabase.js';
import { getCurrentUser } from '../../../shared/auth.js';
import '../../../shared/guard.js';

const rows = document.querySelector('#rows');
const search = document.querySelector('#search');
const empty = document.querySelector('#empty');

let admins = [];
let myId = null;          // the signed-in admin, marked "You"
let loading = true;      // the spinner stays until the rows arrive
let loadFailed = false;

// First letter of the first two words: "Saud Almutairi" → "SA"
function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

function locale() {
  return getLanguage() === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB';
}

function dateText(date) {
  return new Date(date).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
}

function dateTimeText(date) {
  if (!date) return t('admins.never');
  return new Date(date).toLocaleString(locale(), {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function showRows() {
  if (loading) return;

  const words = search.value.trim().toLowerCase();
  const visible = admins.filter((admin) => `${admin.full_name} ${admin.email}`.toLowerCase().includes(words));

  rows.innerHTML = visible.map((admin) => `
    <tr>
      <td>
        <div class="admin-cell">
          <span class="avatar admin-avatar"></span>
          <div>
            <span class="admin-name">
              <span class="cell-title"></span>
              ${admin.admin_id === myId ? `<span class="chip chip-navy">${t('admins.you')}</span>` : ''}
            </span>
            <span class="cell-detail"></span>
          </div>
        </div>
      </td>
      <td class="text-2">${t('role.admin')}</td>
      <td class="hide-small text-2">${dateText(admin.created_at)}</td>
      <td class="hide-small text-2">${dateTimeText(admin.last_sign_in_at)}</td>
      <td><span class="chip chip-good chip-dot">${t('admins.active')}</span></td>
    </tr>`).join('');

  // names and emails are added as text
  rows.querySelectorAll('tr').forEach((row, index) => {
    const admin = visible[index];
    row.querySelector('.admin-avatar').textContent = initials(admin.full_name);
    row.querySelector('.cell-title').textContent = admin.full_name;
    row.querySelector('.cell-detail').textContent = admin.email;
  });

  document.querySelector('#total').textContent = t('admins.total').replace('{n}', admins.length);
  empty.textContent = t(loadFailed ? 'admins.loadError' : 'admins.noMatch');
  empty.hidden = visible.length > 0;
}

search.addEventListener('input', showRows);

// dates and labels are text in the current language, so draw them again when it changes
document.addEventListener('darb:language', showRows);

document.querySelector('#search-icon').innerHTML = icon('search');

const user = await getCurrentUser();
myId = user?.id ?? null;

const { data, error } = await supabase.rpc('admin_list_admins');
if (error) {
  loadFailed = true;
  console.error('admin_list_admins:', error.message);
} else {
  admins = data;
}
loading = false;
showRows();
