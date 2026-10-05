/* Reset password: the page people reach from the link in the reset email. */

import { t } from '../../../shared/language.js';
import { getCurrentUser, updatePassword, goToHomePage, PASSWORD_RULES, isGoodPassword, passwordProblem } from '../../../shared/auth.js';

const form = document.querySelector('#reset-form');
const submitButton = document.querySelector('#submit-button');
const formError = document.querySelector('#form-error');

/* Shows one screen of the page: 'form', 'done' or 'expired' */
function showScreen(name) {
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.toggle('is-active', screen.dataset.screen === name);
  });
}

/* ---------- Does the link still work? ----------
   A good link signs the person in for a moment, just so they can change the password.
   A link that is too old, or was already used, signs nobody in. */

const user = await getCurrentUser();
showScreen(user ? 'form' : 'expired');

// the page was hidden while we checked (see reset-password.html)
document.documentElement.classList.remove('is-checking');

/* ---------- The password rules (the rules themselves are in shared/auth.js) ---------- */

function showError(fieldName, errorKey) {
  const message = document.querySelector(`[data-error-for="${fieldName}"]`);
  message.hidden = !errorKey;
  message.textContent = errorKey ? t(errorKey) : '';

  // the password message names exactly what is missing (a capital letter, a symbol...)
  if (errorKey === 'error.password') {
    message.textContent = passwordProblem(form.elements.password.value);
  }
  form.elements[fieldName].classList.toggle('is-error', Boolean(errorKey));
  return !errorKey;
}

// While typing: tick each rule the password already meets
form.elements.password.addEventListener('input', () => {
  const password = form.elements.password.value;
  document.querySelectorAll('#rules li').forEach((rule) => {
    rule.classList.toggle('is-met', PASSWORD_RULES[rule.dataset.rule](password));
  });
  showError('password', '');
});

form.elements.confirm.addEventListener('input', () => showError('confirm', ''));

function checkForm() {
  const password = form.elements.password.value;

  const first = showError('password', isGoodPassword(password) ? '' : 'error.password');
  const second = showError('confirm', form.elements.confirm.value === password ? '' : 'error.passwordMatch');
  return first && second;
}

/* ---------- Saving the new password ---------- */

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.hidden = true;

  if (!checkForm()) return;

  submitButton.classList.add('is-loading');
  const result = await updatePassword(form.elements.password.value);
  submitButton.classList.remove('is-loading');

  if (!result.ok) {
    formError.textContent = t(result.error);
    formError.hidden = false;
    return;
  }

  showScreen('done');
});

// They are already signed in, so "Continue" takes them straight to their first page
document.querySelector('#continue-button').addEventListener('click', goToHomePage);
