/* Profile: the signed-in founder's details, language, logout and account deletion. */

import { t, getLanguage } from '../../../shared/language.js';
import { icon, setSidebarUser } from '../../../shared/layout.js';
import { showToast } from '../../../shared/ui.js';
import { supabase } from '../../../shared/supabase.js';
import { getAccount, getCurrentUser, logOut } from '../../../shared/auth.js';
import { dateText } from '../../../shared/regulatory.js?v=3';

const ROOT = new URL('../../../', import.meta.url).href;

const form = document.querySelector('#profile-form');
const saveButton = document.querySelector('#save');
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
  showReadOnly();
}

// The parts that are only shown, in the current language
function showReadOnly() {
  document.querySelector('#email-hint').textContent = newEmail
    ? t('profile.emailSent').replace('{email}', newEmail)
    : t('profile.emailHint');
  document.querySelector('#avatar').textContent = initials(profile.full_name);
  document.querySelector('#member-since').textContent = dateText(profile.created_at);
  // no type = just a founder (migration 0022)
  document.querySelector('#user-type').textContent = t(TYPE_LABELS[profile.user_type] || 'founders.justFounder');
}

// The number of assessments: the security rules return only the founder's own
async function showAssessmentCount() {
  const { count, error } = await supabase.from('assessments').select('assessment_id', { count: 'exact', head: true });
  document.querySelector('#assessments').textContent = error ? '—' : count;
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
    return;
  }

  fields.email.value = email;   // the old email stays the login until the link is clicked
  if (emailResult) newEmail = typedEmail;
  showReadOnly();
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
  if (profile) showReadOnly();
  // the field errors are shown again in the new language when the form is saved
  Object.keys(fields).forEach((name) => showFieldError(name, ''));
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

document.querySelector('#logout-icon').innerHTML = icon('logout');
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
