'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, apiAsUser } from '@/lib/api';
import { requireAuth, requireRole } from '@/lib/session';

/**
 * The board: a seeker describes a need, verified people offer, the seeker
 * awards one. Bodies match the API's declarations (TRACKER D70).
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

/**
 * Whole rupees to paise as a string, without floating point (#5). Not a
 * whole number of rupees is refused rather than rounded.
 */
function rupeesToPaise(raw: string): string | null {
  return /^\d{1,9}$/.test(raw) ? (BigInt(raw) * 100n).toString() : null;
}

/** Posts a request. A post screening holds is answered with helplines, never a rejection (#25). */
export async function createBoardPost(formData: FormData): Promise<void> {
  await requireRole('seeker', '/board/new');
  const page = '/board/new';
  const [domainCode, categoryId] = field(formData, 'placement').split('|');
  const language = field(formData, 'language');
  const engagementType = field(formData, 'engagementType');
  const title = field(formData, 'title');
  const detail = field(formData, 'detail');
  const budgetMinPaise = rupeesToPaise(field(formData, 'budgetMin'));
  const budgetMaxPaise = rupeesToPaise(field(formData, 'budgetMax'));
  if (!domainCode || !categoryId) back(page, { error: 'PLACEMENT_REQUIRED' });
  if (!title || !detail) back(page, { error: 'DESCRIPTION_REQUIRED' });
  if (!budgetMinPaise || !budgetMaxPaise || BigInt(budgetMaxPaise) < BigInt(budgetMinPaise)) {
    back(page, { error: 'BUDGET_INVALID' });
  }
  let id: string;
  try {
    ({ id } = await apiAsUser<{ id: string }>('/board/posts', {
      method: 'POST',
      body: JSON.stringify({
        domainCode,
        categoryId,
        engagementType,
        language,
        currency: 'INR',
        budgetMinPaise,
        budgetMaxPaise,
        description: `${title}\n\n${detail}`,
      }),
    }));
  } catch (err) {
    back(page, { error: code(err) });
  }
  revalidatePath('/board');
  redirect(`/board/${encodeURIComponent(id)}`);
}

export async function cancelBoardPost(formData: FormData): Promise<void> {
  const id = field(formData, 'postId');
  const page = `/board/${encodeURIComponent(id)}`;
  await requireRole('seeker', page);
  try {
    await apiAsUser(`/board/posts/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
  } catch (err) {
    back(page, { error: code(err) });
  }
  revalidatePath('/board');
  back(page, { notice: 'cancelled' });
}

/**
 * Awards an offer. Creates the engagement at the offered amount and
 * declines the other offers, server-side, once — the idempotency key is
 * minted when the page was drawn.
 */
export async function acceptProposal(formData: FormData): Promise<void> {
  const postId = field(formData, 'postId');
  const proposalId = field(formData, 'proposalId');
  const page = `/board/${encodeURIComponent(postId)}`;
  await requireRole('seeker', page);
  let engagementId: string | null;
  try {
    ({ resultingEngagementId: engagementId } = await apiAsUser<{ resultingEngagementId: string | null }>(
      `/board/proposals/${encodeURIComponent(proposalId)}/accept`,
      { method: 'POST', idempotencyKey: field(formData, 'idempotencyKey') || randomUUID() },
    ));
  } catch (err) {
    back(page, { error: code(err) });
  }
  revalidatePath('/board');
  revalidatePath('/engagements');
  redirect(engagementId ? `/engagements/${encodeURIComponent(engagementId)}/agenda` : '/engagements');
}

/** A verified provider offers on a post. The amount and the words are the whole offer. */
export async function proposeOnPost(formData: FormData): Promise<void> {
  const postId = field(formData, 'postId');
  const page = `/provider/requests`;
  await requireRole('provider', page);
  const proposedAmountPaise = rupeesToPaise(field(formData, 'rupees'));
  const message = field(formData, 'message');
  if (!proposedAmountPaise) back(page, { error: 'AMOUNT_INVALID', post: postId });
  try {
    await apiAsUser(`/board/posts/${encodeURIComponent(postId)}/proposals`, {
      method: 'POST',
      body: JSON.stringify({ proposedAmountPaise, message }),
    });
  } catch (err) {
    back(page, { error: code(err), post: postId });
  }
  revalidatePath(page);
  back(page, { notice: 'proposed' });
}

export async function withdrawProposal(formData: FormData): Promise<void> {
  const proposalId = field(formData, 'proposalId');
  const page = '/provider/requests';
  await requireRole('provider', page);
  try {
    await apiAsUser(`/board/proposals/${encodeURIComponent(proposalId)}/withdraw`, { method: 'POST' });
  } catch (err) {
    back(page, { error: code(err) });
  }
  revalidatePath(page);
  back(page, { notice: 'withdrawn' });
}

/**
 * A report. A welfare concern is answered with the family's helplines,
 * never queued silently (#25) — the page shows what the API returns.
 */
export async function submitReport(formData: FormData): Promise<void> {
  const page = '/safety/report';
  await requireAuth(page);
  const subjectType = field(formData, 'subjectType');
  const subjectId = field(formData, 'subjectId');
  const reasonCode = field(formData, 'reasonCode');
  const detailOriginal = field(formData, 'detail');
  const detailLang = field(formData, 'lang') || 'en';
  const back2 = { subject: subjectType, id: subjectId, domain: field(formData, 'domainCode'), name: field(formData, 'name') };
  if (!reasonCode) back(page, { ...back2, error: 'REASON_REQUIRED' });
  let welfare = false;
  try {
    const res = await apiAsUser<{ supportResources?: unknown[] }>('/reports', {
      method: 'POST',
      body: JSON.stringify({
        subjectType,
        subjectId,
        reasonCode,
        domainCode: field(formData, 'domainCode') || undefined,
        detailOriginal: detailOriginal || undefined,
        detailLang: detailOriginal ? detailLang : undefined,
      }),
    });
    // The API returns the family's helplines only for a welfare concern.
    welfare = Array.isArray(res?.supportResources) && res.supportResources.length > 0;
  } catch (err) {
    back(page, { ...back2, error: code(err) });
  }
  back(page, { ...back2, notice: welfare ? 'welfare' : 'received' });
}
