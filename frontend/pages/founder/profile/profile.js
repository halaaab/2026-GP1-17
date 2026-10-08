/* Profile: the signed-in founder's details, language, logout and account deletion. */

import { t, getLanguage } from '../../../shared/language.js';
import { icon, setSidebarUser } from '../../../shared/layout.js';
import { showToast } from '../../../shared/ui.js';
import { supabase } from '../../../shared/supabase.js';
import { getAccount, getCurrentUser, logOut } from '../../../shared/auth.js';
import { dateText } from '../../../shared/regulatory.js';

const ROOT = new URL('../../../', import.meta.url).href;

const form = document.querySelector('#profile-form');
const saveButton = document.querySelector('#save');
const fields = {
  fullName: document.querySelector('#full-name'),
  email: document.querySelector('#email'),
  phone: document.querySelector('#phone'),
  country: document.querySelector('#country'),
  region: document.querySelector('#region'),
};

const TYPE_LABELS = {
  student: 'signup.student',
  entrepreneur: 'signup.entrepreneur',
  business_owner: 'signup.owner',
  investor: 'signup.investor',
  other: 'signup.other',
};

// The same countries as the sign-up page: the 193 UN member states and Palestine.
// The browser knows each name in Arabic and English, so only the codes are kept here.
const COUNTRY_CODES = ('AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD '
  + 'CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP '
  + 'JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO '
  + 'OM PK PW PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT '
  + 'TN TR TM TV UG UA AE GB US UY UZ VU VE VN YE ZM ZW PS').split(' ');

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

// Saudi Arabia first, the rest sorted in the page's language (the same as sign-up)
function fillCountries() {
  const select = fields.country;
  const language = getLanguage();
  const chosen = select.value;
  const names = new Intl.DisplayNames([language], { type: 'region' });

  const countries = COUNTRY_CODES
    .map((code) => ({ code, name: names.of(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, language));
  countries.unshift({ code: 'SA', name: names.of('SA') });

  select.innerHTML = `<option value="">${t('signup.select')}</option>`
    + countries.map((country) => `<option value="${country.code}">${country.name}</option>`).join('');
  select.value = chosen;

  // tells the searchable box (shared/ui.js) to show the name in the new language
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

// The region is asked only for Saudi Arabia, as on the sign-up page
function showRegion() {
  document.querySelector('#region-row').hidden = fields.country.value !== 'SA';
}

/* ---------- Showing the account ---------- */

function showProfile() {
  fields.fullName.value = profile.full_name || '';
  fields.email.value = email;
  fields.phone.value = (profile.phone || '').replace(/^\+966/, '');
  fields.country.value = profile.country_code || '';
  fields.country.dispatchEvent(new Event('change', { bubbles: true }));
  fields.region.value = profile.region || '';
  showRegion();
  showReadOnly();
}

// The parts that are only shown, in the current language
function showReadOnly() {
  document.querySelector('#email-hint').textContent = newEmail
    ? t('profile.emailSent').replace('{email}', newEmail)
    : t('profile.emailHint');
  document.querySelector('#avatar').textContent = initials(profile.full_name);
  document.querySelector('#member-since').textContent = dateText(profile.created_at);
  document.querySelector('#user-type').textContent = TYPE_LABELS[profile.user_type] ? t(TYPE_LABELS[profile.user_type]) : '—';
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
  const country = fields.country.value;
  const region = country === 'SA' ? fields.region.value : '';

  // check the answers here first, so the founder sees each problem next to its field
  const problems = {
    fullName: fullName ? '' : 'founders.nameRequired',
    email: EMAIL_RULE.test(typedEmail) ? '' : 'profile.emailError',
    phone: !phone || PHONE_RULE.test(phone) ? '' : 'profile.phoneError',
    country: country ? '' : 'profile.countryRequired',
    region: country !== 'SA' || region ? '' : 'profile.regionRequired',
  };
  Object.entries(problems).forEach(([name, key]) => showFieldError(name, key));
  if (Object.values(problems).some(Boolean)) return;

  saveButton.classList.add('is-loading');

  const changes = {
    full_name: fullName,
    phone: phone ? `+966${phone}` : null,
    country_code: country,
    region: region || null,
  };
  const { data, error } = await supabase.from('users').update(changes).eq('user_id', profile.user_id).select().single();

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

  profile = data;
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

fields.country.addEventListener('change', showRegion);

/* ---------- Language ---------- */

// language.js switches the page; the choice is also saved, so Darb answers in it
document.querySelector('.pf-language').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-language]');
  if (!button || !profile || button.dataset.language === profile.locale) return;

  const { error } = await supabase.from('users').update({ locale: button.dataset.language }).eq('user_id', profile.user_id);
  if (error) {
    console.error('users:', error.message);
    showToast(t('founders.actionError'), 'risk');
    return;
  }
  profile.locale = button.dataset.language;
});

document.addEventListener('darb:language', () => {
  fillCountries();
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

  fillCountries();
  showProfile();
  showAssessmentCount();
  document.querySelector('#status').hidden = true;
  document.querySelector('#content').hidden = false;
}
// anyone else is sent away by guard.js
