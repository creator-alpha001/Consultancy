import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Getting back in, the account page, and the verification decision.
 *
 * Tested by consequence: where each action sends someone, what it sent to
 * the API, and what it left in the cookie jar.
 */

const { cookieStore, redirect, me } = vi.hoisted(() => ({
  cookieStore: new Map<string, string>(),
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
  me: { current: { id: 'u1', email: 'a@test.local', role: 'seeker' as 'seeker' | 'provider' | 'admin' } },
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name) } : undefined),
    set: (name: string, value: string) => cookieStore.set(name, value),
    delete: (name: string) => cookieStore.delete(name),
  }),
}));
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/session', async (orig) => ({
  ...(await orig<typeof import('@/lib/session')>()),
  requireAuth: vi.fn(async () => me.current),
  requireRole: vi.fn(async () => me.current),
}));

const account = await import('./account');
const verification = await import('./verification');

async function landsOn(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.startsWith('REDIRECT:')) return message.slice('REDIRECT:'.length);
    throw err;
  }
  throw new Error('expected a redirect and got none');
}

const calls: Array<{ url: string; body: unknown }> = [];

function apiAnswers(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return { status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body) };
    }),
  );
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

beforeEach(() => {
  cookieStore.clear();
  calls.length = 0;
  me.current = { id: 'u1', email: 'a@test.local', role: 'seeker' };
});

describe('forgot password', () => {
  it('says the same thing when the API fails as when it succeeds', async () => {
    apiAnswers(500, { error: { code: 'UNKNOWN', message: 'boom' } });
    expect(await landsOn(() => account.requestPasswordReset(form({ email: 'x@test.local' })))).toBe(
      '/forgot-password?sent=1',
    );
  });
});

describe('reset password', () => {
  it('returns the code instead of redirecting, so the token in the fragment survives', async () => {
    apiAnswers(400, { error: { code: 'TOKEN_INVALID', message: 'no' } });
    expect(await account.resetPassword('t'.repeat(40), 'a long enough passphrase')).toEqual({ error: 'TOKEN_INVALID' });
  });

  it('drops this browser’s session cookie on success — the API revoked it', async () => {
    cookieStore.set('sankalp_session', 'old');
    apiAnswers(201, { ok: true });
    expect(await account.resetPassword('t'.repeat(40), 'a long enough passphrase')).toEqual({ error: null });
    expect(cookieStore.has('sankalp_session')).toBe(false);
  });
});

describe('profile', () => {
  it('never sends a bio for a seeker', async () => {
    apiAnswers(201, {});
    await landsOn(() =>
      account.updateProfile(form({ displayName: 'Asha', preferredLang: 'hi', bio: 'should not be sent' })),
    );
    expect(calls[0]?.body).toEqual({ displayName: 'Asha', preferredLang: 'hi' });
  });

  it('sends a provider’s headline, bio and the language it was written in', async () => {
    me.current = { ...me.current, role: 'provider' };
    apiAnswers(201, {});
    await landsOn(() =>
      account.updateProfile(
        form({ displayName: 'Dev', preferredLang: 'en', headline: 'Essays', bio: 'निबंध', bioLang: 'hi' }),
      ),
    );
    expect(calls[0]?.body).toEqual({ displayName: 'Dev', preferredLang: 'en', headline: 'Essays', bio: 'निबंध', bioLang: 'hi' });
  });
});

describe('verification decisions', () => {
  it('refuses a rejection without a reason, before calling the API', async () => {
    me.current = { ...me.current, role: 'admin' };
    apiAnswers(201, {});
    const to = await landsOn(() =>
      verification.decideCredential(form({ credentialId: 'c1', decision: 'rejected', note: 'no' })),
    );
    expect(to).toContain('error=REASON_REQUIRED');
    expect(calls).toHaveLength(0);
  });

  it('sends the decision and never a reviewer id', async () => {
    me.current = { ...me.current, role: 'admin' };
    apiAnswers(201, {});
    const to = await landsOn(() =>
      verification.decideCredential(form({ credentialId: 'c1', decision: 'verified', note: 'Matched the list' })),
    );
    expect(to).toBe('/admin/verification?notice=verified');
    expect(calls[0]?.url).toContain('/admin/credentials/c1/decide');
    expect(calls[0]?.body).toEqual({ decision: 'verified', note: 'Matched the list' });
  });
});
