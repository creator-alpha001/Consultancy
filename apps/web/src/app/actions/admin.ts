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

/**
 * Working a report (D45).
 *
 * `actioned` leaves any hold in place — the content stays down.
 * `dismissed` releases it, unless another live report is still holding
 * the same thing. That release is what makes holding on first sight
 * safe to do at all.
 *
 * A note is required either way, because a safety decision with no
 * stated reason is not a record of anything — and this is the queue
 * whose decisions get read back years later.
 */
export async function resolveReportAction(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const id = String(form.get('reportId') ?? '');
  const decision = String(form.get('decision') ?? '');
  const note = String(form.get('note') ?? '').trim();
  if (note === '') {
    return { error: { code: 'NOTE_REQUIRED', message: 'Say what you decided and why.' } };
  }
  try {
    await apiAsUser(`/admin/reports/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ decision, note }),
    });
    revalidatePath('/admin/reports');
    return { done: decision };
  } catch (err) {
    return fail(err);
  }
}

export async function claimReportAction(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  const id = String(form.get('reportId') ?? '');
  try {
    await apiAsUser(`/admin/reports/${id}/claim`, { method: 'POST' });
    revalidatePath('/admin/reports');
    return { done: 'claimed' };
  } catch (err) {
    return fail(err);
  }
}

export interface RelayState {
  error?: { code: string; message: string };
  result?: { claimed: number; dispatched: number; failed: number; deadLettered: number };
}

/**
 * Running the outbox relay on demand.
 *
 * `release()` credits a provider's wallet and writes `payout.initiated`;
 * the relay is what turns that into an actual transfer instruction at
 * the aggregator. Until it existed, money was owed correctly and never
 * sent.
 *
 * A button rather than only a background tick because ops needs to push
 * a batch through after fixing whatever was making dispatch fail,
 * without waiting for the next interval. Safe to press twice: dispatch
 * is idempotent per event, and a concurrent tick claims different rows.
 */
export async function runRelayAction(_prev: RelayState, _form: FormData): Promise<RelayState> {
  try {
    const result = await apiAsUser<{
      claimed: number;
      dispatched: number;
      failed: number;
      deadLettered: number;
    }>('/admin/outbox/relay', { method: 'POST' });
    revalidatePath('/admin');
    return { result };
  } catch (err) {
    return fail(err) as RelayState;
  }
}
