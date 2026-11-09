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
  if (message.includes('totp') || message.includes('mfa')) return 'error.code';
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

/* ---------- Founder types (migration 0022) ----------
   A founder is one of four types, or none of them ("just a founder").
   Each type has its own table with only that type's answers.
   Answers every founder gives (country, region...) stay in the users table. */

export const FOUNDER_TABLES = {
  student: 'students',
  entrepreneur: 'entrepreneurs',
  business_owner: 'business_owners',
  investor: 'investors',
};

const COMMON_COLUMNS = ['country_code', 'region', 'phone'];

/* Splits the sign-up answers into the users part and the type's own part */
function splitDetails(details) {
  const common = {};
  const own = {};
  Object.entries(details || {}).forEach(([column, value]) => {
    if (COMMON_COLUMNS.includes(column)) common[column] = value;
    else own[column] = value;
  });
  return { common, own };
}

/* Saves the answers of a founder whose rows already exist */
async function saveDetails(userId, userType, details) {
  const { common, own } = splitDetails(details);
  const table = FOUNDER_TABLES[userType];

  if (Object.keys(common).length > 0) {
    const { error } = await supabase.from('founders').update(common).eq('user_id', userId);
    if (error) return error;
  }
  if (table && Object.keys(own).length > 0) {
    const { error } = await supabase.from(table).update(own).eq('user_id', userId);
    if (error) return error;
  }
  return null;
}

/* ---------- Sign up ---------- */

/* Creates a founder account.
   userType is one of: 'student', 'entrepreneur', 'business_owner', 'investor', or 'none'.
   details holds the extra answers, named like the database columns,
   for example { region: 'riyadh', education_level: 'bachelor', field_of_study: 'IT' }.

   The database creates the row in users, and the row in the type's table,
   by itself (see migration 0022), but empty. The details wait inside the account
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

/* Is this username still free? The database answers yes or no (migration 0004).
   If the question itself fails, the answer is "yes" so sign-up is never blocked by it;
   the database still refuses a username that is really taken. */
export async function isUsernameFree(username) {
  const { data, error } = await supabase.rpc('username_is_free', { wanted: username });
  return error ? true : data;
}

/* For people who signed in with Google: they have an account but no row in
   the users table yet. This creates the row from their answers. */
export async function completeProfile({ fullName, username, userType, details }) {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: 'error.generic' };
  }

  const { common, own } = splitDetails(details);

  const { error } = await supabase.from('founders').insert({
    user_id: user.id,
    full_name: fullName,
    username: username,
    locale: document.documentElement.lang === 'en' ? 'en' : 'ar',
    ...common,
  });

  // then the row in the type's own table ("none" has no table)
  const table = FOUNDER_TABLES[userType];
  if (!error && table) {
    const typeRow = await supabase.from(table).insert({ user_id: user.id, ...own });
    if (typeRow.error) {
      console.error('Could not save the type answers:', typeRow.error.code, typeRow.error.message);
      return { ok: false, error: 'error.generic' };
    }
  }

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
  // the email is written in the language saved on the account: make it the page's language
  // (migration 0016; without it the email keeps the account's language)
  await supabase.rpc('set_email_language', {
    target_email: email,
    language: document.documentElement.lang === 'en' ? 'en' : 'ar',
  });

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
   After the password, an admin enters a 6-digit code from an authenticator app
   on their phone (Google Authenticator, Microsoft Authenticator...).
   Supabase calls this "MFA" with a "TOTP factor". */

/* Where the signed-in admin stands:
     'done'   the code was entered in this session
     'code'   the phone is set up; ask for a code
     'setup'  no phone set up yet; show the QR code */
export async function getSecondStep() {
  const level = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (level.data && level.data.currentLevel === 'aal2') {
    return 'done';
  }

  const factors = await supabase.auth.mfa.listFactors();
  const phoneIsSetUp = factors.data && factors.data.totp.length > 0;
  return phoneIsSetUp ? 'code' : 'setup';
}

/* Starts the one-time setup. Returns the QR code to scan and the same key as text. */
export async function startAuthenticatorSetup() {
  // throw away setups that were started earlier but never finished
  const factors = await supabase.auth.mfa.listFactors();
  const unfinished = (factors.data ? factors.data.all : []).filter((factor) => factor.status !== 'verified');
  for (const factor of unfinished) {
    await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Darb admin' });
  if (error) {
    console.error('Supabase said:', error.status, error.message);
    return { ok: false, error: 'error.twoStepOff' };
  }

  return { ok: true, factorId: data.id, qrCode: data.totp.qr_code, key: data.totp.secret };
}

/* Checks a 6-digit code. Pass the factorId from startAuthenticatorSetup during setup;
   leave it out at a normal sign-in and the admin's phone is looked up. */
export async function checkCode(code, factorId) {
  let id = factorId;

  if (!id) {
    const factors = await supabase.auth.mfa.listFactors();
    id = factors.data && factors.data.totp[0] ? factors.data.totp[0].id : null;
  }
  if (!id) {
    return { ok: false, error: 'error.twoStepOff' };
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code });
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
  // second step (the code from the authenticator app) is passed, so we first ask a small database function
  // that answers yes or no at any time. Before that migration, the function does not
  // exist and we simply read the table as before.
  const admin = await supabase.from('admins').select('*').eq('user_id', user.id).maybeSingle();
  const asked = await supabase.rpc('is_admin_account');

  if (admin.data || asked.data === true) {
    return { role: 'admin', profile: admin.data };   // profile is empty until the code step is passed
  }

  // founder_profiles = the users row plus the type and its answers (migration 0022)
  const founder = await supabase.from('founder_profiles').select('*').eq('user_id', user.id).maybeSingle();
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
  // Founders are taken back to that page. Admins always start on the overview.
  const wanted = sessionStorage.getItem('darb-next');
  sessionStorage.removeItem('darb-next');

  if (account.role === 'admin') {
    // an admin must enter the code from the authenticator app before any admin page opens
    const step = await getSecondStep();
    window.location.href = ROOT + (step === 'done' ? PAGES.adminHome : PAGES.adminLogin);
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

  const error = await saveDetails(user.id, user.user_metadata.user_type, details);
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
