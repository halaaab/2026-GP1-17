/* Sign-in page. */

import { t } from '../../../shared/language.js';
import { logIn, logInWithGoogle, getCurrentUser, goToHomePage } from '../../../shared/auth.js';

const form = document.querySelector('#login-form');
const submitButton = document.querySelector('#submit-button');
const formError = document.querySelector('#form-error');

function showFormError(errorKey) {
  formError.textContent = t(errorKey);
  formError.hidden = false;
}

/* ---------- Greeting that follows the clock ---------- */

function showGreeting() {
  const hour = new Date().getHours();
  let key = 'login.evening';
  if (hour >= 5 && hour < 12) key = 'login.morning';
  else if (hour >= 12 && hour < 17) key = 'login.afternoon';

  document.querySelector('#greeting').textContent = t(key);
}

// The words are ready once the language is loaded, and change when it changes
document.addEventListener('darb:language', showGreeting);

/* ---------- Already logged in? ----------
   This also catches people coming back from Google or from the link in their confirmation email. */

let leaving = false;

if (await getCurrentUser()) {
  const result = await goToHomePage();
  if (!result.ok) showFormError(result.error);
  leaving = Boolean(result.leaving);
}

// Not going anywhere: show the form (login.html hid it while we were checking)
if (!leaving) {
  document.documentElement.classList.remove('is-checking');
}

/* ---------- Checking the two fields ---------- */

function showError(fieldName, errorKey) {
  const message = document.querySelector(`[data-error-for="${fieldName}"]`);
  message.hidden = !errorKey;
  message.textContent = errorKey ? t(errorKey) : '';
  form.elements[fieldName].classList.toggle('is-error', Boolean(errorKey));
  return !errorKey;
}

function checkForm() {
  const emailIsGood = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.elements.email.value.trim());
  const passwordIsGood = form.elements.password.value.length > 0;

  const first = showError('email', emailIsGood ? '' : 'error.email');
  const second = showError('password', passwordIsGood ? '' : 'error.required');
  return first && second;
}

form.addEventListener('input', (event) => {
  if (event.target.name) showError(event.target.name, '');
});

/* ---------- Signing in ---------- */

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.hidden = true;

  if (!checkForm()) return;

  submitButton.classList.add('is-loading');

  let result = await logIn(form.elements.email.value.trim(), form.elements.password.value);
  if (result.ok) {
    result = await goToHomePage();
  }

  submitButton.classList.remove('is-loading');

  if (!result.ok) {
    showFormError(result.error);
  }
});

document.querySelector('#google-button').addEventListener('click', async () => {
  const result = await logInWithGoogle();
  if (!result.ok) showFormError(result.error);
});
