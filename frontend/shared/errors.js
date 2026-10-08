/* ==========================================================
   Error pages: 403 (no access), 404 (not found), 500 (server error).

   A page sends the person to one of them:
     import { showErrorPage } from '../../../shared/errors.js';
     showErrorPage(404);     // a startup that does not exist
     showErrorPage(500);     // the data could not be loaded

   A guarded page that should show 403 to the wrong kind of account
   (instead of sending them to their own first page) adds
   data-denied="403" to <body>. guard.js reads it.

   The error pages call setUpErrorPage() to make their buttons work.
   ========================================================== */

import { getAccount } from './auth.js';

const ROOT = new URL('..', import.meta.url).href;

const ERROR_PAGES = {
  403: 'pages/errors/403-no-access/403-no-access.html',
  404: 'pages/errors/404-not-found/404-not-found.html',
  500: 'pages/errors/500-server-error/500-server-error.html',
};

const HOMES = {
  founder: 'pages/founder/chatbot/chatbot.html',
  admin:   'pages/admin/overview-dashboard/overview-dashboard.html',
};

/* Opens an error page. The page that failed is remembered in ?from=,
   so "Try again" on the 500 page can go back to it. replace() keeps the
   broken page out of the browser history, so Back does not loop. */
export function showErrorPage(code) {
  const from = encodeURIComponent(window.location.href);
  window.location.replace(`${ROOT}${ERROR_PAGES[code]}?from=${from}`);
}

/* The page that sent the person here, only when it is a page of this website */
export function cameFrom() {
  const from = new URLSearchParams(window.location.search).get('from') || '';
  return from.startsWith(window.location.origin) ? from : '';
}

/* Makes the shared buttons of an error page work:
     #home   goes to the person's own first page (or the landing page for visitors)
     #back   goes back to the page before, or home when there is none */
export async function setUpErrorPage() {
  const home = document.querySelector('#home');
  const back = document.querySelector('#back');

  home.href = `${ROOT}index.html`;
  back?.addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = home.href;
  });

  // who is signed in decides where "home" is; if this fails (for example the
  // server is down on the 500 page), the landing page stays the home
  try {
    const account = await getAccount();
    if (HOMES[account.role]) home.href = `${ROOT}${HOMES[account.role]}`;
  } catch {
    // keep the landing page
  }
}
