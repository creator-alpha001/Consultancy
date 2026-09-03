'use server';

import { redirect } from 'next/navigation';
import { ApiError, api, apiAsEnrolling, apiAsUser } from '@/lib/api';
import {
  clearEnrolmentCookie, clearSessionCookie, setEnrolmentCookie, setSessionCookie, type LoginResult,
} from '@/lib/session';

/** Where a login may land. Kept to same-origin paths so `?next=` cannot be an open redirect. */
function safeNext(raw: FormDataEntryValue | null): string {
  const value = typeof raw === 'string' ? raw : '';
  return value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

/**
 * Sign in.
 *
 * A correct password is not by itself a session for a provider or an
 * admin (CLAUDE.md #32) — the API answers `mfa_enrolment_required` and
 * this refuses to set a session cookie for it, rather than quietly
 * treating a half-finished login as a finished one.
 */
export async function signIn(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const totpCode = String(formData.get('totpCode') ?? '').trim();
  const next = safeNext(formData.get('next'));

  let result: LoginResult;
  try {
    result = await api<LoginResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, ...(totpCode ? { totpCode } : {}) }),
    });
  } catch (err) {
    const code = err instanceof ApiError ? err.code : 'UNKNOWN';
    redirect(`/login?error=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`);
  }

  if (result.outcome === 'mfa_enrolment_required') {
    /*
     * Not an error: the password was right. This account simply must
     * hold a second factor before it can have a session (#32), so it is
     * handed the enrolment ticket and sent to do that — rather than
     * being told "no" on a screen with nowhere to go, which is what
     * this used to do.
     */
    await setEnrolmentCookie(result.enrolmentToken);
    redirect('/mfa/enrol');
  }

  await setSessionCookie(result.token);
  redirect(next);
}

/** Sign out. Revokes the session server-side, then drops the cookie. */
export async function signOut(): Promise<void> {
  try {
    await apiAsUser('/auth/logout', { method: 'POST' });
  } catch {
    // An already-invalid session is still a successful sign-out from
    // the person's point of view; the cookie goes either way.
  }
  await clearSessionCookie();
  redirect('/login');
}

/**
 * Create an account.
 *
 * The role is chosen here because the two are genuinely different
 * products from the first screen — and because a provider is walked
 * straight into 2FA enrolment, which a seeker is not required to hold.
 *
 * `confirmsAdult` is not a formality. The platform is 18+ (#27) and
 * nothing here is designed for, or safe for, a minor.
 */
export async function registerAccount(formData: FormData): Promise<void> {
  const role = String(formData.get('role') ?? 'seeker');
  const email = String(formData.get('email') ?? '');
  const back = (code: string): never =>
    redirect(`/register?error=${encodeURIComponent(code)}&role=${encodeURIComponent(role)}`);

  if (formData.get('confirmsAdult') !== 'on') back('ADULT_NOT_CONFIRMED');

  try {
    await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password: String(formData.get('password') ?? ''),
        role,
        confirmsAdult: true,
        // Which pack's wording was on the screen, so the acceptance
        // records what the person actually agreed to.
        familyCode: String(formData.get('familyCode') ?? '') || undefined,
        lang: String(formData.get('lang') ?? 'en'),
      }),
    });
  } catch (err) {
    back(err instanceof ApiError ? err.code : 'UNKNOWN');
  }

  redirect(`/login?registered=1&role=${encodeURIComponent(role)}`);
}

/** Begin enrolment: the API mints a secret this shows once. */
export async function beginEnrolment(): Promise<{ secret: string; provisioningUri: string }> {
  return apiAsEnrolling<{ secret: string; provisioningUri: string }>('/auth/mfa/enrol', { method: 'POST' });
}

/**
 * Confirm the factor with a code from the authenticator.
 *
 * On success the ticket is spent and dropped — enrolment does not
 * become a session. The person signs in again, now with their code,
 * which is the only path that produces one.
 */
export async function confirmEnrolment(formData: FormData): Promise<void> {
  const code = String(formData.get('code') ?? '').trim();
  try {
    await apiAsEnrolling('/auth/mfa/confirm', { method: 'POST', body: JSON.stringify({ code }) });
  } catch (err) {
    redirect(`/mfa/enrol?error=${encodeURIComponent(err instanceof ApiError ? err.code : 'UNKNOWN')}`);
  }
  await clearEnrolmentCookie();
  redirect('/login?enrolled=1');
}
