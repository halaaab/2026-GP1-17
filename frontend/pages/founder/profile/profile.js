/* Profile: the signed-in founder's details, language, a new password, logout and
   account deletion. Laid out like the admin's Profile: a hero card on top, the
   details with Discard and Save (active only after a change), and the side cards. */

import { t, getLanguage } from '../../../shared/language.js';
import { icon, setSidebarUser } from '../../../shared/layout.js';
import { showToast } from '../../../shared/ui.js';
import { supabase } from '../../../shared/supabase.js';
import {
  getAccount, getCurrentUser, logOut, updatePassword, PASSWORD_RULES, isGoodPassword, FOUNDER_TABLES,
} from '../../../shared/auth.js';
import { getAssessments, hasIdea } from '../../../shared/assessments.js';
import { SECTORS, label } from '../../../shared/startups.js';

const ROOT = new URL('../../../', import.meta.url).href;
import { dateText } from '../../../shared/regulatory.js?v=3';

const form = document.querySelector('#profile-form');
const saveButton = document.querySelector('#save');
const resetButton = document.querySelector('#details-reset');
// The username and the email are only shown: they identify the founder and cannot change
const fields = {
  fullName: document.querySelector('#full-name'),
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

let profile = null;   // the founder's profile: the users row plus their type's answers
let email = '';       // the login email (Supabase Auth)

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
  document.querySelector('#username').value = profile.username ? `@${profile.username}` : '';
  document.querySelector('#email').value = email;
  fields.phone.value = (profile.phone || '').replace(/^\+966/, '');
  fields.region.value = profile.region || '';
  Object.keys(fields).forEach((name) => showFieldError(name, ''));
  showReadOnly();
  checkChanges();
}

/* ---------- Discard and Save: active only after something changed ---------- */

function hasChanges() {
  return fields.fullName.value.trim() !== (profile.full_name || '')
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
  const phone = fields.phone.value.replace(/\s/g, '').replace(/^0/, '');
  const region = fields.region.value;

  // check the answers here first, so the founder sees each problem next to its field
  const problems = {
    fullName: fullName ? '' : 'founders.nameRequired',
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

  saveButton.classList.remove('is-loading');

  if (error) {
    console.error('users:', error.message);
    showToast(t('founders.actionError'), 'risk');
    return;
  }

  profile = { ...profile, ...data };   // keep the type, which lives outside the users table
  fields.phone.value = (profile.phone || '').replace(/^\+966/, '');
  setSidebarUser(profile.full_name, '');

  showReadOnly();
  checkChanges();
  showToast(t('founders.saved'), 'good');
});


/* ---------- Background: the founder's answers at sign-up ----------
   The same questions as the sign-up page, for the founder's own type only.
   A choice list ("options") holds the translation key of each answer; "sectors" uses Darb's
   sector list (the same as the startups). An answer typed under "Other" at sign-up is kept
   and shown as it was typed. The answers are saved in the type's own table (FOUNDER_TABLES). */

const STAGES = ['idea', 'validation', 'prototype', 'launch', 'revenue', 'growth'];
const BACKGROUND = {
  student: [
    { column: 'field_of_study', label: 'signup.fieldOfStudy', prefix: 'signup.study.',
      options: ['computer_science', 'information_technology', 'information_systems', 'software_engineering', 'computer_engineering',
        'artificial_intelligence', 'data_science', 'cybersecurity', 'business_administration', 'entrepreneurship', 'finance',
        'accounting', 'marketing', 'engineering', 'health_sciences', 'law', 'design'] },
    { column: 'education_level', label: 'signup.academicLevel', prefix: 'signup.level.', options: ['diploma', 'bachelor', 'master', 'phd'] },
    { column: 'has_prior_venture', label: 'signup.priorQuestion', yesNo: true },
    { column: 'project_sector', label: 'signup.projectSector', sectors: true, onlyIf: 'has_prior_venture' },
    { column: 'project_stage', label: 'signup.projectStage', prefix: 'signup.stage.', options: STAGES, onlyIf: 'has_prior_venture' },
  ],
  entrepreneur: [
    { column: 'project_sector', label: 'signup.projectSector', sectors: true },
    { column: 'project_stage', label: 'signup.projectStage', prefix: 'signup.stage.', options: STAGES },
  ],
  business_owner: [
    { column: 'current_business_sector', label: 'signup.businessSector', sectors: true },
    { column: 'business_age', label: 'signup.businessAge', prefix: 'signup.age.', options: ['lt1', '1_3', '4_5', 'gt5'] },
    { column: 'business_size', label: 'signup.businessSize', prefix: 'signup.size.', options: ['micro', 'small', 'medium', 'large'] },
  ],
  investor: [
    { column: 'investor_type', label: 'signup.investorType', prefix: 'signup.itype.',
      options: ['individual', 'vc_fund', 'investment_company', 'corporate_arm'] },
  ],
};

const backgroundCard = document.querySelector('#background-card');
const backgroundForm = document.querySelector('#background-form');
const backgroundBox = document.querySelector('#background-fields');
const backgroundSave = document.querySelector('#background-save');
const backgroundReset = document.querySelector('#background-reset');

const questionsOf = () => BACKGROUND[profile?.user_type] || [];

// The saved answer as the dropdown's value: true/false become "yes"/"no"
function savedValue(question) {
  const value = profile[question.column];
  if (question.yesNo) return value === true ? 'yes' : value === false ? 'no' : '';
  return value ?? '';
}

// The choices of one question, in the page's language. A typed "Other" answer is added as is.
function choicesOf(question) {
  let pairs;
  if (question.yesNo) pairs = [['yes', t('signup.yes')], ['no', t('signup.no')]];
  else if (question.sectors) {
    pairs = SECTORS.map((sector) => [sector, label('sector', sector)])
      .sort((first, second) => first[1].localeCompare(second[1], getLanguage()));
  } else pairs = question.options.map((value) => [value, t(question.prefix + value)]);

  const saved = savedValue(question);
  if (saved && !pairs.some(([value]) => value === saved)) pairs.push([saved, saved]);
  return pairs;
}

const safe = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Draws the questions with the saved answers (or the choices made but not saved yet)
function showBackground(keepChoices = false) {
  const questions = questionsOf();
  backgroundCard.hidden = questions.length === 0;
  if (questions.length === 0) return;

  const chosen = {};
  if (keepChoices) backgroundBox.querySelectorAll('select').forEach((select) => { chosen[select.name] = select.value; });

  backgroundBox.innerHTML = questions.map((question) => `
    <div class="field" data-question="${question.column}">
      <label class="label" for="bg-${question.column}">${safe(t(question.label))}</label>
      <select class="input" id="bg-${question.column}" name="${question.column}">
        <option value="">${safe(t('signup.select'))}</option>
        ${choicesOf(question).map(([value, words]) => `<option value="${safe(value)}">${safe(words)}</option>`).join('')}
      </select>
    </div>`).join('');

  questions.forEach((question) => {
    backgroundBox.querySelector(`#bg-${question.column}`).value = keepChoices ? chosen[question.column] ?? '' : savedValue(question);
  });
  checkBackground();
}

// The project questions of a student show only after "Yes" to the earlier-venture question
function checkBackground() {
  const answers = backgroundAnswers();
  questionsOf().forEach((question) => {
    if (!question.onlyIf) return;
    backgroundBox.querySelector(`[data-question="${question.column}"]`).hidden = answers[question.onlyIf] !== 'yes';
  });

  const changed = questionsOf().some((question) => answers[question.column] !== savedValue(question));
  backgroundSave.disabled = !changed;
  backgroundReset.disabled = !changed;
  document.querySelector('#background-status').textContent = changed ? t('adminProfile.unsaved') : '';
}

function backgroundAnswers() {
  const answers = {};
  backgroundBox.querySelectorAll('select').forEach((select) => { answers[select.name] = select.value; });
  return answers;
}

backgroundBox.addEventListener('change', checkBackground);
backgroundReset.addEventListener('click', () => showBackground());

backgroundForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const answers = backgroundAnswers();

  // the database's own values: "yes"/"no" → true/false, an empty choice → nothing,
  // and the project answers are cleared when a student answers "No"
  const changes = {};
  questionsOf().forEach((question) => {
    let value = answers[question.column] || null;
    if (question.yesNo) value = value === 'yes' ? true : value === 'no' ? false : null;
    if (question.onlyIf && answers[question.onlyIf] !== 'yes') value = null;
    changes[question.column] = value;
  });

  backgroundSave.classList.add('is-loading');
  const { error } = await supabase.from(FOUNDER_TABLES[profile.user_type]).update(changes).eq('user_id', profile.user_id);
  backgroundSave.classList.remove('is-loading');

  if (error) {
    console.error('background:', error.message);
    showToast(t('founders.actionError'), 'risk');
    return;
  }

  profile = { ...profile, ...changes };
  showBackground();
  showToast(t('founders.saved'), 'good');
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
    showBackground(true);   // the questions in the new language, keeping unsaved choices
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

  showCountry();
  showProfile();
  showBackground();
  showAssessmentCount();
  document.querySelector('#status').hidden = true;
  document.querySelector('#content').hidden = false;
}
// anyone else is sent away by guard.js
