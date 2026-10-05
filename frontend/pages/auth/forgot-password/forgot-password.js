/* Forgot password: ask for an email, send the reset link, show "check your email". */

import { t } from '../../../shared/language.js';
import { sendPasswordReset } from '../../../shared/auth.js';

const form = document.querySelector('#forgot-form');
const submitButton = document.querySelector('#submit-button');
const resendButton = document.querySelector('#resend-button');
const formError = document.querySelector('#form-error');
const emailError = document.querySelector('[data-error-for="email"]');

let sentTo = '';   // the email the link was sent to

/* Shows one screen of the page: 'form' or 'sent' */
function showScreen(name) {
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.toggle('is-active', screen.dataset.screen === name);
  });
}

function showEmailError(errorKey) {
  emailError.hidden = !errorKey;
  emailError.textContent = errorKey ? t(errorKey) : '';
  form.elements.email.classList.toggle('is-error', Boolean(errorKey));
}

form.elements.email.addEventListener('input', () => showEmailError(''));

/* ---------- Asking for the link ---------- */

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.hidden = true;

  const email = form.elements.email.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showEmailError('error.email');
    return;
  }

  submitButton.classList.add('is-loading');
  const result = await sendPasswordReset(email);
  submitButton.classList.remove('is-loading');

  if (!result.ok) {
    formError.textContent = t(result.error);
    formError.hidden = false;
    return;
  }

  sentTo = email;
  document.querySelector('#sent-email').textContent = email;
  showScreen('sent');
});

/* ---------- "Send it again" ---------- */

resendButton.addEventListener('click', async () => {
  resendButton.classList.add('is-loading');
  const result = await sendPasswordReset(sentTo);
  resendButton.classList.remove('is-loading');

  // if sending again is refused (asked too soon), go back to the form and say why
  if (!result.ok) {
    showScreen('form');
    formError.textContent = t(result.error);
    formError.hidden = false;
  }
});
