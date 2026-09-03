'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, apiAsUser } from '@/lib/api';

export interface AvailabilityActionState {
  error?: string;
  ok?: boolean;
}

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function fail(err: unknown): AvailabilityActionState {
  if (err instanceof ApiError) return { error: err.message };
  throw err;
}

/** "09:30" → 570. The API works in minutes from midnight, local to the rule's timezone. */
function toMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes <= 24 * 60 ? minutes : null;
}

/**
 * Add a weekly window.
 *
 * The days arrive as repeated checkboxes and become one RRULE, because
 * the API accepts a documented subset — `FREQ=WEEKLY;BYDAY=MO,WE` — and
 * refuses anything else rather than half-understanding it. Building the
 * string here rather than asking a provider to type one is the whole
 * point of the screen.
 */
export async function addAvailabilityRuleAction(
  _prev: AvailabilityActionState,
  form: FormData,
): Promise<AvailabilityActionState> {
  const days = form.getAll('day').map(String).filter((d) => DAYS.includes(d));
  if (days.length === 0) return { error: 'Pick at least one day.' };

  const startMinute = toMinutes(String(form.get('startTime') ?? ''));
  const endMinute = toMinutes(String(form.get('endTime') ?? ''));
  if (startMinute === null || endMinute === null) {
    return { error: 'Give a start and end time, like 09:00 and 17:00.' };
  }
  if (endMinute <= startMinute) {
    // Caught here so the message can name the actual problem. The API
    // refuses it too — this is not the check that makes it true.
    return { error: 'The end time has to be after the start time.' };
  }

  // Days are ordered Sunday-first to match the RRULE the API parses, not
  // the order the checkboxes happened to be ticked in.
  const byday = DAYS.filter((d) => days.includes(d)).join(',');

  try {
    await apiAsUser('/me/availability/rules', {
      method: 'POST',
      body: JSON.stringify({
        timezone: String(form.get('timezone') ?? 'Asia/Kolkata'),
        rrule: `FREQ=WEEKLY;BYDAY=${byday}`,
        startMinute,
        endMinute,
      }),
    });
    revalidatePath('/mentor/availability');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function removeAvailabilityRuleAction(
  _prev: AvailabilityActionState,
  form: FormData,
): Promise<AvailabilityActionState> {
  const ruleId = String(form.get('ruleId') ?? '');
  try {
    await apiAsUser(`/me/availability/rules/${ruleId}/remove`, { method: 'POST' });
    revalidatePath('/mentor/availability');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Block a date.
 *
 * Separate from the rules on purpose: a holiday must not edit away the
 * weekly pattern it interrupts, or the provider comes back from a week
 * off to find they are no longer bookable at all.
 */
export async function addAvailabilityExceptionAction(
  _prev: AvailabilityActionState,
  form: FormData,
): Promise<AvailabilityActionState> {
  const onDate = String(form.get('onDate') ?? '').trim();
  if (!onDate) return { error: 'Pick the date you are not available.' };

  const startRaw = String(form.get('startTime') ?? '').trim();
  const endRaw = String(form.get('endTime') ?? '').trim();
  // Both blank means the whole day. Half-given is ambiguous, so it is
  // refused rather than guessed at.
  if (Boolean(startRaw) !== Boolean(endRaw)) {
    return { error: 'Give both times to block part of a day, or neither to block all of it.' };
  }

  try {
    await apiAsUser('/me/availability/exceptions', {
      method: 'POST',
      body: JSON.stringify({
        onDate,
        startMinute: startRaw ? toMinutes(startRaw) : null,
        endMinute: endRaw ? toMinutes(endRaw) : null,
        reason: String(form.get('reason') ?? '').trim() || undefined,
      }),
    });
    revalidatePath('/mentor/availability');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function removeAvailabilityExceptionAction(
  _prev: AvailabilityActionState,
  form: FormData,
): Promise<AvailabilityActionState> {
  const exceptionId = String(form.get('exceptionId') ?? '');
  try {
    await apiAsUser(`/me/availability/exceptions/${exceptionId}/remove`, { method: 'POST' });
    revalidatePath('/mentor/availability');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** How much notice, how long a slot, how far ahead. */
export async function setBookingPolicyAction(
  _prev: AvailabilityActionState,
  form: FormData,
): Promise<AvailabilityActionState> {
  const num = (key: string): number => Number(form.get(key) ?? 0);
  try {
    await apiAsUser('/me/availability/policy', {
      method: 'POST',
      body: JSON.stringify({
        minNoticeMinutes: num('minNoticeHours') * 60,
        bufferMinutes: num('bufferMinutes'),
        maxAdvanceDays: num('maxAdvanceDays'),
        slotMinutes: num('slotMinutes'),
      }),
    });
    revalidatePath('/mentor/availability');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
