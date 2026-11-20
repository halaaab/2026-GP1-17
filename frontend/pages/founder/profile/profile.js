/* Profile: the signed-in founder's details, language, a new password, logout and
   account deletion. Laid out like the admin's Profile: a hero card on top, the
   details with Discard and Save (active only after a change), and the side cards. */

import { t, getLanguage } from '../../../shared/language.js';
import { icon, setSidebarUser } from '../../../shared/layout.js';
import { showToast } from '../../../shared/ui.js';
import { supabase } from '../../../shared/supabase.js';
import {
  getAccount, getCurrentUser, logOut, updatePassword, PASSWORD_RULES, isGoodPassword,
} from '../../../shared/auth.js';
import { getAssessments, hasIdea } from '../../../shared/assessments.js';
import { dateText } from '../../../shared/regulatory.js?v=3';

const ROOT = new URL('../../../', import.meta.url).href;

const form = document.querySelector('#profile-form');
const saveButton = document.querySelector('#save');
const resetButton = document.querySelector('#details-reset');
const fields = {
  fullName: document.querySelector('#full-name'),
  email: document.querySelector('#email'),
  phone: document.querySelector('#phone'),
  region: document.querySelector('#region'),
};

const TYPE_LABELS = {
  student: 'signup.student',
  entrepreneur: 'signup.entrepreneur',
  business_owner: 'signup.owner',
  investor: 'signup.investor',
};

// Darb serves founders located in Saudi Arabia (story 39), so the country is fixed
const COUNTRY = 'SA';

// A Saudi mobile number without +966: 9 digits starting with 5
const PHONE_RULE = /^5\d{8}$/;
const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let profile = null;   // the founder's row in the users table
let email = '';       // the login email (Supabase Auth)
let newEmail = '';    // a new email waiting for its confirmation link

/* ---------- Small helpers ---------- */

// First letter of the first two words: "Nora Alharbi" → "NA"
function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

function showFieldError(name, key) {
  const element = fields[name];
  const message = document.querySelector(`#${element.id}-error`);
  element.classList.toggle('is-error', Boolean(key));
  message.textContent = key ? t(key) : '';
  message.hidden = !key;
}

// The fixed country, "Saudi Arabia" / "المملكة العربية السعودية", in the page's language
function showCountry() {
  document.querySelector('#country').value = new Intl.DisplayNames([getLanguage()], { type: 'region' }).of(COUNTRY);
}

/* ---------- Showing the account ---------- */

function showProfile() {
  fields.fullName.value = profile.full_name || '';
  fields.email.value = email;
  fields.phone.value = (profile.phone || '').replace(/^\+966/, '');
  fields.region.value = profile.region || '';
  Object.keys(fields).forEach((name) => showFieldError(name, ''));
  showReadOnly();
  checkChanges();
}

/* ---------- Discard and Save: active only after something changed ---------- */

function hasChanges() {
  return fields.fullName.value.trim() !== (profile.full_name || '')
    || fields.email.value.trim().toLowerCase() !== email
    || fields.phone.value.replace(/\s/g, '').replace(/^0/, '') !== (profile.phone || '').replace(/^\+966/, '')
    || fields.region.value !== (profile.region || '');
}

function checkChanges() {
  const changed = hasChanges();
  saveButton.disabled = !changed;
  resetButton.disabled = !changed;
  document.querySelector('#details-status').textContent = changed ? t('adminProfile.unsaved') : '';
}

Object.values(fields).forEach((field) => {
  field.addEventListener('input', checkChanges);
  field.addEventListener('change', checkChanges);
});

// only digits in the phone box
fields.phone.addEventListener('input', () => {
  fields.phone.value = fields.phone.value.replace(/\D/g, '').slice(0, 9);
  checkChanges();
});

resetButton.addEventListener('click', showProfile);

// The region's name in the current language, for the hero card
function regionName() {
  return profile.region ? t(`signup.region.${profile.region}`) : '';
}

// The parts that are only shown, in the current language
function showReadOnly() {
  // the hero card: initials, name, and "email · region"
  document.querySelector('#hero-avatar').textContent = initials(profile.full_name);
  document.querySelector('#hero-name').textContent = profile.full_name || '';
  document.querySelector('#hero-line').textContent = [email, regionName()].filter(Boolean).join(' · ');

  document.querySelector('#email-hint').textContent = newEmail
    ? t('profile.emailSent').replace('{email}', newEmail)
    : t('profile.emailHint');
  document.querySelector('#member-since').textContent = dateText(profile.created_at);
  // no type = just a founder (migration 0022)
  document.querySelector('#user-type').textContent = t(TYPE_LABELS[profile.user_type] || 'founders.justFounder');
}

// The number of ideas, counted like History: a chat that only said "hi" is not an idea.
// The security rules return only the founder's own.
async function showAssessmentCount() {
  const assessments = await getAssessments();
  document.querySelector('#assessments').textContent = assessments.filter(hasIdea).length;
}

/* ---------- Saving the personal details ---------- */

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const fullName = fields.fullName.value.trim();
  const typedEmail = fields.email.value.trim().toLowerCase();
  const phone = fields.phone.value.replace(/\s/g, '').replace(/^0/, '');
  const region = fields.region.value;

  // check the answers here first, so the founder sees each problem next to its field
  const problems = {
    fullName: fullName ? '' : 'founders.nameRequired',
    email: EMAIL_RULE.test(typedEmail) ? '' : 'profile.emailError',
    phone: !phone || PHONE_RULE.test(phone) ? '' : 'profile.phoneError',
    region: region ? '' : 'profile.regionRequired',
  };
  Object.entries(problems).forEach(([name, key]) => showFieldError(name, key));
  if (Object.values(problems).some(Boolean)) return;

  saveButton.classList.add('is-loading');

  const changes = {
    full_name: fullName,
    phone: phone ? `+966${phone}` : null,
    country_code: COUNTRY,
    region,
  };
  const { data, error } = await supabase.from('founders').update(changes).eq('user_id', profile.user_id).select().single();

  // a new email is only used after the founder clicks the link Supabase sends to it
  let emailResult = null;
  if (!error && typedEmail !== email) {
    emailResult = await supabase.auth.updateUser({ email: typedEmail }, { emailRedirectTo: `${ROOT}pages/auth/login/login.html` });
  }

  saveButton.classList.remove('is-loading');

  if (error) {
    console.error('users:', error.message);
    showToast(t('founders.actionError'), 'risk');
    return;
  }

  profile = { ...profile, ...data };   // keep the type, which lives outside the users table
  fields.phone.value = (profile.phone || '').replace(/^\+966/, '');
  setSidebarUser(profile.full_name, '');

  if (emailResult?.error) {
    console.error('email:', emailResult.error.message);
    const taken = /already|registered|exists/i.test(emailResult.error.message);
    showFieldError('email', taken ? 'error.emailTaken' : 'profile.emailNotChanged');
    fields.email.value = email;
    showReadOnly();
    checkChanges();
    return;
  }

  fields.email.value = email;   // the old email stays the login until the link is clicked
  if (emailResult) newEmail = typedEmail;
  showReadOnly();
  checkChanges();
  showToast(t(emailResult ? 'profile.emailSentToast' : 'founders.saved'), 'good');
});


/* ---------- Language ---------- */

// language.js switches the page; the choice is also saved, so Darb answers in it
document.querySelector('.pf-language').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-language]');
  if (!button || !profile || button.dataset.language === profile.locale) return;

  const { error } = await supabase.from('founders').update({ locale: button.dataset.language }).eq('user_id', profile.user_id);
  if (error) {
    console.error('users:', error.message);
    showToast(t('founders.actionError'), 'risk');
    return;
  }
  profile.locale = button.dataset.language;
});

document.addEventListener('darb:language', () => {
  showCountry();
  if (profile) {
    showReadOnly();
    checkChanges();
  }
  // the field errors are shown again in the new language when the form is saved
  Object.keys(fields).forEach((name) => showFieldError(name, ''));
});

/* ---------- Password (the same as on the admin's Profile) ---------- */

const passwordForm = document.querySelector('#password-form');
const newPassword = document.querySelector('#new-password');
const confirmPassword = document.querySelector('#confirm-password');
const passwordButton = document.querySelector('#password-save');

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

/* ---------- Delete the account ---------- */

const deleteConfirm = document.querySelector('#delete-confirm');

deleteConfirm.addEventListener('click', async () => {
  deleteConfirm.classList.add('is-loading');
  const { error } = await supabase.rpc('delete_my_account');
  deleteConfirm.classList.remove('is-loading');

  if (error) {
    console.error('delete_my_account:', error.message);
    document.querySelector('#delete-modal').close();
    showToast(t('founders.actionError'), 'risk');
    return;
  }

  // the account is gone: clear the login in this browser and go to the home page
  await logOut(false);
  window.location.replace(`${ROOT}index.html`);
});

/* ---------- Start ---------- */

document.querySelectorAll('[data-password-toggle]').forEach((button) => {
  button.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
});
document.querySelector('#delete-icon').innerHTML = icon('trash');

const account = await getAccount();
if (account.role === 'founder') {
  profile = account.profile;
  const user = await getCurrentUser();
  email = user?.email || '';
  newEmail = user?.new_email || '';   // an email change still waiting for its confirmation link

  showCountry();
  showProfile();
  showAssessmentCount();
  document.querySelector('#status').hidden = true;
  document.querySelector('#content').hidden = false;
}
// anyone else is sent away by guard.js
