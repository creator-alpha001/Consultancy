'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, api, apiAsUser } from '@/lib/api';
import { clearSessionCookie, requireAuth } from '@/lib/session';

function back(path: string, params: Record<string, string>, hash = ''): never {
  const qs = new URLSearchParams(params).toString();
  redirect(`${path}${qs ? `?${qs}` : ''}${hash}`);
}

function code(err: unknown): string {
  return err instanceof ApiError ? err.code : 'UNKNOWN';
}

/**
 * Ask for a reset link.
 *
 * The page says the same thing whether or not the address has an account,
 * and so does the API — this form must not become a way to learn who is
 * registered.
 */
export async function requestPasswordReset(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  try {
    await api('/auth/password/forgot', { method: 'POST', body: JSON.stringify({ email }) });
  } catch {
    // Deliberately swallowed: every outcome reads the same to the person.
  }
  back('/forgot-password', { sent: '1' });
}

/**
 * Set a new password from the emailed link.
 *
 * Returns rather than redirects on failure. The token lives in the page's
 * URL fragment, which a redirect would drop — so the form stays where it
 * is and shows what went wrong, with the token still usable.
 */
export async function resetPassword(token: string, password: string): Promise<{ error: string | null }> {
  try {
    await api('/auth/password/reset', { method: 'POST', body: JSON.stringify({ token, password }) });
  } catch (err) {
    return { error: code(err) };
  }
  // Every session was revoked by the reset, this browser's included.
  await clearSessionCookie();
  return { error: null };
}

/** Confirm an email address from the emailed link. Needs no session. */
export async function verifyEmail(token: string): Promise<{ error: string | null }> {
  try {
    await api('/auth/email/verify', { method: 'POST', body: JSON.stringify({ token }) });
  } catch (err) {
    return { error: code(err) };
  }
  return { error: null };
}

export async function resendVerification(): Promise<void> {
  await requireAuth('/account');
  try {
    await apiAsUser('/auth/email/resend', { method: 'POST' });
  } catch (err) {
    back('/account', { error: code(err) });
  }
  back('/account', { notice: 'verification_sent' });
}

/** Name, language, and a provider's headline and bio. Only fields present in the form change. */
export async function updateProfile(formData: FormData): Promise<void> {
  const me = await requireAuth('/account');
  const body: Record<string, string> = {
    displayName: String(formData.get('displayName') ?? ''),
    preferredLang: String(formData.get('preferredLang') ?? 'en'),
  };
  if (me.role === 'provider') {
    body.headline = String(formData.get('headline') ?? '');
    body.bio = String(formData.get('bio') ?? '');
    body.bioLang = String(formData.get('bioLang') ?? '');
  }
  try {
    await apiAsUser('/me/profile', { method: 'POST', body: JSON.stringify(body) });
  } catch (err) {
    const detail = err instanceof ApiError ? (err.detail as { field?: string; reason?: string } | undefined) : undefined;
    back('/account', { error: code(err), ...(detail?.reason ? { reason: `${detail.field}: ${detail.reason}` } : {}) });
  }
  revalidatePath('/account');
  revalidatePath('/provider/readiness');
  back('/account', { notice: 'profile_saved' });
}

/** Change the password. Every other session is signed out; this one stays. */
export async function changePassword(formData: FormData): Promise<void> {
  await requireAuth('/account');
  try {
    await apiAsUser('/auth/password/change', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: String(formData.get('currentPassword') ?? ''),
        newPassword: String(formData.get('newPassword') ?? ''),
      }),
    });
  } catch (err) {
    back('/account', { error: code(err) }, '#password');
  }
  back('/account', { notice: 'password_changed' }, '#password');
}

export async function signOutOtherDevices(): Promise<void> {
  await requireAuth('/account');
  try {
    await apiAsUser('/auth/logout-others', { method: 'POST' });
  } catch (err) {
    back('/account', { error: code(err) }, '#devices');
  }
  revalidatePath('/account');
  back('/account', { notice: 'others_signed_out' }, '#devices');
}

/**
 * New recovery codes. Returned to the page to be shown ONCE — they are
 * never put in a URL, a cookie or a log.
 */
export async function regenerateRecoveryCodes(): Promise<{ codes: string[] } | { error: string }> {
  await requireAuth('/account');
  try {
    return await apiAsUser<{ codes: string[] }>('/auth/mfa/recovery-codes', { method: 'POST' });
  } catch (err) {
    return { error: code(err) };
  }
}

/** A seeker adds a field, in a language that field offers (#6, #19). */
export async function declareField(formData: FormData): Promise<void> {
  await requireAuth('/account');
  const domainCode = String(formData.get('domainCode') ?? '');
  const workingLanguage = String(formData.get('workingLanguage') ?? '');
  const primary = formData.get('isPrimary') === 'on';
  try {
    await apiAsUser('/me/domains', {
      method: 'POST',
      body: JSON.stringify({ domainCode, workingLanguage, ...(primary ? { isPrimary: true } : {}) }),
    });
  } catch (err) {
    back('/account', { error: code(err) }, '#fields');
  }
  revalidatePath('/account');
  back('/account', { notice: 'fields_saved' }, '#fields');
}

export async function removeField(formData: FormData): Promise<void> {
  await requireAuth('/account');
  const domainCode = String(formData.get('domainCode') ?? '');
  try {
    await apiAsUser(`/me/domains/${encodeURIComponent(domainCode)}/remove`, { method: 'POST' });
  } catch (err) {
    back('/account', { error: code(err) }, '#fields');
  }
  revalidatePath('/account');
  back('/account', { notice: 'fields_saved' }, '#fields');
}
