// Server check: who is calling. It runs before every API request, so the founder's id always comes from
// their Supabase login, never from what the caller claims.
//
// Live (AUTH_MODE=required, the default when NODE_ENV=production): every request needs
// "Authorization: Bearer <the founder's Supabase access token>". The token is checked with Supabase,
// the account must be active, and the user id from the token replaces anything the caller sent.
//
// Testing (AUTH_MODE=dev, the default otherwise): requests without a token are let through, so Mastra Studio
// works and a tester can type a userId in the request context. A request that does send a token is still checked.
import { MASTRA_RESOURCE_ID_KEY } from '@mastra/core/request-context';
import type { Context, Next } from 'hono';
import { getSupabase } from '../lib/supabase';

type RequestContextLike = { get: (key: string) => unknown; set: (key: string, value: unknown) => void; delete: (key: string) => boolean };

export function authRequired(): boolean {
  const mode = process.env.AUTH_MODE ?? (process.env.NODE_ENV === 'production' ? 'required' : 'dev');
  return mode !== 'dev';
}

// Returns the user id for a valid token of an active account, or null.
export async function userIdFromToken(token: string): Promise<string | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  // A deactivated account is refused even with a valid token.
  const { data: profile, error: profileError } = await supabase.from('founders').select('status').eq('user_id', data.user.id).maybeSingle();
  if (profileError || !profile || profile.status !== 'active') return null;
  return data.user.id;
}

export async function authMiddleware(c: Context, next: Next) {
  const requestContext = c.get('requestContext') as RequestContextLike | undefined;
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;

  if (token) {
    const userId = await userIdFromToken(token);
    if (!userId) return c.json({ error: 'Your session is not valid. Please sign in again.' }, 401);
    // The token decides who the founder is: for the tools (userId) and for the agent's memory (resource id).
    requestContext?.set('userId', userId);
    requestContext?.set(MASTRA_RESOURCE_ID_KEY, userId);
    return next();
  }

  if (authRequired()) {
    requestContext?.delete('userId'); // never trust an id the caller typed
    return c.json({ error: 'Please sign in to use Darb.' }, 401);
  }
  return next(); // testing only: Studio without a login
}
