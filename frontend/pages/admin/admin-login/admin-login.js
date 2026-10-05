/* Admin login: email and password, then a 6-digit code sent to the admin's email.
   Only admin accounts get in. */

import { t } from '../../../shared/language.js';
import {
  logIn, logOut, getAccount, goToHomePage,
  getSecondStep, sendEmailCode, checkCode,
} from '../../../shared/auth.js';

const loginForm = document.querySelector('#login-form');
const codeForm = document.querySelector('#code-form');
const submitButton = document.querySelector('#submit-button');
const resendButton = document.querySelector('#resend-button');

let adminEmail = '';   // the admin who passed the password step

/* Shows one screen of the page: 'login' or 'code' */
function showScreen(name) {
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.toggle('is-active', screen.dataset.screen === name);
  });
  document.querySelector(`.screen[data-screen="${name}"] input`).focus();
}

/* Shows a message in one of the boxes: 'form-error', 'code-error' or 'code-info'.
   An empty key hides the box. */
function showAlert(id, key) {
  const box = document.querySelector(`#${id}`);
  box.hidden = !key;
  box.textContent = key ? t(key) : '';
}

function showFieldError(inputId, errorKey) {
  const message = document.querySelector(`[data-error-for="${inputId}"]`);
  message.hidden = !errorKey;
  message.textContent = errorKey ? t(errorKey) : '';
  document.querySelector(`#${inputId}`).classList.toggle('is-error', Boolean(errorKey));
  return !errorKey;
}

/* "We sent a 6-digit code to name@example.com" */
function showCodeText() {
  document.querySelector('#code-sub').textContent = t('adminLogin.codeSub').replace('{email}', adminEmail);
}
document.addEventListener('darb:language', showCodeText);

/* Supabase sends one code per minute to an address. After a code is requested,
   "Send a new code" waits and counts down, so nobody asks again too early. */
const RESEND_WAIT = 60;   // seconds
let resendTimer = null;

function startResendWait() {
  let secondsLeft = RESEND_WAIT;
  clearInterval(resendTimer);
  resendButton.disabled = true;

  const tick = () => {
    if (secondsLeft <= 0) {
      clearInterval(resendTimer);
      resendButton.disabled = false;
      resendButton.textContent = t('adminLogin.resend');
      return;
    }
    resendButton.textContent = `${t('adminLogin.resend')} (${secondsLeft})`;
    secondsLeft -= 1;
  };
  tick();
  resendTimer = setInterval(tick, 1000);
}

/* ---------- When the page opens ---------- */

const account = await getAccount();

if (account.role === 'admin') {
  if ((await getSecondStep()) === 'done') {
    await goToHomePage();
  } else {
    // the password alone is not enough: start again so a fresh code is sent
    await logOut(false);
  }
}

// the page was hidden while we checked (see admin-login.html)
document.documentElement.classList.remove('is-checking');

/* ---------- 1. Email and password ---------- */

function checkLoginForm() {
  const emailIsGood = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginForm.elements.email.value.trim());
  const passwordIsGood = loginForm.elements.password.value.length > 0;

  const first = showFieldError('email', emailIsGood ? '' : 'error.email');
  const second = showFieldError('password', passwordIsGood ? '' : 'error.required');
  return first && second;
}

loginForm.addEventListener('input', (event) => {
  if (event.target.id) showFieldError(event.target.id, '');
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showAlert('form-error', '');

  if (!checkLoginForm()) return;

  submitButton.classList.add('is-loading');

  const email = loginForm.elements.email.value.trim();
  const result = await logIn(email, loginForm.elements.password.value);

  if (!result.ok) {
    submitButton.classList.remove('is-loading');
    showAlert('form-error', result.error);
    return;
  }

  // The password was right, but is this an admin account?
  const signedIn = await getAccount();

  if (signedIn.role !== 'admin') {
    // a founder account has no place here: sign it out again and stay on this page
    await logOut(false);
    submitButton.classList.remove('is-loading');
    showAlert('form-error', 'error.notAdmin');
    return;
  }

  // an admin: email the code and ask for it
  adminEmail = email;
  const sent = await sendEmailCode(adminEmail);
  submitButton.classList.remove('is-loading');
  loginForm.elements.password.value = '';

  showCodeText();
  showAlert('code-info', '');
  showAlert('code-error', sent.ok ? '' : sent.error);
  showScreen('code');
  startResendWait();
});

/* ---------- 2. The 6-digit code ---------- */

const codeInput = codeForm.elements.code;

// only digits can be typed
codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.replace(/\D/g, '');
  showFieldError('login-code', '');
});

codeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showAlert('code-error', '');
  showAlert('code-info', '');

  if (!/^\d{6}$/.test(codeInput.value)) {
    showFieldError('login-code', 'error.codeFormat');
    return;
  }

  const button = codeForm.querySelector('button[type="submit"]');
  button.classList.add('is-loading');
  const result = await checkCode(adminEmail, codeInput.value);

  if (!result.ok) {
    button.classList.remove('is-loading');
    showAlert('code-error', result.error);
    codeInput.value = '';
    codeInput.focus();
    return;
  }

  await goToHomePage();
});

// "Send a new code"
resendButton.addEventListener('click', async () => {
  showAlert('code-error', '');
  showAlert('code-info', '');

  resendButton.classList.add('is-loading');
  const sent = await sendEmailCode(adminEmail);
  resendButton.classList.remove('is-loading');

  if (sent.ok) {
    showAlert('code-info', 'adminLogin.resent');
    startResendWait();
  } else {
    showAlert('code-error', sent.error);
  }
});

// "Sign in with a different account": sign out and show the first screen again
document.querySelector('[data-other-account]').addEventListener('click', async () => {
  await logOut(false);
  showScreen('login');
});
