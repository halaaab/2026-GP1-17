// Tests for the server's login check. Supabase is replaced by a fake that knows two tokens.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getUser: async (token: string) =>
        token === 'good-token'
          ? { data: { user: { id: 'real-user' } }, error: null }
          : token === 'deactivated-token'
            ? { data: { user: { id: 'blocked-user' } }, error: null }
            : { data: { user: null }, error: new Error('invalid token') },
    },
    from: () => {
      let id = '';
      const query = {
        select: () => query,
        eq: (_c: string, value: string) => {
          id = value;
          return query;
        },
        maybeSingle: async () => ({ data: { status: id === 'real-user' ? 'active' : 'deactivated' }, error: null }),
      };
      return query;
    },
  }),
}));

const { authMiddleware } = await import('./auth');

// A fake request: its headers, the request context, and what the server answered.
function fakeRequest(authorization?: string, typedUserId?: string) {
  const values = new Map<string, unknown>(typedUserId ? [['userId', typedUserId]] : []);
  const requestContext = { get: (k: string) => values.get(k), set: (k: string, v: unknown) => values.set(k, v), delete: (k: string) => values.delete(k) };
  const c = {
    get: () => requestContext,
    req: { header: (name: string) => (name === 'Authorization' ? authorization : undefined) },
    json: (body: unknown, status: number) => ({ body, status }),
  };
  const next = vi.fn(async () => undefined);
  return { c, next, values };
}

afterEach(() => {
  delete process.env.AUTH_MODE;
});

describe('login check', () => {
  it('takes the user id from a valid token, replacing an id the caller typed', async () => {
    const { c, next, values } = fakeRequest('Bearer good-token', 'someone-else');
    await authMiddleware(c as never, next);
    expect(next).toHaveBeenCalled();
    expect(values.get('userId')).toBe('real-user');
    expect(values.get('mastra__resourceId')).toBe('real-user'); // the agent's memory belongs to the same user
  });

  it('refuses a bad token', async () => {
    const { c, next } = fakeRequest('Bearer stolen-token');
    const answer: any = await authMiddleware(c as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(answer.status).toBe(401);
  });

  it('refuses a deactivated account even with a valid token', async () => {
    const { c, next } = fakeRequest('Bearer deactivated-token');
    const answer: any = await authMiddleware(c as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(answer.status).toBe(401);
  });

  it('live, refuses a request without a token and drops the typed id', async () => {
    process.env.AUTH_MODE = 'required';
    const { c, next, values } = fakeRequest(undefined, 'someone-else');
    const answer: any = await authMiddleware(c as never, next);
    expect(answer.status).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(values.has('userId')).toBe(false);
  });

  it('in testing mode, lets Studio through without a token', async () => {
    process.env.AUTH_MODE = 'dev';
    const { c, next } = fakeRequest();
    await authMiddleware(c as never, next);
    expect(next).toHaveBeenCalled();
  });
});
