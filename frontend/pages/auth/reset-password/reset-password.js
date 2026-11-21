/* Reset password: the page people reach from the link in the reset email. */

import { t } from '../../../shared/language.js';
import { getCurrentUser, updatePassword, goToHomePage, PASSWORD_RULES, isGoodPassword, passwordProblem } from '../../../shared/auth.js';
import { supabase } from '../../../shared/supabase.js';

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
   The decision comes from the link itself (saved by reset-password.html before Supabase reads it):
   - a good link carries "type=recovery" (or a one-time "code") and signs the person in for a moment
   - a link that is too old, or was already used, carries an error
   - opening the page without a link is treated like an expired link
   So someone who is already signed in can never change their password from an old link. */

const link = window.resetLink || '';
const isRecoveryLink = /type=recovery|[?&#]code=/.test(link) && !/error/.test(link);

/* The reset email links here with a one-time token (token_hash). The token is only used when this
   page runs, so an email program that opens the link to check it cannot use it up first. */
async function signInFromLink() {
  const tokenHash = new URLSearchParams(window.location.search).get('token_hash');
  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
    window.history.replaceState(null, '', window.location.pathname);   // the token works once: remove it from the address
    if (error) return null;
  }
  return getCurrentUser();
}

const user = isRecoveryLink ? await signInFromLink() : null;
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
