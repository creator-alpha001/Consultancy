'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, apiAsUser } from '@/lib/api';

export interface AdminActionState {
  error?: { code: string; message: string };
  done?: string;
}

function fail(err: unknown): AdminActionState {
  if (err instanceof ApiError) return { error: { code: err.code, message: err.message } };
  throw err;
}

/**
 * The human decision on a credential.
 *
 * The automated check is advisory and never grants a tier on its own
 * (SPEC-PLATFORM.md §11) — this is the step that does, and it is a
 * person. `reviewerId` is taken from the authenticated admin at the API,
 * never from this form (CLAUDE.md #28).
 */
export async function decideCredentialAction(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const id = String(form.get('credentialId') ?? '');
  const decision = String(form.get('decision') ?? '');
  try {
    await apiAsUser(`/admin/credentials/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify({ decision, note: String(form.get('note') ?? '') }),
    });
    revalidatePath('/admin/credentials');
    return { done: decision };
  } catch (err) {
    return fail(err);
  }
}

/** Runs the advisory check. Never decides anything by itself. */
export async function runCredentialCheckAction(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const id = String(form.get('credentialId') ?? '');
  try {
    await apiAsUser(`/admin/credentials/${id}/automated-check`, { method: 'POST' });
    revalidatePath('/admin/credentials');
    return { done: 'checked' };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Ruling on a dispute.
 *
 * A person, always: the DB refuses a ruling that names no human ruler,
 * and no AI output may cause a money movement (CLAUDE.md #18).
 * Settlement is a separate, explicit step — ruling decides, settling
 * moves the money, and keeping them apart means a mis-typed ruling can
 * be appealed before anything is paid.
 */
export async function ruleDisputeAction(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const id = String(form.get('disputeId') ?? '');
  const outcome = String(form.get('outcome') ?? '');
  const refundRupees = String(form.get('seekerRefundRupees') ?? '').trim();
  try {
    await apiAsUser(`/admin/disputes/${id}/rule`, {
      method: 'POST',
      body: JSON.stringify({
        outcome,
        // Money crosses the wire in paise, never rupees and never a float
        // (CLAUDE.md money rules). The form collects rupees because that
        // is what a person types; the conversion happens once, here.
        ...(refundRupees === ''
          ? {}
          : { seekerRefundPaise: String(Math.round(Number(refundRupees) * 100)) }),
        rationale: String(form.get('rationale') ?? ''),
      }),
    });
    revalidatePath('/admin/disputes');
    return { done: 'ruled' };
  } catch (err) {
    return fail(err);
  }
}

export async function settleDisputeAction(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const id = String(form.get('disputeId') ?? '');
  try {
    await apiAsUser(`/admin/disputes/${id}/settle`, { method: 'POST' });
    revalidatePath('/admin/disputes');
    return { done: 'settled' };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Releasing held content.
 *
 * Held, never rejected (CLAUDE.md #25). A distress-flagged post was
 * answered with real helplines and kept out of public view; clearing it
 * is the human saying it is safe to publish.
 */
export async function clearHeldAction(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const id = String(form.get('questionId') ?? '');
  try {
    await apiAsUser(`/moderation/held/${id}/clear`, { method: 'POST' });
    revalidatePath('/admin/moderation');
    return { done: 'cleared' };
  } catch (err) {
    return fail(err);
  }
}
