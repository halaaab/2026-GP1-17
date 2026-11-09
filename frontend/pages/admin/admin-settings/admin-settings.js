/* Admin profile: the signed-in admin's name, username and phone (saved on their
   own row of the admins table), a new password, and how much they added to Darb.
   The database lets an admin change only those three columns, and only on their own row (migration 0001). */

import { t, getLanguage } from '../../../shared/language.js';
import { icon, setSidebarUser } from '../../../shared/layout.js';
import { showToast } from '../../../shared/ui.js';
import { supabase } from '../../../shared/supabase.js';
import {
  getAccount, getCurrentUser, isUsernameFree, updatePassword, PASSWORD_RULES, isGoodPassword,
} from '../../../shared/auth.js';
import '../../../shared/guard.js';

const ROOT = new URL('../../../', import.meta.url).href;

// What the admin may have added, and the page where each is managed
const WORK = [
  { table: 'organization_maintenance', label: 'adminProfile.workPrograms',     icon: 'sprout',    href: 'pages/admin/incubator-accelerator-management/incubator-accelerator-management.html' },
  { table: 'startup_maintenance',      label: 'adminProfile.workStartups',     icon: 'briefcase', href: 'pages/admin/startup-management/startup-management.html' },
  { table: 'requirement_maintenance',  label: 'adminProfile.workRequirements', icon: 'shield',  href: 'pages/admin/regulatory-management/regulatory-management.html' },
];

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const PHONE_PATTERN = /^5\d{8}$/;   // a Saudi mobile number after +966

const detailsForm = document.querySelector('#details-form');
const fullName = document.querySelector('#full-name');
const username = document.querySelector('#username');
const phone = document.querySelector('#phone');
const saveButton = document.querySelector('#details-save');
const resetButton = document.querySelector('#details-reset');

const passwordForm = document.querySelector('#password-form');
const newPassword = document.querySelector('#new-password');
const confirmPassword = document.querySelector('#confirm-password');
const passwordButton = document.querySelector('#password-save');

let user = null;      // the login account (email, last sign-in)
let profile = null;   // the row in the admins table
let teamSize = null;
let work = [];        // how many records the admin maintains, from each maintenance table (migration 0024)

/* ---------- Small helpers ---------- */

function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

function dateText(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString(getLanguage() === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// The phone is saved as +9665XXXXXXXX; the box shows only the part after +966
function localPhone(saved) {
  return (saved || '').replace(/\D/g, '').replace(/^966/, '').replace(/^0/, '');
}

function phoneToSave() {
  const digits = phone.value.replace(/\D/g, '');
  return digits ? `+966${digits}` : null;
}

/* ---------- Drawing ---------- */

function showHero() {
  document.querySelector('#hero-avatar').textContent = initials(profile.full_name);
  document.querySelector('#hero-name').textContent = profile.full_name;
  document.querySelector('#hero-line').textContent = `@${profile.username} · ${user.email}`;
  document.querySelector('#hero-since').textContent = dateText(profile.created_at);
  document.querySelector('#hero-last').textContent = dateText(user.last_sign_in_at);
  document.querySelector('#hero-team').textContent = teamSize === null ? '—' : t('adminProfile.teamCount').replace('{n}', teamSize);
}

function showWork() {
  const total = work.reduce((sum, item) => sum + (item.count || 0), 0);
  document.querySelector('#work').innerHTML = WORK.map((item, index) => `
    <a class="profile-work-item" href="${ROOT}${item.href}">
      <span class="profile-work-icon">${icon(item.icon)}</span>
      <span class="profile-work-label">${t(item.label)}</span>
      <strong>${work[index]?.count ?? '—'}</strong>
    </a>`).join('')
    + `<p class="text-3 profile-work-total">${t(total ? 'adminProfile.workTotal' : 'adminProfile.workNone').replace('{n}', total)}</p>`;
}

function fillDetails() {
  fullName.value = profile.full_name || '';
  username.value = profile.username || '';
  phone.value = localPhone(profile.phone);
  document.querySelector('#email').value = user.email || '';
  checkDetails();
}

/* ---------- Personal details ---------- */

function hasChanges() {
  return fullName.value.trim() !== (profile.full_name || '')
    || username.value.trim() !== (profile.username || '')
    || phoneToSave() !== (profile.phone ? `+966${localPhone(profile.phone)}` : null);
}

// Shows what is wrong as the admin types; returns true when the form can be saved
function checkDetails() {
  const nameOk = fullName.value.trim().length >= 2;
  const usernameOk = USERNAME_PATTERN.test(username.value.trim());
  const phoneOk = !phone.value || PHONE_PATTERN.test(phone.value.replace(/\D/g, ''));

  // an empty required field says so too, the same as the founder profile
  document.querySelector('#full-name-error').hidden = nameOk;
  const usernameError = document.querySelector('#username-error');
  usernameError.hidden = usernameOk;
  usernameError.textContent = t(username.value.trim() ? 'adminProfile.usernameFormat' : 'adminProfile.usernameRequired');
  document.querySelector('#username-hint').hidden = !usernameError.hidden;
  document.querySelector('#phone-error').hidden = phoneOk;

  fullName.classList.toggle('is-error', !nameOk);
  username.classList.toggle('is-error', !usernameOk);
  phone.classList.toggle('is-error', !phoneOk);

  const changed = hasChanges();
  saveButton.disabled = !changed || !nameOk || !usernameOk || !phoneOk;
  resetButton.disabled = !changed;
  document.querySelector('#details-status').textContent = changed ? t('adminProfile.unsaved') : '';
  return !saveButton.disabled;
}

[fullName, username, phone].forEach((input) => input.addEventListener('input', checkDetails));

// only digits in the phone box
phone.addEventListener('input', () => {
  phone.value = phone.value.replace(/\D/g, '').slice(0, 9);
  checkDetails();
});

resetButton.addEventListener('click', fillDetails);

detailsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!checkDetails()) return;

  const wanted = username.value.trim();
  const usernameError = document.querySelector('#username-error');

  saveButton.classList.add('is-loading');

  // A new username must be free among founders AND admins
  if (wanted.toLowerCase() !== (profile.username || '').toLowerCase() && !(await isUsernameFree(wanted))) {
    saveButton.classList.remove('is-loading');
    usernameError.textContent = t('adminProfile.usernameTaken');
    usernameError.hidden = false;
    document.querySelector('#username-hint').hidden = true;
    username.classList.add('is-error');
    return;
  }

  const changes = { full_name: fullName.value.trim(), username: wanted, phone: phoneToSave() };
  const { data, error } = await supabase.from('admins').update(changes).eq('user_id', user.id).select().single();
  saveButton.classList.remove('is-loading');

  if (error) {
    console.error('save admin profile:', error.code, error.message);
    // 23505: somebody took the username a moment ago
    showToast(t(error.code === '23505' ? 'adminProfile.usernameTaken' : 'adminProfile.saveError'), 'risk');
    return;
  }

  profile = data;
  setSidebarUser(profile.full_name, user.email);
  showHero();
  fillDetails();
  showToast(t('adminProfile.saved'), 'good');
});

/* ---------- Password ---------- */

function checkPassword() {
  const password = newPassword.value;
  document.querySelectorAll('#password-rules [data-rule]').forEach((rule) => {
    rule.classList.toggle('is-met', PASSWORD_RULES[rule.dataset.rule](password));
  });

  const differ = Boolean(confirmPassword.value) && confirmPassword.value !== password;
  document.querySelector('#confirm-error').hidden = !differ;
  confirmPassword.classList.toggle('is-error', differ);

  passwordButton.disabled = !isGoodPassword(password) || confirmPassword.value !== password;
}

newPassword.addEventListener('input', checkPassword);
confirmPassword.addEventListener('input', checkPassword);

passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (passwordButton.disabled) return;

  passwordButton.classList.add('is-loading');
  const result = await updatePassword(newPassword.value);
  passwordButton.classList.remove('is-loading');

  if (!result.ok) {
    showToast(t(result.error), 'risk');
    return;
  }

  passwordForm.reset();
  checkPassword();
  showToast(t('adminProfile.passwordSaved'), 'good');
});

/* ---------- Loading ---------- */

async function countWork() {
  return Promise.all(WORK.map(async (item) => {
    const { count, error } = await supabase
      .from(item.table)
      .select('*', { count: 'exact', head: true })
      .eq('admin_id', user.id);
    return { count: error ? null : count };
  }));
}

// dates and labels are text in the current language, so draw them again when it changes
document.addEventListener('darb:language', () => {
  if (!profile) return;
  showHero();
  showWork();
  checkDetails();
});

/* ---------- Start ---------- */

document.querySelectorAll('[data-password-toggle]').forEach((button) => {
  button.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
});

user = await getCurrentUser();
const account = await getAccount();
profile = account.profile;

if (user && profile) {
  const [admins, counts] = await Promise.all([
    supabase.from('admins').select('user_id', { count: 'exact', head: true }),
    countWork(),
  ]);
  teamSize = admins.error ? null : admins.count;
  work = counts;

  showHero();
  showWork();
  fillDetails();
}
