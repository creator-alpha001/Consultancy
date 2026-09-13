'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, apiAsUser } from '@/lib/api';
import { requireRole } from '@/lib/session';

const OUTCOMES = ['release_to_provider', 'refund_to_seeker', 'split'] as const;
type Outcome = (typeof OUTCOMES)[number];

function page(id: string): string {
  return `/admin/disputes/${encodeURIComponent(id)}`;
}

function back(id: string, params: Record<string, string>): never {
  redirect(`${page(id)}?${new URLSearchParams(params).toString()}`);
}

function code(err: unknown): string {
  return err instanceof ApiError ? err.code : 'UNKNOWN';
}

/**
 * Whole rupees to paise, as a string, with no floating point anywhere
 * (CLAUDE.md #5). Anything that is not a plain whole number is refused
 * rather than rounded — a ruling is not the place to guess an amount.
 */
function rupeesToPaise(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^\d{1,9}$/.test(trimmed)) return null;
  return (BigInt(trimmed) * 100n).toString();
}

/**
 * Issues a ruling.
 *
 * The ruling admin is the signed-in one — the API takes it from the
 * session and a database trigger refuses any author that is not a human
 * admin (#18). Nothing here is suggested by a machine. The rationale is
 * required because both parties receive it verbatim.
 */
export async function ruleDispute(formData: FormData): Promise<void> {
  const id = String(formData.get('disputeId') ?? '');
  await requireRole('admin', page(id));
  const outcome = String(formData.get('outcome') ?? '') as Outcome;
  const rationale = String(formData.get('rationale') ?? '').trim();

  if (!OUTCOMES.includes(outcome)) back(id, { error: 'OUTCOME_REQUIRED' });
  if (rationale.length < 40) back(id, { error: 'RATIONALE_TOO_SHORT' });

  let seekerRefundPaise: string | undefined;
  if (outcome === 'split') {
    const paise = rupeesToPaise(String(formData.get('refundRupees') ?? ''));
    if (paise === null) back(id, { error: 'SPLIT_AMOUNT_INVALID' });
    seekerRefundPaise = paise;
  }

  try {
    await apiAsUser(`/admin/disputes/${encodeURIComponent(id)}/rule`, {
      method: 'POST',
      body: JSON.stringify({ outcome, rationale, ...(seekerRefundPaise ? { seekerRefundPaise } : {}) }),
      idempotencyKey: String(formData.get('idempotencyKey') ?? '') || randomUUID(),
    });
  } catch (err) {
    back(id, { error: code(err) });
  }
  revalidatePath(page(id));
  revalidatePath('/admin/disputes');
  back(id, { notice: 'ruled' });
}

/**
 * Carries the standing ruling out against the escrow, through money/.
 * A separate, deliberate step: the ruling says what should happen, and
 * this is the moment money actually moves.
 */
export async function settleDispute(formData: FormData): Promise<void> {
  const id = String(formData.get('disputeId') ?? '');
  await requireRole('admin', page(id));
  try {
    await apiAsUser(`/admin/disputes/${encodeURIComponent(id)}/settle`, {
      method: 'POST',
      idempotencyKey: String(formData.get('idempotencyKey') ?? '') || randomUUID(),
    });
  } catch (err) {
    back(id, { error: code(err) });
  }
  revalidatePath(page(id));
  revalidatePath('/admin/disputes');
  back(id, { notice: 'settled' });
}
