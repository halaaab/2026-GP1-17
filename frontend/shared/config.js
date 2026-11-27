
export const SUPABASE_URL = 'https://pgodmkrtwthjfstxqhfa.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_aHkceIsPne6pL96JHBACww_7GIIqcHB';

// The Darb agent server (folder agent-server). Hosted on Render; when the website itself is opened from this computer
// (localhost), it uses the agent server running here ("npm run dev"), so testing locally still works.
// No API key ever goes in this file: the server keeps the keys, and the website only sends the founder's login.
// true when the website is opened from this computer (localhost), false on the hosted website.
// Release 2 pages work fully here, and show "Coming soon" on the hosted website.
export const IS_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

export const AGENT_SERVER_URL = IS_LOCAL
  ? 'http://localhost:4111'
  : 'https://two026-gp1-g17.onrender.com';
