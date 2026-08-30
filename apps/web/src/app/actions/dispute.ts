'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, apiAsUser } from '@/lib/api';

export interface DisputeActionState {
  error?: { code: string; message: string };
  appealed?: boolean;
  withdrawn?: boolean;
}

/**
 * Appealing a ruling.
 *
 * The tier ladder is family data — how many rungs there are and which is
 * final comes from the pack, never from here (SPEC-PLATFORM.md §13). The
 * API refuses an appeal past the final tier, so this does not pre-judge
 * it: a client that decided for itself would be a second, drifting copy
 * of the rule.
 */
export async function appealAction(
  _prev: DisputeActionState,
  form: FormData,
): Promise<DisputeActionState> {
  const disputeId = String(form.get('disputeId') ?? '');
  try {
    await apiAsUser(`/disputes/${disputeId}/appeal`, {
      method: 'POST',
      body: JSON.stringify({
        bodyOriginal: String(form.get('bodyOriginal') ?? ''),
        bodyLang: String(form.get('bodyLang') ?? 'en'),
      }),
    });
    revalidatePath(`/disputes/${disputeId}`);
    return { appealed: true };
  } catch (err) {
    if (err instanceof ApiError) return { error: { code: err.code, message: err.message } };
    throw err;
  }
}

/** Withdrawing. Only the person who raised it, and only while it is open. */
export async function withdrawDisputeAction(
  _prev: DisputeActionState,
  form: FormData,
): Promise<DisputeActionState> {
  const disputeId = String(form.get('disputeId') ?? '');
  try {
    await apiAsUser(`/disputes/${disputeId}/withdraw`, { method: 'POST' });
    revalidatePath(`/disputes/${disputeId}`);
    return { withdrawn: true };
  } catch (err) {
    if (err instanceof ApiError) return { error: { code: err.code, message: err.message } };
    throw err;
  }
}
