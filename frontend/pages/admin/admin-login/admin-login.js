/* Admin login: email and password, then a code from the admin's phone.
   Only admin accounts get in. */

import { t } from '../../../shared/language.js';
import {
  logIn, logOut, getAccount, goToHomePage,
  getSecondStep, startAuthenticatorSetup, checkCode,
} from '../../../shared/auth.js';

const loginForm = document.querySelector('#login-form');
const setupForm = document.querySelector('#setup-form');
const codeForm = document.querySelector('#code-form');
const submitButton = document.querySelector('#submit-button');

let setupFactorId = null;   // which phone setup we are in the middle of

/* Shows one screen of the page: 'login', 'setup' or 'code' */
function showScreen(name) {
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.toggle('is-active', screen.dataset.screen === name);
  });
  const firstBox = document.querySelector(`.screen[data-screen="${name}"] input`);
  if (firstBox) firstBox.focus();
}

/* Shows a message in one of the red boxes: 'form-error', 'setup-error' or 'code-error' */
function showAlert(id, errorKey) {
  const box = document.querySelector(`#${id}`);
  box.hidden = !errorKey;
  box.textContent = errorKey ? t(errorKey) : '';
}

function showFieldError(inputId, errorKey) {
  const message = document.querySelector(`[data-error-for="${inputId}"]`);
  message.hidden = !errorKey;
  message.textContent = errorKey ? t(errorKey) : '';
  document.querySelector(`#${inputId}`).classList.toggle('is-error', Boolean(errorKey));
  return !errorKey;
}

/* ---------- The second step ---------- */

/* Called once the password is accepted (or when an admin comes back already signed in).
   Sends the admin on, or shows the screen for the code. */
async function continueAfterPassword() {
  const step = await getSecondStep();

  if (step === 'done') {
    await goToHomePage();
    return;
  }

  if (step === 'code') {
    showScreen('code');
    return;
  }

  // first time: show the QR code to scan
  const setup = await startAuthenticatorSetup();
  showScreen('setup');

  if (!setup.ok) {
    showAlert('setup-error', setup.error);
    return;
  }
  setupFactorId = setup.factorId;
  document.querySelector('#qr-code').src = setup.qrCode;
  document.querySelector('#setup-key').textContent = setup.key;
}

/* ---------- When the page opens ---------- */

const account = await getAccount();

if (account.role === 'admin') {
  if ((await getSecondStep()) === 'done') {
    await goToHomePage();
  } else {
    // half signed in (for example with Google, or the page was reloaded before the code):
    // start again, so the admin always types the password and then the code
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

  const result = await logIn(loginForm.elements.email.value.trim(), loginForm.elements.password.value);

  if (!result.ok) {
    submitButton.classList.remove('is-loading');
    showAlert('form-error', result.error);
    return;
  }

  // The password was right, but is this an admin account?
  const signedIn = await getAccount();

  if (signedIn.role === 'admin') {
    await continueAfterPassword();
    submitButton.classList.remove('is-loading');
  } else {
    // a founder account has no place here: sign it out again and stay on this page
    await logOut(false);
    submitButton.classList.remove('is-loading');
    showAlert('form-error', 'error.notAdmin');
  }
});

/* ---------- 2. The 6-digit code (setup and normal sign-in work the same way) ---------- */

async function submitCode(form, inputId, alertId, factorId) {
  showAlert(alertId, '');

  const code = form.elements.code.value.trim();
  if (!/^\d{6}$/.test(code)) {
    showFieldError(inputId, 'error.codeFormat');
    return;
  }

  const button = form.querySelector('button[type="submit"]');
  button.classList.add('is-loading');
  const result = await checkCode(code, factorId);
  button.classList.remove('is-loading');

  if (!result.ok) {
    showAlert(alertId, result.error);
    form.elements.code.value = '';
    form.elements.code.focus();
    return;
  }

  await goToHomePage();
}

setupForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitCode(setupForm, 'setup-code', 'setup-error', setupFactorId);
});

codeForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitCode(codeForm, 'login-code', 'code-error', null);
});

// only digits can be typed in the code boxes
document.querySelectorAll('.code-input').forEach((input) => {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '');
    showFieldError(input.id, '');
  });
});

// "Sign in with a different account": sign out and show the first screen again
document.querySelectorAll('[data-other-account]').forEach((button) => {
  button.addEventListener('click', async () => {
    await logOut(false);
    showScreen('login');
  });
});
