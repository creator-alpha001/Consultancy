'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ApiError, ENROLMENT_COOKIE, api, apiAsUser, enrolmentToken } from '@/lib/api';
import { clearSessionCookie, setSessionCookie } from '@/lib/session';

export interface FormState {
  error?: { code: string; message: string };
  ok?: boolean;
  /** Shown once, never stored — the 2FA secret and recovery codes. */
  secret?: string;
  provisioningUri?: string;
  recoveryCodes?: string[];
}

function toState(err: unknown): FormState {
  if (err instanceof ApiError) return { error: { code: err.code, message: err.message } };
  throw err;
}

export async function registerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const role = String(form.get('role') ?? 'seeker');
  try {
    await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
        role,
        // CLAUDE.md #27 — the platform is 18+ and the API refuses
        // registration without an explicit attestation.
        confirmsAdult: form.get('confirmsAdult') === 'on',
      }),
    });
  } catch (err) {
    return toState(err);
  }
  redirect(`/login?registered=1&role=${role}`);
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  let result: {
    outcome: 'session' | 'mfa_enrolment_required';
    token?: string;
    enrolmentToken?: string;
  };
  try {
    result = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
        totpCode: String(form.get('totpCode') ?? '') || undefined,
        recoveryCode: String(form.get('recoveryCode') ?? '') || undefined,
      }),
    });
  } catch (err) {
    return toState(err);
  }

  if (result.outcome === 'mfa_enrolment_required' && result.enrolmentToken) {
    // A provider/admin who has never enrolled. The ticket authorises
    // enrolment and nothing else (the API guard enforces that), so it is
    // safe to hold in a cookie — but a short-lived, separate one.
    cookies().set(ENROLMENT_COOKIE, result.enrolmentToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60,
      secure: process.env.NODE_ENV === 'production',
    });
    redirect('/mfa/enrol');
  }

  if (result.token) setSessionCookie(result.token);
  redirect('/dashboard');
}

export async function logoutAction(): Promise<void> {
  try {
    await apiAsUser('/auth/logout', { method: 'POST' });
  } catch {
    // Signing out locally must succeed even if the API call doesn't.
  }
  clearSessionCookie();
  redirect('/');
}

/** Step one of the 2FA bootstrap — uses the enrolment ticket, not a session. */
export async function beginEnrolmentAction(): Promise<FormState> {
  try {
    const res = await api<{ secret: string; provisioningUri: string }>('/auth/mfa/enrol', {
      method: 'POST',
      token: enrolmentToken(),
    });
    return { secret: res.secret, provisioningUri: res.provisioningUri };
  } catch (err) {
    return toState(err);
  }
}

/** Step two: prove the code works. Returns recovery codes, shown exactly once. */
export async function confirmEnrolmentAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    const res = await api<{ codes: string[] }>('/auth/mfa/confirm', {
      method: 'POST',
      token: enrolmentToken(),
      body: JSON.stringify({ code: String(form.get('code') ?? '') }),
    });
    cookies().delete(ENROLMENT_COOKIE); // the ticket is spent
    revalidatePath('/');
    return { ok: true, recoveryCodes: res.codes };
  } catch (err) {
    return toState(err);
  }
}
