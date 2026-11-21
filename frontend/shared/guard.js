/* ==========================================================
   Guard: keeps a page for the people it is meant for.

   Add this ONE line to every founder or admin page, after layout.js:

     <script type="module" src="../../../shared/guard.js"></script>

   It reads data-layout on <body> and does the rest:
     data-layout="admin"    only admins get in, and only after the code from the authenticator app on their phone
     data-layout="founder"  only founders get in
   Anyone else is sent to the right login page (or to their own first page).

   A founder page that visitors may also see, like the explorers, adds
   data-access="public" to <body>: nobody is sent away, and signed-in people
   still see their name in the sidebar.

   A page that should show the 403 "no access" page to the wrong kind of
   account adds data-denied="403" to <body> (the others send that account
   to its own first page, as before).

   The guard also:
     - shows the signed-in person's name at the bottom of the sidebar
     - makes the sidebar's logout button work

   To know who is signed in from your page's own JavaScript, ask auth.js:
     import { getAccount } from '../../../shared/auth.js';
     const account = await getAccount();
     console.log(account.profile.full_name);
   (Do not import "account" from this file: Safari can run your page's file
   before the guard has finished, and the value would not be ready.)
   ========================================================== */

import { getAccount, getCurrentUser, getSecondStep, logOut } from './auth.js';
import { setSidebarUser } from './layout.js';
import { showSidebarHistory } from './assessments.js';

// Address of the frontend/ folder, so links work from any page depth
const ROOT = new URL('..', import.meta.url).href;

const PAGES = {
  login:       'pages/auth/login/login.html',
  adminLogin:  'pages/admin/admin-login/admin-login.html',
  signUp:      'pages/auth/sign-up/sign-up.html',
  founderHome: 'pages/founder/chatbot/chatbot.html',
  adminHome:   'pages/admin/overview-dashboard/overview-dashboard.html',
  noAccess:    'pages/errors/403-no-access/403-no-access.html',
};

const neededRole = document.body.dataset.layout;               // 'admin' or 'founder'
const isPublic = document.body.dataset.access === 'public';    // visitors allowed too
// data-denied="403": the wrong kind of account sees the "no access" page
// instead of being sent to its own first page
const showsNoAccess = document.body.dataset.denied === '403';

// The page's content stays hidden until we know the person may see it (see shared.css)
document.body.classList.add('is-guarded');

// The browser's Back button can show a page from its memory without running this check again
// (for example after signing out). Loading it again makes the check run.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload();
});

function sendTo(page) {
  window.location.replace(ROOT + page);
}

// Remembers the page the person wanted, so login can bring them back to it
function sendToLogin(page) {
  sessionStorage.setItem('darb-next', window.location.href);
  sendTo(page);
}

// The 403 page remembers the page that was refused, so "Log in with another account" can return to it
function sendToNoAccess() {
  sendTo(`${PAGES.noAccess}?from=${encodeURIComponent(window.location.href)}`);
}

/* Who is signed in: { role: 'admin' | 'founder' | 'new' | 'none', profile } */
export const account = await getAccount();

let allowed = isPublic || account.role === neededRole;

if (account.role === 'founder' && account.profile.status === 'deactivated') {
  // a deactivated founder is signed out everywhere
  allowed = false;
  await logOut();
} else if (!allowed) {
  if (account.role === 'none') {
    sendToLogin(neededRole === 'admin' ? PAGES.adminLogin : PAGES.login);
  } else if (account.role === 'new') {
    sendTo(PAGES.signUp);          // signed in with Google, profile not finished
  } else if (showsNoAccess) {
    sendToNoAccess();              // the wrong kind of account, on a page that asks for 403
  } else if (account.role === 'admin') {
    sendTo(PAGES.adminHome);       // an admin on a founder page
  } else {
    sendTo(PAGES.founderHome);     // a founder on an admin page
  }
}

// An admin page also needs the second step: the code from the admin's authenticator app.
// Without it, the admin goes back to the admin login, which asks for the code.
if (allowed && neededRole === 'admin' && (await getSecondStep()) !== 'done') {
  allowed = false;
  sendToLogin(PAGES.adminLogin);
}

if (allowed) {
  document.body.classList.add('is-allowed');

  // the name and a second line (email for admins, "Founder" stays for founders)
  if (account.profile) {
    const user = await getCurrentUser();
    setSidebarUser(account.profile.full_name, account.role === 'admin' ? user.email : '');
  }

  // founder pages list the founder's past assessments in the sidebar
  if (neededRole === 'founder') {
    showSidebarHistory();
  }
}
