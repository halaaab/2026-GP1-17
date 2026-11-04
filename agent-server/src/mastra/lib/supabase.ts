// Shared Supabase client for the tools. It uses the secret key, so it runs on the server only.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;

// Created on first use, so tests and files that never touch the database need no keys.
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
