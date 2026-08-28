import { cookies } from 'next/headers';
import { ApiError, SESSION_COOKIE, apiAsUser, sessionToken } from './api';

export interface Me {
  id: string;
  email: string;
  role: 'seeker' | 'provider' | 'admin';
  emailVerifiedAt: string | null;
  adultConfirmedAt: string | null;
  lastLoginAt: string | null;
}

/**
 * The current user, or null. Never throws for "not signed in" — a
 * public page calls this too.
 *
 * The role comes from the API (which re-reads it from the database on
 * every request), never from anything the browser holds, so a demotion
 * takes effect immediately rather than at next login.
 */
export async function currentUser(): Promise<Me | null> {
  if (!sessionToken()) return null;
  try {
    return await apiAsUser<Me>('/auth/me');
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

const COOKIE_OPTIONS = {
  httpOnly: true, // the page's JS cannot read a session that can move money
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
};

export function setSessionCookie(token: string): void {
  cookies().set(SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: 60 * 60 * 12 });
}

export function clearSessionCookie(): void {
  cookies().delete(SESSION_COOKIE);
}
