import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Who is signed in, and who may stand where.
 *
 * `requireRole` is the second layer, not the first — the API re-checks
 * the actor on every call it serves, so a screen cannot grant access to
 * data by rendering. It still deserves tests: it decides where someone
 * is SENT, and "redirected to the home page" versus "redirected to
 * sign-in" is the difference between a confusing dead end and an
 * actionable one.
 */

const { cookieStore, redirect } = vi.hoisted(() => ({
  cookieStore: new Map<string, string>(),
  redirect: vi.fn((to: string) => {
    // The real one throws to halt rendering. Mirroring that is what
    // makes "does it stop here?" testable at all.
    throw new Error(`REDIRECT:${to}`);
  }),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name) } : undefined),
    set: (name: string, value: string) => cookieStore.set(name, value),
    delete: (name: string) => cookieStore.delete(name),
  }),
}));
vi.mock('next/navigation', () => ({ redirect }));

const { currentUser, requireRole, setSessionCookie, clearSessionCookie, setEnrolmentCookie } =
  await import('./session');

function signedInAs(role: string, status = 200) {
  cookieStore.set('sankalp_session', 'token');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      status,
      ok: status === 200,
      text: async () =>
        status === 200
          ? JSON.stringify({ id: 'u1', email: 'a.person@demo.local', role, status: 'active' })
          : JSON.stringify({ error: { code: 'UNAUTHORISED', message: 'no' } }),
    })),
  );
}

/** What `requireRole` did: the path it sent them to, or null if it let them through. */
async function redirectedTo(role: 'seeker' | 'provider' | 'admin', path: string): Promise<string | null> {
  try {
    await requireRole(role, path);
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.startsWith('REDIRECT:')) return message.slice('REDIRECT:'.length);
    throw err;
  }
}

beforeEach(() => {
  cookieStore.clear();
  redirect.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('currentUser', () => {
  it('is null for a visitor, without calling the API at all', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await currentUser()).toBeNull();
    // No cookie means no question worth asking.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns the person the API says they are', async () => {
    signedInAs('provider');
    expect((await currentUser())?.role).toBe('provider');
  });

  /*
   * The role comes from the API, which re-reads it from the database on
   * every request — never from anything the browser holds. A stale or
   * revoked session is "not signed in", not an error page.
   */
  it('treats a rejected session as signed out rather than throwing', async () => {
    signedInAs('seeker', 401);
    expect(await currentUser()).toBeNull();
  });
});

describe('requireRole', () => {
  it('sends a visitor to sign in, and remembers where they were going', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const to = await redirectedTo('admin', '/admin/config');
    expect(to).toBe('/login?next=%2Fadmin%2Fconfig');
  });

  it('lets the matching role through', async () => {
    signedInAs('provider');
    expect(await redirectedTo('provider', '/provider/services')).toBeNull();
  });

  /*
   * An admin may stand on any surface; nobody else may stand on the
   * admin one. Operations staff need to see what a seeker sees in order
   * to answer a ticket about it.
   */
  it('lets an admin onto another surface', async () => {
    signedInAs('admin');
    expect(await redirectedTo('provider', '/provider/services')).toBeNull();
    expect(await redirectedTo('seeker', '/money')).toBeNull();
  });

  it('turns a seeker away from the operations console', async () => {
    signedInAs('seeker');
    // Home, not sign-in: they ARE signed in, so a login form would be a
    // dead end that invites them to try the same credentials again.
    expect(await redirectedTo('admin', '/admin')).toBe('/');
  });

  it('turns a provider away from the operations console', async () => {
    signedInAs('provider');
    expect(await redirectedTo('admin', '/admin')).toBe('/');
  });

  it('turns a seeker away from the provider surface', async () => {
    signedInAs('seeker');
    expect(await redirectedTo('provider', '/provider')).toBe('/');
  });

  it('escapes the return path rather than splicing it in raw', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const to = await redirectedTo('admin', '/admin/config/domains/upsc_cse?tab=1');
    expect(to).toContain('%3Ftab%3D1');
    expect(to?.startsWith('/login?next=')).toBe(true);
  });
});

describe('cookies', () => {
  it('keeps the session and the enrolment ticket apart', async () => {
    await setSessionCookie('sess');
    await setEnrolmentCookie('enrol');
    expect(cookieStore.get('sankalp_session')).toBe('sess');
    expect(cookieStore.get('sankalp_enrolment')).toBe('enrol');
  });

  it('drops the session on sign-out', async () => {
    await setSessionCookie('sess');
    await clearSessionCookie();
    expect(cookieStore.has('sankalp_session')).toBe(false);
  });
});
