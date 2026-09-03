'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, apiAsUser } from '@/lib/api';

export interface ServiceActionState {
  error?: string;
  ok?: boolean;
}

function fail(err: unknown): ServiceActionState {
  if (err instanceof ApiError) return { error: err.message };
  throw err;
}

/**
 * Publish a service.
 *
 * Rupees in the form, paise on the wire. The conversion happens here and
 * uses `Math.round` on a value already constrained to two decimals, so
 * "800.05" becomes 80005 rather than 80004.999999 — money is never
 * carried as a float past this line (#5).
 */
export async function setServiceAction(_prev: ServiceActionState, form: FormData): Promise<ServiceActionState> {
  const engagementType = String(form.get('engagementType') ?? '').trim();
  const skillId = String(form.get('skillId') ?? '').trim();
  const rupees = String(form.get('rupees') ?? '').trim();
  const commitment = String(form.get('commitment') ?? '').trim();

  if (!engagementType) return { error: 'Choose what this rate is for.' };
  if (!/^\d+(\.\d{1,2})?$/.test(rupees)) {
    return { error: 'Give an amount in rupees, like 800 or 800.50.' };
  }

  const amountPaise = String(Math.round(Number(rupees) * 100));
  if (amountPaise === '0') return { error: 'A price has to be more than zero.' };

  try {
    await apiAsUser('/me/rates', {
      method: 'POST',
      body: JSON.stringify({
        engagementType,
        // Empty string means "my default for this kind of work", which is
        // a real choice and not a missing value.
        skillId: skillId || null,
        amountPaise,
        // Minutes for live work, hours-to-return for async. The API
        // decides which it is from the engagement type.
        commitment: commitment ? Number(commitment) : null,
      }),
    });
    revalidatePath('/mentor/services');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function removeServiceAction(_prev: ServiceActionState, form: FormData): Promise<ServiceActionState> {
  const rateId = String(form.get('rateId') ?? '');
  try {
    await apiAsUser(`/me/rates/${rateId}/remove`, { method: 'POST' });
    revalidatePath('/mentor/services');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
