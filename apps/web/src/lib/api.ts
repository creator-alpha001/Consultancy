import { cookies } from 'next/headers';

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3000';
export const SESSION_COOKIE = 'sankalp_session';
export const ENROLMENT_COOKIE = 'sankalp_enrolment';

/** The error envelope every endpoint returns (CLAUDE.md: one envelope). */
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
  }
}

/**
 * Server-side API client.
 *
 * The browser NEVER talks to the API directly. Every call goes through a
 * server component or a server action, and the session token lives in an
 * httpOnly cookie the page's JavaScript cannot read — so an XSS bug on a
 * screen cannot walk off with a session that can move money.
 *
 * `code` is switched on; `message` is displayed and never parsed
 * (CLAUDE.md's error convention).
 */
export async function api<T>(
  path: string,
  init: RequestInit & { token?: string | null; idempotencyKey?: string } = {},
): Promise<T> {
  const { token, idempotencyKey, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (idempotencyKey) headers.set('idempotency-key', idempotencyKey);

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers,
    cache: 'no-store',
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;

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
export function sessionToken(): string | null {
  return cookies().get(SESSION_COOKIE)?.value ?? null;
}

export function enrolmentToken(): string | null {
  return cookies().get(ENROLMENT_COOKIE)?.value ?? null;
}

/** An authenticated call as the current user. Throws if not signed in. */
export async function apiAsUser<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  return api<T>(path, { ...init, token: sessionToken() });
}

/** Public (unauthenticated) call — the catalogue and question board. */
export async function apiPublic<T>(path: string, init: RequestInit = {}): Promise<T> {
  return api<T>(path, init);
}
