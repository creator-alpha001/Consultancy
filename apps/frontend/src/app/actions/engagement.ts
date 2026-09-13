'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, apiAsUser } from '@/lib/api';
import { requireAuth, requireRole } from '@/lib/session';

/**
 * The web's engagement lifecycle: booking, the agenda, paying into
 * escrow, completing, disputing, reviewing.
 *
 * Every body here is the one the API declares — `scripts/contract-bodies.mjs`
 * checks them in CI (TRACKER D70), because the app once sent the wrong
 * words to fifteen routes and every screen looked fine.
 *
 * Money routes carry an Idempotency-Key minted when the form was drawn
 * (#10), so a double submit, or a retry after a timeout, is one payment.
 */

function back(path: string, params: Record<string, string>): never {
  const qs = new URLSearchParams(params).toString();
  redirect(qs ? `${path}?${qs}` : path);
}

function code(err: unknown): string {
  return err instanceof ApiError ? err.code : 'UNKNOWN';
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim();
}

const engagementPage = (id: string) => `/engagements/${encodeURIComponent(id)}`;

// ── booking ───────────────────────────────────────────────────────────

/**
 * Starts an engagement from a published service. The amount is the
 * service's published price, sent as-is: nothing to negotiate (#15), and
 * the provider still has to agree to it.
 */
export async function bookService(formData: FormData): Promise<void> {
  await requireRole('seeker', '/providers');
  const providerId = field(formData, 'providerId');
  const bookPage = `/book/${encodeURIComponent(providerId)}`;
  const [serviceId, engagementType, amountPaise, currency] = field(formData, 'service').split('|');
  const domainCode = field(formData, 'domainCode');
  const categoryId = field(formData, 'categoryId');
  const language = field(formData, 'language');
  if (!serviceId || !engagementType || !amountPaise || !currency) back(bookPage, { error: 'SERVICE_REQUIRED' });
  if (!categoryId) back(bookPage, { error: 'CATEGORY_REQUIRED' });
  if (!language) back(bookPage, { error: 'LANGUAGE_REQUIRED' });

  let id: string;
  try {
    ({ id } = await apiAsUser<{ id: string }>('/engagements', {
      method: 'POST',
      body: JSON.stringify({ providerId, domainCode, categoryId, engagementType, currency, amountPaise, language }),
    }));
  } catch (err) {
    back(bookPage, { error: code(err) });
  }
  revalidatePath('/engagements');
  redirect(`${engagementPage(id)}/agenda`);
}

/** Either party confirms the terms. The engagement leaves draft. */
export async function agreeTerms(formData: FormData): Promise<void> {
  const id = field(formData, 'engagementId');
  await requireAuth(engagementPage(id));
  try {
    await apiAsUser(`/engagements/${encodeURIComponent(id)}/agree`, { method: 'POST' });
  } catch (err) {
    back(engagementPage(id), { error: code(err) });
  }
  revalidatePath(engagementPage(id));
  back(engagementPage(id), { notice: 'agreed' });
}

export async function cancelEngagement(formData: FormData): Promise<void> {
  const id = field(formData, 'engagementId');
  await requireAuth(engagementPage(id));
  const reason = field(formData, 'reason');
  try {
    await apiAsUser(`/engagements/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || undefined }),
    });
  } catch (err) {
    back(engagementPage(id), { error: code(err) });
  }
  revalidatePath('/engagements');
  back(engagementPage(id), { notice: 'cancelled' });
}

// ── the agenda ────────────────────────────────────────────────────────

/**
 * Saves the draft agenda, replacing an earlier draft. The text is sent in
 * the language it was written in, which is the one that counts (#20).
 */
export async function saveAgenda(formData: FormData): Promise<void> {
  const id = field(formData, 'engagementId');
  const page = `${engagementPage(id)}/agenda`;
  await requireAuth(page);
  const language = field(formData, 'language');
  const goals = formData
    .getAll('goal')
    .map((g) => String(g).trim())
    .filter(Boolean);
  const expectedDeliverable = field(formData, 'expectedDeliverable');
  const successCriteria = field(formData, 'successCriteria');
  const outOfScope = field(formData, 'outOfScope');
  if (goals.length === 0) back(page, { error: 'GOALS_REQUIRED' });
  if (!expectedDeliverable || !successCriteria) back(page, { error: 'OUTCOME_REQUIRED' });

  try {
    await apiAsUser(`/engagements/${encodeURIComponent(id)}/agenda`, {
      method: 'POST',
      body: JSON.stringify({
        originalLang: language,
        expectedDeliverable,
        successCriteria,
        items: goals.map((labelText) => ({ labelLang: language, labelText })),
        outOfScope: outOfScope || undefined,
      }),
    });
  } catch (err) {
    back(page, { error: code(err) });
  }
  revalidatePath(page);
  back(page, { notice: 'saved' });
}

/** Locks the agenda. After this it is immutable; a change is a change order (#11). */
export async function lockAgenda(formData: FormData): Promise<void> {
  const id = field(formData, 'engagementId');
  const agendaId = field(formData, 'agendaId');
  const page = `${engagementPage(id)}/agenda`;
  await requireAuth(page);
  if (formData.get('understood') !== 'on') back(page, { error: 'CONFIRM_REQUIRED' });
  try {
    await apiAsUser(`/agendas/${encodeURIComponent(agendaId)}/lock`, {
      method: 'POST',
      idempotencyKey: field(formData, 'idempotencyKey') || randomUUID(),
    });
  } catch (err) {
    back(page, { error: code(err) });
  }
  revalidatePath(engagementPage(id));
  back(engagementPage(id), { notice: 'locked' });
}

// ── money ─────────────────────────────────────────────────────────────

/**
 * Pays into escrow. The body is empty on purpose: amount, currency, payer
 * and payee all come from the engagement on the server (#28).
 */
export async function payIntoEscrow(formData: FormData): Promise<void> {
  const id = field(formData, 'engagementId');
  await requireRole('seeker', engagementPage(id));
  try {
    await apiAsUser(`/engagements/${encodeURIComponent(id)}/payment`, {
      method: 'POST',
      idempotencyKey: field(formData, 'idempotencyKey') || randomUUID(),
    });
  } catch (err) {
    back(engagementPage(id), { error: code(err) });
  }
  revalidatePath(engagementPage(id));
  revalidatePath('/money');
  back(engagementPage(id), { notice: 'paid' });
}

/** Confirms the work and releases the escrow. Seeker only — it is their money. */
export async function completeEngagement(formData: FormData): Promise<void> {
  const id = field(formData, 'engagementId');
  const page = `${engagementPage(id)}/complete`;
  await requireRole('seeker', page);
  try {
    await apiAsUser(`/engagements/${encodeURIComponent(id)}/complete`, {
      method: 'POST',
      idempotencyKey: field(formData, 'idempotencyKey') || randomUUID(),
    });
  } catch (err) {
    back(page, { error: code(err) });
  }
  revalidatePath(engagementPage(id));
  revalidatePath('/money');
  back(engagementPage(id), { notice: 'completed' });
}

// ── disputes ──────────────────────────────────────────────────────────

/** Raises a dispute, in the language it is written in (#20). Freezes the escrow. */
export async function raiseDispute(formData: FormData): Promise<void> {
  const id = field(formData, 'engagementId');
  const page = `${engagementPage(id)}/dispute`;
  await requireAuth(page);
  const reasonCode = field(formData, 'reasonCode');
  const summary = field(formData, 'summary');
  const remedy = field(formData, 'remedy');
  const claimed = formData.getAll('claimedItem').map((v) => String(v).trim()).filter(Boolean);
  const bodyLang = field(formData, 'bodyLang') || 'en';
  if (!reasonCode) back(page, { error: 'REASON_REQUIRED' });
  if (claimed.length === 0) back(page, { error: 'ITEMS_REQUIRED' });
  if (summary.length < 20) back(page, { error: 'BODY_TOO_SHORT' });
  /*
   * A dispute carries prose, not a set of item ids (the API has no field
   * for them), so the claimed goals are quoted into the statement in the
   * words they were locked in. The reviewer reads exactly which goals are
   * claimed, and the original language is kept (#20).
   */
  const bodyOriginal = [
    ...claimed.map((c) => `• ${c}`),
    '',
    summary,
    ...(remedy ? ['', remedy] : []),
  ].join('\n');
  let disputeId: string;
  try {
    ({ id: disputeId } = await apiAsUser<{ id: string }>(`/engagements/${encodeURIComponent(id)}/disputes`, {
      method: 'POST',
      body: JSON.stringify({ reasonCode, bodyOriginal, bodyLang }),
    }));
  } catch (err) {
    back(page, { error: code(err) });
  }
  revalidatePath(engagementPage(id));
  redirect(`/disputes/${encodeURIComponent(disputeId)}`);
}

export async function appealDispute(formData: FormData): Promise<void> {
  const id = field(formData, 'disputeId');
  const page = `/disputes/${encodeURIComponent(id)}`;
  await requireAuth(page);
  const bodyOriginal = field(formData, 'bodyOriginal');
  const bodyLang = field(formData, 'bodyLang') || 'en';
  if (bodyOriginal.length < 20) back(page, { error: 'BODY_TOO_SHORT' });
  try {
    await apiAsUser(`/disputes/${encodeURIComponent(id)}/appeal`, {
      method: 'POST',
      body: JSON.stringify({ bodyOriginal, bodyLang }),
    });
  } catch (err) {
    back(page, { error: code(err) });
  }
  revalidatePath(page);
  back(page, { notice: 'appealed' });
}

export async function withdrawDispute(formData: FormData): Promise<void> {
  const id = field(formData, 'disputeId');
  const page = `/disputes/${encodeURIComponent(id)}`;
  await requireAuth(page);
  try {
    await apiAsUser(`/disputes/${encodeURIComponent(id)}/withdraw`, { method: 'POST' });
  } catch (err) {
    back(page, { error: code(err) });
  }
  revalidatePath(page);
  back(page, { notice: 'withdrawn' });
}

// ── reviews ───────────────────────────────────────────────────────────

/**
 * A review against the family's own dimensions, in the reviewer's
 * language. The direction is the reviewer's side of the engagement.
 */
export async function leaveReview(formData: FormData): Promise<void> {
  const id = field(formData, 'engagementId');
  const page = `${engagementPage(id)}/review`;
  const me = await requireAuth(page);
  const rating = Number(field(formData, 'rating'));
  const bodyOriginal = field(formData, 'bodyOriginal');
  const bodyLang = field(formData, 'bodyLang') || 'en';
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) back(page, { error: 'RATING_REQUIRED' });
  const dimensionScores: Array<{ dimensionCode: string; score: number }> = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('dim_') || typeof value !== 'string' || !value) continue;
    const score = Number(value);
    if (Number.isInteger(score)) dimensionScores.push({ dimensionCode: key.slice(4), score });
  }
  try {
    await apiAsUser(`/engagements/${encodeURIComponent(id)}/reviews`, {
      method: 'POST',
      body: JSON.stringify({
        direction: me.role === 'provider' ? 'provider_on_seeker' : 'seeker_on_provider',
        rating,
        bodyOriginal: bodyOriginal || undefined,
        bodyLang,
        dimensionScores: dimensionScores.length > 0 ? dimensionScores : undefined,
      }),
    });
  } catch (err) {
    back(page, { error: code(err) });
  }
  revalidatePath(engagementPage(id));
  back(engagementPage(id), { notice: 'reviewed' });
}
