import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ApiError, ENROLMENT_COOKIE, SESSION_COOKIE, apiAsUser, sessionToken } from './api';
import type { Role } from './types';

/** The API's answer to "who am I". The role is re-read server-side on every request. */
export interface Me {
  id: string;
  email: string;
  role: Role;
  status: string;
  emailVerifiedAt: string | null;
  adultConfirmedAt: string | null;
  lastLoginAt: string | null;
}

/**
 * Either an established session, or a demand for a second factor.
 *
 * Provider and admin accounts must hold 2FA (CLAUDE.md #32), so a
 * correct password is not by itself a session for them. The union is
 * carried through to the UI rather than flattened — a half-finished
 * login must not be renderable as an authenticated one.
 */
export type LoginResult =
  | { outcome: 'session'; token: string }
  | { outcome: 'mfa_enrolment_required'; enrolmentToken: string; expiresAt: string };

/**
 * The current user, or null. Never throws for "not signed in" — public
 * pages call this too.
 *
 * The role comes from the API, which re-reads it from the database on
 * every request, never from anything the browser holds. A demotion takes
 * effect immediately rather than at next login.
 */
export async function currentUser(): Promise<Me | null> {
  if (!(await sessionToken())) return null;
  try {
    return await apiAsUser<Me>('/auth/me');
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return null;
    throw err;
  }
}

const COOKIE_OPTIONS = {
  // The page's JavaScript cannot read a session that can move money.
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
};

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: 60 * 60 * 12 });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/**
 * The enrolment ticket, held only long enough to add a second factor.
 *
 * Short-lived on purpose: it is not a session, it authorises exactly one
 * thing, and leaving it lying around would mean a half-finished login
 * survives on the machine far longer than the person's attention did.
 */
export async function setEnrolmentCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(ENROLMENT_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: 15 * 60 });
}

export async function clearEnrolmentCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(ENROLMENT_COOKIE);
}

/**
 * Refuse the page unless the caller holds this role.
 *
 * The API is the real control — every admin route is `@Roles('admin')`
 * and re-checks the session on each request, so a screen cannot grant
 * access to data by rendering. This is the second layer, and it exists
 * for two reasons: an operations console that draws its whole chrome for
 * a logged-out stranger invites mistakes, and "empty page" is a terrible
 * way to tell someone they are not signed in.
 *
 * Redirects rather than throws, so the caller lands somewhere it can act:
 * to sign-in when there is no session, and to the platform's own home
 * when there is one that simply may not be here.
 */
export async function requireRole(role: Role, currentPath: string): Promise<Me> {
  const me = await currentUser();
  if (!me) redirect(`/login?next=${encodeURIComponent(currentPath)}`);
  /*
   * An admin may stand on any surface; nobody else may stand on the
   * admin one. Deliberately not "role === role": operations staff need
   * to see what a seeker sees to answer a ticket about it.
   */
  if (me.role !== role && me.role !== 'admin') redirect('/');
  return me;
}
