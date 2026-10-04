// =========================================================
// connection-test.js — checks this computer can reach Supabase.
// =========================================================

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '/shared/config.js';
import { supabase } from '/shared/supabase.js';

const list = document.querySelector('#results');
list.innerHTML = '';

function show(ok, text) {
  const row = document.createElement('li');
  row.className = `test__row test__row--${ok ? 'ok' : 'fail'}`;
  row.textContent = `${ok ? '✓' : '✗'} ${text}`;
  list.appendChild(row);
}

// 1. Are the keys filled in?
if (SUPABASE_URL.includes('PASTE') || SUPABASE_PUBLISHABLE_KEY.includes('PASTE')) {
  show(false, 'config.js still has the placeholder text. Paste the Project URL and publishable key.');
} else {
  show(true, `Project URL: ${SUPABASE_URL}`);

  // 2. Can we reach Supabase Auth, and which login methods are on?
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const settings = await response.json();
    show(true, 'Connected to Supabase');
    show(settings.external?.email, `Email login: ${settings.external?.email ? 'on' : 'off'}`);
    show(settings.external?.google, `Google login: ${settings.external?.google ? 'on' : 'off'}`);
  } catch (error) {
    show(false, `Could not reach Supabase (${error.message}). Check the URL and key in config.js.`);
  }

  // 3. Do the tables exist, and are they protected from visitors?
  for (const table of ['users', 'admins']) {
    const { error, status } = await supabase.from(table).select('*').limit(1);
    if (!error) {
      show(false, `${table} table: visible to visitors who are not logged in — security rules missing`);
    } else if (error.code === '42501' || status === 401 || status === 403 || /permission denied/i.test(error.message)) {
      show(true, `${table} table: exists and is protected`);
    } else if (error.code === 'PGRST205' || status === 404 || /could not find|does not exist/i.test(error.message)) {
      show(false, `${table} table: not found — run 0001_users_and_admins.sql in the SQL Editor`);
    } else {
      show(false, `${table} table: ${error.message || 'error ' + status} (code ${error.code || '-'})`);
    }
  }
}
