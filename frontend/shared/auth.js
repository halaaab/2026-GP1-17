/* ==========================================================
   Auth: everything about accounts, in one place.
   Pages call these functions; they never talk to Supabase Auth directly.

     import { logIn, signUp, logOut } from '../../../shared/auth.js';

   Every function that can fail returns an object:
     { ok: true,  ... }                  when it worked
     { ok: false, error: 'error.key' }   when it did not; the key is in translations/
   ========================================================== */

import { supabase } from './supabase.js';
import { t } from './language.js';

// Address of the frontend/ folder, so links work from any page depth
const ROOT = new URL('..', import.meta.url).href;

const PAGES = {
  login:           'pages/auth/login/login.html',
  adminLogin:      'pages/admin/admin-login/admin-login.html',
  resetPassword:   'pages/auth/reset-password/reset-password.html',
  // people who signed in with Google finish their profile on the sign-up page
  completeProfile: 'pages/auth/sign-up/sign-up.html',
  founderHome:     'pages/founder/chatbot/chatbot.html',
  adminHome:       'pages/admin/overview-dashboard/overview-dashboard.html',
};

/* Turns a Supabase error into one of our translation keys */
function errorKey(error) {
  const message = (error?.message || '').toLowerCase();

  // Shown in the browser console (Developer Tools) so the real cause is easy to find
  console.error('Supabase said:', error?.status, error?.message);

  if (message.includes('sending') && message.includes('email')) return 'error.emailSend';
  if (message.includes('database error saving new user'))       return 'error.saveUser';

  if (message.includes('invalid login credentials')) return 'error.invalidLogin';
  if (message.includes('already registered'))        return 'error.emailTaken';
  if (message.includes('email not confirmed'))       return 'error.notConfirmed';
  if (message.includes('rate limit') || error?.status === 429) return 'error.tooMany';
  if (message.includes('security purposes'))         return 'error.tooMany';
  if (message.includes('different from the old'))     return 'error.samePassword';
  if (message.includes('password'))                  return 'error.password';

  return 'error.generic';
}

/* ---------- Password rules ----------
   These must match the rules set in Supabase (Authentication → Sign In / Providers
   → Email → password requirements): lowercase, uppercase, number and symbol.
   Each rule answers true when the password meets it. */
export const PASSWORD_RULES = {
  length: (password) => password.length >= 8,
  lower:  (password) => /[a-z]/.test(password),
  upper:  (password) => /[A-Z]/.test(password),
  number: (password) => /[0-9]/.test(password),
  symbol: (password) => /[^A-Za-z0-9]/.test(password),
};

export function isGoodPassword(password) {
  return Object.values(PASSWORD_RULES).every((rule) => rule(password));
}

// The words for each rule, in translations/ (the same words as the tick list under the password box)
const PASSWORD_RULE_WORDS = {
  length: 'reset.rule1',
  lower:  'reset.rule2',
  upper:  'reset.rule3',
  number: 'reset.rule4',
  symbol: 'reset.rule5',
};

/* Returns a sentence naming exactly what the password is still missing,
   for example "Your password still needs: an uppercase letter, a symbol."
   Returns '' when the password meets every rule. */
export function passwordProblem(password) {
  const missing = Object.keys(PASSWORD_RULES)
    .filter((name) => !PASSWORD_RULES[name](password))
    .map((name) => t(PASSWORD_RULE_WORDS[name]));

  if (missing.length === 0) return '';

  const comma = document.documentElement.dir === 'rtl' ? '، ' : ', ';
  return `${t('error.passwordMissing')} ${missing.join(comma)}.`;
}

/* ---------- Sign up ---------- */

/* Creates a founder account.
   userType is one of: 'student', 'entrepreneur', 'business_owner', 'investor'.
   details holds the extra answers for that type, named like the columns of the
   users table, for example { education_level: 'bachelor', field_of_study: 'IT' }.

   The database creates the row in the users table by itself (see the migration),
   but only with the name, username and type. The details wait inside the account
   ("pending_profile") and are saved to the row the first time the person signs in,
   because nobody can edit a row before they are signed in.
   Returns needsEmailConfirmation: true when the person must click the link in their inbox first. */
export async function signUp({ email, password, fullName, username, userType, details }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: ROOT + PAGES.login,
      data: {
        full_name: fullName,
        username: username,
        user_type: userType,
        locale: document.documentElement.lang === 'en' ? 'en' : 'ar',
        pending_profile: details || null,
      },
    },
  });

  if (error) {
    return { ok: false, error: errorKey(error) };
  }

  // Supabase hides "this email is taken" for privacy: it answers with a user that has no identities
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    return { ok: false, error: 'error.emailTaken' };
  }

  return { ok: true, needsEmailConfirmation: !data.session };
}

/* For people who signed in with Google: they have an account but no row in
   the users table yet. This creates the row from their answers. */
export async function completeProfile({ fullName, username, userType, details }) {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: 'error.generic' };
  }

  const { error } = await supabase.from('users').insert({
    user_id: user.id,
    full_name: fullName,
    username: username,
    user_type: userType,
    locale: document.documentElement.lang === 'en' ? 'en' : 'ar',
    ...details,
  });

  if (error) {
    // Shown in the browser console (Developer Tools) so the real cause is easy to find
    console.error('Could not save the profile:', error.code, error.message, error.details);

    // 23505 = "this value is already used". Which value?
    if (error.code === '23505') {
      const about = `${error.message} ${error.details}`.toLowerCase();

      if (about.includes('username')) {
        return { ok: false, error: 'error.usernameTaken' };
      }
      // otherwise it is the person's own row: the profile was already saved earlier
      return { ok: true };
    }

    // 23503 = the login belongs to an account that no longer exists
    if (error.code === '23503') {
      await supabase.auth.signOut({ scope: 'local' });
      return { ok: false, error: 'error.sessionEnded' };
    }
    return { ok: false, error: 'error.generic' };
  }
  return { ok: true };
}

/* ---------- Log in and log out ---------- */

export async function logIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { ok: false, error: errorKey(error) };
  }
  return { ok: true };
}

/* Sends the person to Google, then back to the login page, which forwards them on */
export async function logInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: ROOT + PAGES.login },
  });

  if (error) {
    return { ok: false, error: errorKey(error) };
  }
  return { ok: true };
}

/* Signs out, then goes to the right login page: admins to the admin login,
   everyone else to the founder login. Pass false to stay on the current page. */
export async function logOut(goToLoginPage = true) {
  const wasAdmin = document.body.dataset.layout === 'admin';
  await supabase.auth.signOut();

  if (goToLoginPage) {
    window.location.href = ROOT + (wasAdmin ? PAGES.adminLogin : PAGES.login);
  }
}

/* ---------- Forgotten password ---------- */

/* Emails a link that opens the reset-password page.
   It answers ok even when no account has that email, so nobody can use
   this form to find out who has a Darb account. */
export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: ROOT + PAGES.resetPassword,
  });

  if (error) {
    return { ok: false, error: errorKey(error) };
  }
  return { ok: true };
}

/* Sets a new password for the person who is signed in.
   Opening the link from the reset email signs them in just for this. */
export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    return { ok: false, error: errorKey(error) };
  }
  return { ok: true };
}

/* ---------- Two-step sign-in for admins ----------
   After the password, Darb emails the admin a 6-digit code and the admin
   types it in. Supabase calls this an "email OTP" (one-time password). */

/* How this browser signed in, read from the session: 'password', 'otp', 'oauth'... */
async function signInMethods() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return [];

  // the session token has three parts joined by dots; the middle one holds the details
  const middle = data.session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const details = JSON.parse(atob(middle));
  return (details.amr || []).map((entry) => entry.method);
}

/* Where the signed-in admin stands:
     'done'  the emailed code was entered in this session
     'code'  only the password so far; a code is still needed */
export async function getSecondStep() {
  const methods = await signInMethods();
  return methods.includes('otp') || methods.includes('magiclink') ? 'done' : 'code';
}

/* Emails a new 6-digit code. Supabase allows one email per minute for each address. */
export async function sendEmailCode(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },   // never creates an account
  });

  if (error) {
    console.error('Supabase said:', error.status, error.message);
    return { ok: false, error: error.status === 429 ? 'error.codeWait' : 'error.codeNotSent' };
  }
  return { ok: true };
}

/* Checks the 6-digit code from the email */
export async function checkCode(email, code) {
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error) {
    return { ok: false, error: 'error.code' };
  }
  return { ok: true };
}

/* ---------- Who is logged in? ---------- */

/* Returns the logged-in account, or null */
export async function getCurrentUser() {
  const { data } = await supabase.auth.getSession();
  return data.session ? data.session.user : null;
}

/* Returns what kind of account is logged in:
     { role: 'admin',   profile }   a row in the admins table
     { role: 'founder', profile }   a row in the users table
     { role: 'new' }                logged in (for example with Google) but no profile yet
     { role: 'none' }               nobody is logged in */
export async function getAccount() {
  if (!(await getCurrentUser())) {
    return { role: 'none' };
  }

  // The browser can still hold a login for an account that was deleted
  // (for example from the Supabase dashboard). Ask Supabase if it still exists.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    await supabase.auth.signOut({ scope: 'local' });
    return { role: 'none' };
  }
  const user = data.user;

  // Is this an admin? After migration 0003 the admins table can only be read once the
  // second step (the emailed code) is passed, so we first ask a small database function
  // that answers yes or no at any time. Before that migration, the function does not
  // exist and we simply read the table as before.
  const admin = await supabase.from('admins').select('*').eq('admin_id', user.id).maybeSingle();
  const asked = await supabase.rpc('is_admin_account');

  if (admin.data || asked.data === true) {
    return { role: 'admin', profile: admin.data };   // profile is empty until the code step is passed
  }

  const founder = await supabase.from('users').select('*').eq('user_id', user.id).maybeSingle();
  if (founder.data) {
    return { role: 'founder', profile: founder.data };
  }

  return { role: 'new' };
}

/* After a successful login: sends each kind of account to its own first page.
   Returns { ok: false, error } when the account is not allowed in,
   and { ok: true, leaving: true } when the browser is moving to another page. */
export async function goToHomePage() {
  const account = await getAccount();

  // If guard.js sent the person to log in, it remembered the page they wanted.
  // (That page's own guard checks again that they are allowed to see it.)
  const wanted = sessionStorage.getItem('darb-next');
  sessionStorage.removeItem('darb-next');

  if (account.role === 'admin') {
    // an admin must enter the emailed code before any admin page opens
    const step = await getSecondStep();
    if (step === 'done') {
      window.location.href = wanted || ROOT + PAGES.adminHome;
    } else {
      if (wanted) sessionStorage.setItem('darb-next', wanted);
      window.location.href = ROOT + PAGES.adminLogin;
    }
  } else if (account.role === 'founder') {
    if (account.profile.status === 'deactivated') {
      await supabase.auth.signOut();
      return { ok: false, error: 'error.deactivated' };
    }
    await savePendingProfile();
    window.location.href = wanted || ROOT + PAGES.founderHome;
  } else if (account.role === 'new') {
    window.location.href = ROOT + PAGES.completeProfile;
  }

  // leaving = the browser is on its way to another page
  return { ok: true, leaving: account.role !== 'none' };
}

/* Saves the extra sign-up answers that were waiting inside the account
   (see signUp above), then clears them so this only happens once. */
async function savePendingProfile() {
  const user = await getCurrentUser();
  const details = user?.user_metadata?.pending_profile;
  if (!details) return;

  const { error } = await supabase.from('users').update(details).eq('user_id', user.id);
  if (!error) {
    await supabase.auth.updateUser({ data: { pending_profile: null } });
  }
}

/* The sidebar's logout button (built by layout.js) works on every page that
   loads this file. guard.js loads it, so every guarded page has a working logout. */
document.addEventListener('click', (event) => {
  if (event.target.closest('[data-logout]')) {
    logOut();
  }
});
