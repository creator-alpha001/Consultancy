'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, apiAsUser } from '@/lib/api';
import { requireRole } from '@/lib/session';

/**
 * The provider's own account: what they charge, what they claim, when
 * they are free, and what they have read.
 *
 * Every one of these is scoped to the caller by the API — there is no
 * `providerId` in any body here, and none of these routes accepts one
 * (#28). A provider can only ever change their own.
 */

function back(path: string, params: Record<string, string>): never {
  const qs = new URLSearchParams(params).toString();
  redirect(qs ? `${path}?${qs}` : path);
}

function reason(err: unknown): string {
  if (err instanceof ApiError) {
    const issues = err.detail?.issues as string[] | undefined;
    return issues?.join('; ') ?? err.message;
  }
  return 'That did not go through. Try again.';
}

/**
 * Publish a price for one kind of work.
 *
 * Rupees in the form, paise on the wire — the conversion happens here,
 * once, and never as floating point arithmetic on a currency
 * (CLAUDE.md's money rules). A price is a whole number of rupees at this
 * scale, so a fractional entry is refused rather than silently rounded.
 */
export async function setRate(formData: FormData): Promise<void> {
  await requireRole('provider', '/provider/services');
  const rupees = Number(String(formData.get('rupees') ?? ''));
  const engagementType = String(formData.get('engagementType') ?? '');

  if (!engagementType) back('/provider/services', { error: 'Choose what kind of work this price is for.' });
  if (!Number.isInteger(rupees) || rupees <= 0) {
    back('/provider/services', { error: 'Enter the price as a whole number of rupees.' });
  }

  const commitmentRaw = String(formData.get('commitment') ?? '').trim();
  const commitment = commitmentRaw === '' ? null : Number(commitmentRaw);
  if (commitment !== null && (!Number.isInteger(commitment) || commitment <= 0)) {
    back('/provider/services', { error: 'The time commitment has to be a whole number.' });
  }

  try {
    await apiAsUser('/me/rates', {
      method: 'POST',
      body: JSON.stringify({
        engagementType,
        amountPaise: String(rupees * 100),
        commitment,
      }),
      idempotencyKey: `rate:${engagementType}:${rupees}`,
    });
  } catch (err) {
    back('/provider/services', { error: reason(err) });
  }

  revalidatePath('/provider/services');
  revalidatePath('/provider/standing');
  back('/provider/services', { saved: '1' });
}

export async function removeRate(formData: FormData): Promise<void> {
  await requireRole('provider', '/provider/services');
  const id = String(formData.get('rateId') ?? '');
  try {
    await apiAsUser(`/me/rates/${encodeURIComponent(id)}/remove`, { method: 'POST' });
  } catch (err) {
    back('/provider/services', { error: reason(err) });
  }
  revalidatePath('/provider/services');
  back('/provider/services', { removed: '1' });
}

/**
 * Claim a credential, for a human to check.
 *
 * Submitting is not verifying. Nothing here grants a tier — that only
 * happens when a reviewer decides, which is the whole point of the
 * pipeline (SPEC-PLATFORM.md §11).
 */
export async function submitCredential(formData: FormData): Promise<void> {
  await requireRole('provider', '/provider/credentials');
  const credentialTypeCode = String(formData.get('credentialTypeCode') ?? '');
  const domainCode = String(formData.get('domainCode') ?? '');
  const skillCodes = String(formData.get('skillCodes') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!credentialTypeCode || !domainCode) {
    back('/provider/credentials', { error: 'Choose what you are claiming, and in which area.' });
  }

  /*
   * Everything else on the form is the verifier's own input set, which
   * differs per credential type and comes from the pack — so it is
   * collected generically rather than by naming fields this code would
   * have to know about.
   */
  const verifierData: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('vd_') && typeof value === 'string' && value.trim() !== '') {
      verifierData[key.slice(3)] = value.trim();
    }
  }

  try {
    await apiAsUser('/me/credentials', {
      method: 'POST',
      body: JSON.stringify({ credentialTypeCode, domainCode, skillCodes, verifierData }),
      idempotencyKey: `cred:${domainCode}:${credentialTypeCode}:${Date.now()}`,
    });
  } catch (err) {
    back('/provider/credentials', { error: reason(err) });
  }

  revalidatePath('/provider/credentials');
  revalidatePath('/provider/standing');
  back('/provider/credentials', { submitted: '1' });
}

/**
 * Answer a training module.
 *
 * A module is a QUIZ, and a completion is recorded only when the answers
 * pass — the API marks it, this does not. An earlier version of this
 * screen offered "I have read this" and posted nothing: the request came
 * back 201 with an empty result and no completion was ever written,
 * which is exactly the silent no-op a client inventing its own contract
 * produces.
 */
export async function completeTraining(formData: FormData): Promise<void> {
  await requireRole('provider', '/provider/training');
  const code = String(formData.get('moduleCode') ?? '');
  const familyCode = String(formData.get('familyCode') ?? '') || undefined;

  const answers: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('q_') && typeof value === 'string') answers[key.slice(2)] = value;
  }

  let result: { passed: boolean; score: number; outOf: number; wrong: string[] };
  try {
    result = await apiAsUser<{ passed: boolean; score: number; outOf: number; wrong: string[] }>(
      `/me/training/${encodeURIComponent(code)}`,
      { method: 'POST', body: JSON.stringify({ familyCode, answers }) },
    );
  } catch (err) {
    back('/provider/training', { error: reason(err) });
  }

  revalidatePath('/provider/training');
  revalidatePath('/provider/readiness');
  revalidatePath('/provider/standing');

  if (!result.passed) {
    /*
     * Which ones were wrong is returned, and is deliberately not shown
     * as "the answer is B" — the point is to read the section again,
     * not to guess until it passes.
     */
    back('/provider/training', {
      error: `${result.score} of ${result.outOf} right. Read the section again and try once more.`,
      retry: code,
    });
  }
  back('/provider/training', { completed: code });
}

/**
 * Offer a weekly slot.
 *
 * A timezone is sent with it, never an offset — the same reason the
 * database stores `timestamptz` plus an IANA zone: an offset is wrong
 * twice a year and silently books people an hour out.
 */
export async function addAvailabilityRule(formData: FormData): Promise<void> {
  await requireRole('provider', '/provider/availability');
  const byday = String(formData.get('byday') ?? '');
  const startTime = String(formData.get('startTime') ?? '');
  const endTime = String(formData.get('endTime') ?? '');
  const timezone = String(formData.get('timezone') ?? 'Asia/Kolkata');

  if (!byday || !startTime || !endTime) {
    back('/provider/availability', { error: 'A day and both times are needed.' });
  }

  /*
   * The form speaks "HH:MM"; the API speaks minutes from midnight. The
   * conversion belongs here rather than in the browser, and the API's
   * shape is the one that is right — a wall-clock string carries no
   * timezone and would be ambiguous the moment it left this form.
   */
  const toMinutes = (hhmm: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    return h >= 0 && h < 24 && min >= 0 && min < 60 ? h * 60 + min : null;
  };
  const startMinute = toMinutes(startTime);
  const endMinute = toMinutes(endTime);
  if (startMinute === null || endMinute === null) {
    back('/provider/availability', { error: 'Those times could not be read.' });
  }
  if (startMinute >= endMinute) {
    back('/provider/availability', { error: 'The end time has to be after the start time.' });
  }

  try {
    await apiAsUser('/me/availability/rules', {
      method: 'POST',
      // Only FREQ=WEEKLY;BYDAY is supported by the booking engine, and
      // anything else is refused at the boundary rather than partly
      // understood — so this form offers exactly that and nothing more.
      body: JSON.stringify({ rrule: `FREQ=WEEKLY;BYDAY=${byday}`, startMinute, endMinute, timezone }),
    });
  } catch (err) {
    back('/provider/availability', { error: reason(err) });
  }

  revalidatePath('/provider/availability');
  revalidatePath('/provider/standing');
  back('/provider/availability', { saved: '1' });
}

export async function removeAvailabilityRule(formData: FormData): Promise<void> {
  await requireRole('provider', '/provider/availability');
  const id = String(formData.get('ruleId') ?? '');
  try {
    await apiAsUser(`/me/availability/rules/${encodeURIComponent(id)}/remove`, { method: 'POST' });
  } catch (err) {
    back('/provider/availability', { error: reason(err) });
  }
  revalidatePath('/provider/availability');
  back('/provider/availability', { removed: '1' });
}
