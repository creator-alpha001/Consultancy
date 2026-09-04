import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Signing in, joining, and the second factor.
 *
 * Two things here are security decisions rather than plumbing: where a
 * `?next=` may send someone, and whether a correct password alone can
 * ever produce a session for a role that must hold 2FA. Both are tested
 * by their consequence — where the action redirects and what it wrote
 * to the cookie jar — because that is what a caller actually observes.
 */

const { cookieStore, redirect } = vi.hoisted(() => ({
  cookieStore: new Map<string, string>(),
  redirect: vi.fn((to: string) => {
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

const { signIn, registerAccount } = await import('./auth');

/** Where the action sent them. Every path here ends in a redirect. */
async function landsOn(run: () => Promise<void>): Promise<string> {
  try {
    await run();
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.startsWith('REDIRECT:')) return message.slice('REDIRECT:'.length);
    throw err;
  }
  throw new Error('expected a redirect and got none');
}

function apiAnswers(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      status,
      ok: status >= 200 && status < 300,
      text: async () => JSON.stringify(body),
    })),
  );
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

beforeEach(() => {
  cookieStore.clear();
  redirect.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('signIn', () => {
  it('sets the session and goes where they were headed', async () => {
    apiAnswers(200, { outcome: 'session', token: 'tok' });
    const to = await landsOn(() => signIn(form({ email: 'a@b.c', password: 'pw', next: '/money' })));
    expect(cookieStore.get('sankalp_session')).toBe('tok');
    expect(to).toBe('/money');
  });

  /*
   * `?next=` is attacker-controllable. Only same-origin paths are
   * honoured — an absolute URL or a protocol-relative one would make
   * this an open redirect, which is a phishing primitive.
   */
  it.each(['https://evil.example.com', '//evil.example.com', 'javascript:alert(1)', ''])(
    'refuses to send anyone to %s',
    async (next) => {
      apiAnswers(200, { outcome: 'session', token: 'tok' });
      expect(await landsOn(() => signIn(form({ email: 'a@b.c', password: 'pw', next })))).toBe('/');
    },
  );

  it('honours a same-origin path with a query string', async () => {
    apiAnswers(200, { outcome: 'session', token: 'tok' });
    const to = await landsOn(() =>
      signIn(form({ email: 'a@b.c', password: 'pw', next: '/providers?language=hi' })),
    );
    expect(to).toBe('/providers?language=hi');
  });

  /*
   * A correct password for a role that must hold 2FA (#32) yields an
   * enrolment TICKET, never a session. It is not an error — the
   * password was right — so they are routed to enrolment rather than
   * shown a refusal with nowhere to go.
   */
  it('routes an unenrolled provider to enrolment, and issues no session', async () => {
    apiAnswers(200, { outcome: 'mfa_enrolment_required', enrolmentToken: 'ticket', expiresAt: 'later' });
    const to = await landsOn(() => signIn(form({ email: 'a@b.c', password: 'pw' })));
    expect(to).toBe('/mfa/enrol');
    expect(cookieStore.get('sankalp_enrolment')).toBe('ticket');
    // The critical assertion: no session was created.
    expect(cookieStore.has('sankalp_session')).toBe(false);
  });

  it('returns to sign-in with the error code, and no session, on a bad password', async () => {
    apiAnswers(401, { error: { code: 'INVALID_CREDENTIALS', message: 'no' } });
    const to = await landsOn(() => signIn(form({ email: 'a@b.c', password: 'wrong' })));
    expect(to).toContain('error=INVALID_CREDENTIALS');
    expect(cookieStore.has('sankalp_session')).toBe(false);
  });

  it('carries the intended destination through a failed attempt', async () => {
    apiAnswers(401, { error: { code: 'INVALID_CREDENTIALS', message: 'no' } });
    const to = await landsOn(() => signIn(form({ email: 'a@b.c', password: 'x', next: '/engagements' })));
    expect(to).toContain('next=%2Fengagements');
  });

  it('sends the authenticator code only when one was typed', async () => {
    apiAnswers(200, { outcome: 'session', token: 'tok' });
    await landsOn(() => signIn(form({ email: 'a@b.c', password: 'pw', totpCode: '  ' })));
    const [, init] = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0]!;
    expect(JSON.parse(String(init.body))).not.toHaveProperty('totpCode');
  });
});

describe('registerAccount', () => {
  /*
   * The platform is 18+ (#27). The confirmation is a hard gate, not a
   * formality — refused before the request is even made.
   */
  it('refuses without the adult confirmation, and never calls the API', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const to = await landsOn(() => registerAccount(form({ email: 'a@b.c', password: 'pw', role: 'seeker' })));
    expect(to).toContain('error=ADULT_NOT_CONFIRMED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('creates the account and sends them to sign in', async () => {
    apiAnswers(200, { id: 'u1' });
    const to = await landsOn(() =>
      registerAccount(form({ email: 'a@b.c', password: 'pw', role: 'provider', confirmsAdult: 'on' })),
    );
    expect(to).toContain('registered=1');
    expect(to).toContain('role=provider');
  });

  it('records which pack’s wording was on the screen', async () => {
    // The acceptance is only meaningful if it records the terms the
    // person actually saw.
    apiAnswers(200, { id: 'u1' });
    await landsOn(() =>
      registerAccount(
        form({ email: 'a@b.c', password: 'pw', role: 'seeker', confirmsAdult: 'on', familyCode: 'civil_services_exams', lang: 'hi' }),
      ),
    );
    const [, init] = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0]!;
    const body = JSON.parse(String(init.body));
    expect(body.familyCode).toBe('civil_services_exams');
    expect(body.lang).toBe('hi');
    expect(body.confirmsAdult).toBe(true);
  });

  it('returns the API’s code so the screen can say what went wrong', async () => {
    apiAnswers(409, { error: { code: 'EMAIL_TAKEN', message: 'no' } });
    const to = await landsOn(() =>
      registerAccount(form({ email: 'a@b.c', password: 'pw', role: 'seeker', confirmsAdult: 'on' })),
    );
    expect(to).toContain('error=EMAIL_TAKEN');
  });
});
