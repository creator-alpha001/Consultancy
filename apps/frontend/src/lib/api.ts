import { cookies } from 'next/headers';

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3000';

export const SESSION_COOKIE = 'sankalp_session';

/**
 * The enrolment ticket.
 *
 * A provider or admin whose password is correct but who holds no second
 * factor gets this instead of a session (#32). It authorises enrolling a
 * factor and NOTHING else — it is not a session, and it is kept in its
 * own cookie so that nothing which reads `SESSION_COOKIE` can ever be
 * handed one by mistake.
 */
export const ENROLMENT_COOKIE = 'sankalp_enrolment';

/** The error envelope every endpoint returns (CLAUDE.md's one envelope). */
export interface ApiErrorBody {
  error: { code: string; message: string; detail?: Record<string, unknown>; requestId?: string };
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The server-side API client.
 *
 * The browser NEVER talks to the API. Every call runs in a server
 * component or a server action, and the session token lives in an
 * httpOnly cookie page JavaScript cannot read — so an XSS bug on any
 * screen cannot walk off with a session that can move money.
 *
 * `code` is what callers switch on; `message` is displayed and never
 * parsed (CLAUDE.md's error convention).
 */
export async function api<T>(
  path: string,
  init: RequestInit & { token?: string | null; idempotencyKey?: string } = {},
): Promise<T> {
  const { token, idempotencyKey, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  // Every mutating endpoint accepts one (CLAUDE.md #10). Callers that
  // move money must pass it; it is meaningless on a GET and harmless.
  if (idempotencyKey) headers.set('idempotency-key', idempotencyKey);

  const res = await fetch(`${API_BASE}${path}`, { ...rest, headers, cache: 'no-store' });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const err = (body as ApiErrorBody | undefined)?.error;
    throw new ApiError(
      err?.code ?? 'UNKNOWN',
      err?.message ?? `request failed with ${res.status}`,
      res.status,
      err?.detail,
    );
  }
  return body as T;
}

/** The caller's session token, or null. Reads the httpOnly cookie. */
export async function sessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

/** The caller's enrolment ticket, or null. */
export async function enrolmentToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ENROLMENT_COOKIE)?.value ?? null;
}

/** A call authorised by an enrolment ticket rather than a session. */
export async function apiAsEnrolling<T>(path: string, init: RequestInit = {}): Promise<T> {
  return api<T>(path, { ...init, token: await enrolmentToken() });
}

/** An authenticated call as the current user. */
export async function apiAsUser<T>(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {},
): Promise<T> {
  return api<T>(path, { ...init, token: await sessionToken() });
}

/**
 * An authenticated call that returns null instead of throwing when the
 * caller is not signed in or may not see the resource.
 *
 * Most screens in this app render for a visitor as well as a member, and
 * a 401 on one panel should not blank the page. A 404 is folded in for
 * the same reason: "no such engagement" and "not yours" are the same
 * answer to a client, deliberately — see CLAUDE.md #28.
 */
export async function apiOrNull<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  try {
    return await apiAsUser<T>(path, init);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403 || err.status === 404)) {
      return null;
    }
    throw err;
  }
}

/** A list endpoint that degrades to empty rather than exploding a page. */
export async function apiListOrEmpty<T>(path: string, init: RequestInit = {}): Promise<T[]> {
  return (await apiOrNull<T[]>(path, init)) ?? [];
}
