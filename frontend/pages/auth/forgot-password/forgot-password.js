/* Forgot password: ask for an email, send the reset link, show "check your email". */

import { t } from '../../../shared/language.js';
import { sendPasswordReset } from '../../../shared/auth.js';

const form = document.querySelector('#forgot-form');
const submitButton = document.querySelector('#submit-button');
const resendButton = document.querySelector('#resend-button');
const formError = document.querySelector('#form-error');
const emailError = document.querySelector('[data-error-for="email"]');

let sentTo = '';   // the email the link was sent to

/* Supabase sends one reset email per minute, so "Send it again" waits 60 seconds after each email */
const WAIT_SECONDS = 60;
let secondsLeft = 0;
let timer = null;

function showResendButton() {
  resendButton.disabled = secondsLeft > 0;
  resendButton.textContent = secondsLeft > 0
    ? t('forgot.resendIn').replace('{n}', secondsLeft)
    : t('forgot.resend');
}

function startWaiting() {
  secondsLeft = WAIT_SECONDS;
  clearInterval(timer);
  timer = setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft <= 0) clearInterval(timer);
    showResendButton();
  }, 1000);
  showResendButton();
}

document.addEventListener('darb:language', showResendButton);
showResendButton();

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
  document.querySelector('#resent-note').hidden = true;
  showScreen('sent');
  startWaiting();
});

/* ---------- "Send it again" ---------- */

resendButton.addEventListener('click', async () => {
  if (secondsLeft > 0) return;
  resendButton.classList.add('is-loading');
  const result = await sendPasswordReset(sentTo);
  resendButton.classList.remove('is-loading');

  // if sending again is refused, go back to the form and say why
  if (!result.ok) {
    showScreen('form');
    formError.textContent = t(result.error);
    formError.hidden = false;
    return;
  }

  document.querySelector('#resent-note').hidden = false;
  startWaiting();
});
