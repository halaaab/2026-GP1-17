/* 403: go to your own pages, or sign out and log in with the right account. */

import { icon } from '../../../shared/layout.js';
import { logOut } from '../../../shared/auth.js';
import { setUpErrorPage, cameFrom } from '../../../shared/errors.js';

const ROOT = new URL('../../../', import.meta.url).href;

document.querySelector('#icon').innerHTML = icon('lock');
setUpErrorPage();

// "Log in with another account": signs out, then opens the login of the page
// the person wanted (the admin login for an admin page), which brings them back to it
document.querySelector('#switch').addEventListener('click', async (event) => {
  event.currentTarget.classList.add('is-loading');
  const wanted = cameFrom();
  await logOut(false);
  if (wanted) sessionStorage.setItem('darb-next', wanted);
  const login = wanted.includes('/pages/admin/') ? 'pages/admin/admin-login/admin-login.html' : 'pages/auth/login/login.html';
  window.location.href = ROOT + login;
});
