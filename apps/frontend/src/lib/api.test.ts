import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The boundary.
 *
 * Everything this app knows about the server arrives through here, so
 * two things matter more than the happy path: that an error envelope
 * becomes a typed error a caller can switch on, and that the SWALLOWING
 * helpers swallow exactly the right statuses. Getting the second wrong
 * is invisible — a 500 quietly rendered as an empty panel looks the same
 * as a genuinely empty one, and the outage hides.
 */

const { cookieStore } = vi.hoisted(() => ({ cookieStore: new Map<string, string>() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieStore.has(name) ? { name, value: cookieStore.get(name) } : undefined,
  }),
}));

const { api, apiAsUser, apiOrNull, apiListOrEmpty, sessionToken, enrolmentToken, ApiError } =
  await import('./api');

/** A fetch that answers with one canned response. */
function answering(status: number, body: unknown, opts: { text?: string } = {}) {
  const payload = opts.text ?? (body === undefined ? '' : JSON.stringify(body));
  const spy = vi.fn(async () => ({
    status,
    ok: status >= 200 && status < 300,
    text: async () => payload,
  }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

beforeEach(() => cookieStore.clear());
afterEach(() => vi.unstubAllGlobals());

describe('api — request shaping', () => {
  it('always sends JSON and never caches', async () => {
    const fetchSpy = answering(200, { ok: true });
    await api('/thing');
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    // A cached read of "where is my money" is worse than a slow one.
    expect(init.cache).toBe('no-store');
  });

  it('sends a bearer token only when there is one', async () => {
    const withToken = answering(200, {});
    await api('/thing', { token: 'abc' });
    expect(new Headers((withToken.mock.calls[0] as never as [string, RequestInit])[1].headers).get('authorization'))
      .toBe('Bearer abc');

    const without = answering(200, {});
    await api('/thing', { token: null });
    expect(new Headers((without.mock.calls[0] as never as [string, RequestInit])[1].headers).get('authorization'))
      .toBeNull();
  });

  it('passes an idempotency key through when given one', async () => {
    // CLAUDE.md #10: every mutating endpoint accepts one, and a retried
    // payment must never become two.
    const fetchSpy = answering(200, {});
    await api('/pay', { method: 'POST', idempotencyKey: 'key-1' });
    expect(new Headers((fetchSpy.mock.calls[0] as never as [string, RequestInit])[1].headers).get('idempotency-key'))
      .toBe('key-1');
  });

  it('does not leak the token or key into the fetch options', async () => {
    const fetchSpy = answering(200, {});
    await api('/thing', { token: 'abc', idempotencyKey: 'k' });
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(init.token).toBeUndefined();
    expect(init.idempotencyKey).toBeUndefined();
  });
});

describe('api — reading the answer', () => {
  it('returns nothing for a 204 without trying to parse it', async () => {
    answering(204, undefined, { text: '' });
    await expect(api('/thing')).resolves.toBeUndefined();
  });

  it('returns undefined for an empty body rather than throwing on JSON.parse', async () => {
    answering(200, undefined, { text: '' });
    await expect(api('/thing')).resolves.toBeUndefined();
  });

  it('turns the error envelope into a typed error', async () => {
    answering(409, {
      error: { code: 'AGENDA_LOCKED', message: 'that agenda is locked', detail: { agendaId: 'a1' } },
    });
    // `code` is switched on; `message` is displayed and never parsed.
    await expect(api('/thing')).rejects.toMatchObject({
      code: 'AGENDA_LOCKED',
      status: 409,
      detail: { agendaId: 'a1' },
    });
  });

  it('still throws a usable error when the body is not an envelope', async () => {
    answering(502, { nonsense: true });
    const err = await api('/thing').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as InstanceType<typeof ApiError>).code).toBe('UNKNOWN');
    expect((err as InstanceType<typeof ApiError>).status).toBe(502);
  });
});

describe('cookies', () => {
  it('reads the session and enrolment tickets from their own cookies', async () => {
    cookieStore.set('sankalp_session', 'sess');
    cookieStore.set('sankalp_enrolment', 'enrol');
    expect(await sessionToken()).toBe('sess');
    expect(await enrolmentToken()).toBe('enrol');
  });

  /*
   * The enrolment ticket authorises adding a second factor and nothing
   * else. It lives in its own cookie precisely so that anything reading
   * the SESSION cookie can never be handed one by mistake.
   */
  it('does not mistake an enrolment ticket for a session', async () => {
    cookieStore.set('sankalp_enrolment', 'enrol');
    expect(await sessionToken()).toBeNull();
  });

  it('sends no authorization header when there is no session', async () => {
    const fetchSpy = answering(200, {});
    await apiAsUser('/me');
    expect(new Headers((fetchSpy.mock.calls[0] as never as [string, RequestInit])[1].headers).get('authorization'))
      .toBeNull();
  });
});

describe('apiOrNull — which failures are survivable', () => {
  /*
   * Most screens render for a visitor as well as a member, so one
   * unauthorised panel must not blank the page. 404 is folded in
   * deliberately: "no such engagement" and "not yours" are the same
   * answer to a client (#28).
   */
  it.each([401, 403, 404])('renders %i as absent rather than as an error', async (status) => {
    answering(status, { error: { code: 'NOPE', message: 'no' } });
    await expect(apiOrNull('/thing')).resolves.toBeNull();
  });

  /*
   * A 500 is NOT survivable. Swallowing it would render an outage as an
   * empty panel, indistinguishable from a genuinely empty one — which
   * is how a broken page ships unnoticed.
   */
  it.each([400, 409, 500, 502])('lets %i through, because it is not an empty answer', async (status) => {
    answering(status, { error: { code: 'BOOM', message: 'no' } });
    await expect(apiOrNull('/thing')).rejects.toBeInstanceOf(ApiError);
  });

  it('returns the body when the call succeeds', async () => {
    answering(200, { id: 'x' });
    await expect(apiOrNull('/thing')).resolves.toEqual({ id: 'x' });
  });
});

describe('apiListOrEmpty', () => {
  it('degrades an unauthorised list to empty', async () => {
    answering(403, { error: { code: 'NOPE', message: 'no' } });
    await expect(apiListOrEmpty('/things')).resolves.toEqual([]);
  });

  it('passes a real list through', async () => {
    answering(200, [{ id: 'a' }, { id: 'b' }]);
    await expect(apiListOrEmpty('/things')).resolves.toHaveLength(2);
  });

  it('still throws on a server error rather than showing an empty list', async () => {
    answering(500, { error: { code: 'BOOM', message: 'no' } });
    await expect(apiListOrEmpty('/things')).rejects.toBeInstanceOf(ApiError);
  });
});
