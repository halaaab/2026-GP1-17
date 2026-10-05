/* Sign-up page: a few questions, one at a time, then create the account.
   The same page finishes the profile of people who signed in with Google. */

import { t, getLanguage } from '../../../shared/language.js';
import { signUp, completeProfile, isUsernameFree, logInWithGoogle, getAccount, getCurrentUser, goToHomePage, PASSWORD_RULES, isGoodPassword, passwordProblem } from '../../../shared/auth.js';

const form = document.querySelector('#sign-up-form');
const steps = [...document.querySelectorAll('.step')];
const pathStops = [...document.querySelectorAll('.steps-item')];
const submitButton = document.querySelector('#submit-button');
const formError = document.querySelector('#form-error');
const detailsStep = document.querySelector('.step[data-step="2"]');
const detailsError = document.querySelector('#details-error');
const detailsNext = document.querySelector('#details-next');

// The questions, in order
const STEP_TYPE = 0;
const STEP_NAME = 1;
const STEP_DETAILS = 2;
const STEP_ACCOUNT = 3;
const STEP_DONE = 4;

let currentStep = STEP_TYPE;
let cameFromGoogle = false;   // true = signed in with Google, only the profile is missing

// The category chosen on the first step: student, entrepreneur, business_owner, investor or other
const chosenType = () => form.elements.userType.value;

/* ---------- Who is here? ---------- */

const account = await getAccount();

let leaving = false;   // true once the browser is on its way to another page

if (account.role === 'founder' || account.role === 'admin') {
  // already has a full account: nothing to do on this page
  leaving = true;
  goToHomePage();
} else if (account.role === 'new') {
  // signed in with Google, but no profile yet
  cameFromGoogle = true;
  const user = await getCurrentUser();

  document.querySelector('#google-area').hidden = true;
  document.querySelector('#have-account').hidden = true;
  document.querySelector('#account-stop').hidden = true;
  document.querySelector('#name-title').dataset.i18n = 'signup.q2google';
  detailsNext.dataset.i18n = 'signup.finish';

  // Google already knows their name, so fill it in for them
  form.elements.fullName.value = user.user_metadata.full_name || user.user_metadata.name || '';
  form.elements.username.value = user.email.split('@')[0].replace(/[^A-Za-z0-9_]/g, '_').slice(0, 20);
}

/* ---------- The list of countries ----------
   The browser knows every country's name in Arabic and in English,
   so we only keep the two-letter codes here (the 193 UN member states and Palestine).
   Saudi Arabia is always first; the rest are sorted in the page's language. */

const COUNTRY_CODES = ('AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD '
  + 'CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP '
  + 'JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO '
  + 'OM PK PW PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT '
  + 'TN TR TM TV UG UA AE GB US UY UZ VU VE VN YE ZM ZW PS').split(' ');

function fillCountries() {
  const select = form.elements.country;
  const language = getLanguage();
  const chosenBefore = select.value;
  const names = new Intl.DisplayNames([language], { type: 'region' });

  const countries = COUNTRY_CODES
    .map((code) => ({ code, name: names.of(code) }))
    .sort((first, second) => first.name.localeCompare(second.name, language));

  countries.unshift({ code: 'SA', name: names.of('SA') });

  select.innerHTML = `<option value="">${t('signup.select')}</option>`
    + countries.map((country) => `<option value="${country.code}">${country.name}</option>`).join('');
  select.value = chosenBefore;

  // tells the searchable box (shared/ui.js) to show the name in the new language
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

/* ---------- Which details fields are showing ----------
   Each field in the details step can carry data-show-when, for example
   data-show-when="country=SA". A field also hides when it belongs to a
   category block (data-for) other than the chosen one.
   A hidden field is emptied, so old answers are never saved by mistake. */

const detailFields = [...detailsStep.querySelectorAll('.field')];

// The value of a box, a dropdown or a group of yes / no buttons
const answerOf = (name) => form.elements[name].value.trim();

function conditionIsTrue(condition) {
  // "name!=value" means the answer is not that value; "name=value" means it is
  if (condition.includes('!=')) {
    const [name, value] = condition.split('!=');
    return answerOf(name) !== value;
  }
  const [name, value] = condition.split('=');
  return answerOf(name) === value;
}

function shouldShow(field) {
  const block = field.closest('.details');
  if (block && block.dataset.for !== chosenType()) return false;

  const rule = field.dataset.showWhen;
  return !rule || rule.split('&').every(conditionIsTrue);
}

function emptyField(field) {
  field.querySelectorAll('input, select').forEach((control) => {
    if (control.type === 'radio') {
      control.checked = false;
    } else if (control.value !== '') {
      control.value = '';
      control.dispatchEvent(new Event('change', { bubbles: true }));
    }
    control.classList.remove('is-error');
  });
  const message = field.querySelector('.field-error');
  message.hidden = true;
}

function updateDetails() {
  // show only the block of the chosen category
  detailsStep.querySelectorAll('.details').forEach((block) => {
    block.hidden = block.dataset.for !== chosenType();
  });

  // Fields are checked from top to bottom, so a field that depends on an
  // earlier answer sees that answer already emptied if it was hidden.
  detailFields.forEach((field) => {
    const show = shouldShow(field);
    if (!show) emptyField(field);
    field.hidden = !show;
  });
}

/* ---------- Words that depend on the answers ---------- */

function updateWords() {
  if (chosenType()) {
    document.querySelector('#details-title').textContent = t(`signup.title.${chosenType()}`);
  }
  document.querySelector('#name-title').textContent = t(document.querySelector('#name-title').dataset.i18n);
  detailsNext.textContent = t(detailsNext.dataset.i18n);
}

function onLanguage() {
  // what a searchable dropdown says when nothing matches the search
  form.querySelectorAll('select[data-searchable]').forEach((select) => {
    select.dataset.emptyText = t('signup.noResults');
  });
  fillCountries();
  updateWords();
}

// runs when the words are loaded, and again when the language changes
document.addEventListener('darb:language', onLanguage);

// if the words were already loaded before this file started listening, run it now
if (t('signup.select') !== 'signup.select') {
  onLanguage();
}

/* ---------- Moving between the questions ---------- */

function showStep(index) {
  // tells the CSS which side the new question slides in from
  form.style.setProperty('--from', index > currentStep ? 1 : -1);
  currentStep = index;

  steps.forEach((step, stepIndex) => {
    step.classList.toggle('is-active', stepIndex === index);
  });

  // the path at the top: earlier stops are done, this one is current
  pathStops.forEach((stop, stopIndex) => {
    stop.classList.toggle('is-done', stopIndex < index);
    stop.classList.toggle('is-current', stopIndex === index);
  });

  updateDetails();
  updateWords();

  // the last screen needs neither the path nor the "sign in" link
  document.querySelector('#steps').hidden = index === STEP_DONE;
  document.querySelector('#have-account').hidden = index === STEP_DONE || cameFromGoogle;

  window.scrollTo({ top: 0 });
}

/* ---------- Checking the answers ---------- */

function showError(fieldName, errorKey) {
  const message = document.querySelector(`[data-error-for="${fieldName}"]`);
  const control = form.elements[fieldName];

  message.hidden = !errorKey;
  message.textContent = errorKey ? t(errorKey) : '';

  // the password message names exactly what is missing (a capital letter, a symbol...)
  if (errorKey === 'error.password') {
    message.textContent = passwordProblem(form.elements.password.value);
  }

  // one box gets a red border; groups of choices (cards, yes / no) do not
  if (control instanceof HTMLElement) {
    control.classList.toggle('is-error', Boolean(errorKey));
  }
  return !errorKey;
}

// One check per fixed field. Each returns an error key, or '' when the answer is fine.
const checks = {
  userType: () => (chosenType() ? '' : 'error.choose'),
  fullName: () => (form.elements.fullName.value.trim() ? '' : 'error.required'),
  username: () => {
    const username = form.elements.username.value;
    if (/\s/.test(username)) return 'error.usernameSpace';   // say exactly what is wrong
    return /^[A-Za-z0-9_]{3,20}$/.test(username) ? '' : 'error.username';
  },
  email:    () => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.elements.email.value.trim()) ? '' : 'error.email'),
  password: () => (isGoodPassword(form.elements.password.value) ? '' : 'error.password'),
};

// The details step: every field that is showing and marked data-required must be answered
function checkDetails() {
  let allGood = true;

  detailFields.filter((field) => !field.hidden).forEach((field) => {
    const control = field.querySelector('[data-required]');
    if (!control) return;

    const isChoice = control.type === 'radio';
    const problem = answerOf(control.name) ? '' : (isChoice ? 'error.choose' : 'error.required');
    if (!showError(control.name, problem)) allGood = false;
  });

  return allGood;
}

function checkStep(index) {
  if (index === STEP_DETAILS) return checkDetails();

  let allGood = true;
  const fixedFields = [['userType'], ['fullName', 'username'], [], ['email', 'password']][index];
  fixedFields.forEach((fieldName) => {
    if (!showError(fieldName, checks[fieldName]())) allGood = false;
  });
  return allGood;
}

/* Collects the details answers, named like the columns of the users table.
   When someone picks "Other" and types their own answer, the typed box comes
   after the dropdown and has the same data-column, so the typed words replace "other". */
function readDetails() {
  const details = {};

  detailFields.filter((field) => !field.hidden).forEach((field) => {
    const control = field.querySelector('[data-column]');
    const answer = answerOf(control.name);
    if (answer === '') return;

    details[control.dataset.column] = control.dataset.type === 'yes-no' ? answer === 'yes' : answer;
  });

  return details;
}

/* ---------- Buttons ---------- */

async function goForward() {
  if (!checkStep(currentStep)) return;

  // the username must not belong to someone else
  if (currentStep === STEP_NAME && !(await isUsernameFree(form.elements.username.value))) {
    showError('username', 'error.usernameTaken');
    form.elements.username.focus();
    return;
  }

  // People who came through Google finish after the details question
  if (currentStep === STEP_DETAILS && cameFromGoogle) {
    await finishGoogleProfile();
    return;
  }
  showStep(currentStep + 1);
}

form.addEventListener('click', (event) => {
  if (event.target.closest('[data-next]')) goForward();
  if (event.target.closest('[data-back]')) showStep(currentStep - 1);
});

// Choosing a card on the first question moves on by itself after a moment
form.querySelectorAll('input[name="userType"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    showError('userType', '');
    updateDetails();   // empties the answers of the category that was chosen before
    setTimeout(() => {
      if (currentStep === STEP_TYPE) showStep(STEP_NAME);
    }, 450);
  });
});

// Pressing Enter in a box means "Continue", not "submit the whole form"
form.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && currentStep < STEP_ACCOUNT && !event.target.closest('.combo')) {
    event.preventDefault();
    goForward();
  }
});

// While typing: the error on that box goes away
form.addEventListener('input', (event) => {
  const name = event.target.name;

  if (name === 'username') {
    // tell the person about a space or a wrong character the moment they type it
    const username = form.elements.username.value;
    let problem = '';
    if (/\s/.test(username)) problem = 'error.usernameSpace';
    else if (/[^A-Za-z0-9_]/.test(username)) problem = 'error.username';
    showError('username', problem);
  } else if (name && name !== 'userType' && document.querySelector(`[data-error-for="${name}"]`)) {
    showError(name, '');
  }
});

// Choosing from a dropdown or a yes / no: clear its error, then show or hide the fields that depend on it
detailsStep.addEventListener('change', (event) => {
  const name = event.target.name;
  if (name && answerOf(name) && document.querySelector(`[data-error-for="${name}"]`)) {
    showError(name, '');
  }
  updateDetails();
});

/* ---------- Password rules ----------
   While typing: tick each rule the password already meets. */

form.elements.password.addEventListener('input', () => {
  const password = form.elements.password.value;
  document.querySelectorAll('#rules li').forEach((rule) => {
    rule.classList.toggle('is-met', PASSWORD_RULES[rule.dataset.rule](password));
  });
});

/* ---------- Creating the account (email and password) ---------- */

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.hidden = true;

  if (!checkStep(STEP_ACCOUNT)) return;

  submitButton.classList.add('is-loading');

  const email = form.elements.email.value.trim();
  const result = await signUp({
    email,
    password: form.elements.password.value,
    fullName: form.elements.fullName.value.trim(),
    username: form.elements.username.value,
    userType: chosenType(),
    details: readDetails(),
  });

  submitButton.classList.remove('is-loading');

  if (!result.ok) {
    formError.textContent = t(result.error);
    formError.hidden = false;
    return;
  }

  if (result.needsEmailConfirmation) {
    document.querySelector('#done-email').textContent = email;
    showStep(STEP_DONE);
  } else {
    goToHomePage();
  }
});

/* ---------- Finishing a Google account's profile ---------- */

async function finishGoogleProfile() {
  detailsError.hidden = true;
  detailsNext.classList.add('is-loading');

  const result = await completeProfile({
    fullName: form.elements.fullName.value.trim(),
    username: form.elements.username.value,
    userType: chosenType(),
    details: readDetails(),
  });

  detailsNext.classList.remove('is-loading');

  if (!result.ok) {
    if (result.error === 'error.usernameTaken') {
      // go back to the name question and point at the username box
      showStep(STEP_NAME);
      showError('username', result.error);
      form.elements.username.focus();
    } else {
      detailsError.textContent = t(result.error);
      detailsError.hidden = false;
    }
    return;
  }
  goToHomePage();
}

/* ---------- Google ----------
   Google only replaces the email and password. The status, name and details
   are still asked: before Google if the person is on the last step,
   after Google if they pressed the button at the very start. */

const DRAFT_KEY = 'darb-sign-up-answers';

// The button on the first step: go to Google now, answer the questions after
document.querySelector('#google-button').addEventListener('click', async () => {
  sessionStorage.removeItem(DRAFT_KEY);
  const result = await logInWithGoogle();
  if (!result.ok) showError('userType', result.error);
});

// The button on the last step: the questions are already answered, so keep
// the answers in this browser tab while the person is away at Google
document.querySelector('#google-instead').addEventListener('click', async () => {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
    fullName: form.elements.fullName.value.trim(),
    username: form.elements.username.value,
    userType: chosenType(),
    details: readDetails(),
  }));

  const result = await logInWithGoogle();
  if (!result.ok) {
    formError.textContent = t(result.error);
    formError.hidden = false;
  }
});

// Back from Google with answers waiting: save the profile straight away
const savedAnswers = sessionStorage.getItem(DRAFT_KEY);
if (cameFromGoogle && savedAnswers) {
  sessionStorage.removeItem(DRAFT_KEY);
  const result = await completeProfile(JSON.parse(savedAnswers));
  if (result.ok) {
    leaving = true;
    goToHomePage();
  }
  // if saving failed, the person simply answers the questions again
}

// Staying on this page: show the form (sign-up.html hid it while we were checking)
if (!leaving) {
  document.documentElement.classList.remove('is-checking');
}
