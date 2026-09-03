'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, apiAsUser } from '@/lib/api';

/**
 * Every write path in the engagement loop.
 *
 * All of these are server actions: the browser never holds the session
 * token and never calls the API directly, so an XSS bug on a screen
 * cannot walk off with a session that moves money.
 *
 * Money-moving calls carry an `Idempotency-Key` derived from the thing
 * being acted on, not from a random value — a double-submitted form must
 * produce the same key, which is the whole point (CLAUDE.md #10).
 */

export interface ActionState {
  error?: { code: string; message: string };
  ok?: boolean;
  /** Where the caller should go next, when the action created something. */
  redirectTo?: string;
}

async function run<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: ActionState['error'] }> {
  try {
    return { value: await fn() };
  } catch (err) {
    if (err instanceof ApiError) return { error: { code: err.code, message: err.message } };
    throw err;
  }
}

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

/* ── Booking ───────────────────────────────────────────────────── */

/**
 * Book a mentor: create the engagement, then the session on it.
 *
 * Two calls rather than one, because they are two facts — an agreement
 * to work together, and a time to do it. A `live_session` engagement
 * that never gets scheduled is a real state, not a broken one.
 */
export async function bookMentorAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const engagementType = str(form, 'engagementType');
  const created = await run(() =>
    apiAsUser<{ id: string }>('/engagements', {
      method: 'POST',
      body: JSON.stringify({
        providerId: str(form, 'providerId'),
        domainCode: str(form, 'domainCode'),
        categoryId: str(form, 'categoryId'),
        engagementType,
        currency: 'INR',
        amountPaise: str(form, 'amountPaise'),
        language: str(form, 'language'),
      }),
    }),
  );
  if (created.error) return { error: created.error };
  const engagementId = created.value!.id;

  if (engagementType === 'live_session') {
    const start = str(form, 'scheduledStart');
    const end = str(form, 'scheduledEnd');
    if (start && end) {
      const booked = await run(() =>
        apiAsUser(`/engagements/${engagementId}/sessions`, {
          method: 'POST',
          body: JSON.stringify({
            scheduledStart: start,
            scheduledEnd: end,
            timezone: str(form, 'timezone') || 'Asia/Kolkata',
          }),
        }),
      );
      // The engagement exists either way; a failed booking is recoverable
      // from the engagement page rather than orphaning the agreement.
      if (booked.error) {
        revalidatePath('/engagements');
        return { error: booked.error, redirectTo: `/engagements/${engagementId}` };
      }
    }
  }

  revalidatePath('/engagements');
  redirect(`/engagements/${engagementId}/agenda`);
}

export async function bookSessionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const engagementId = str(form, 'engagementId');
  const result = await run(() =>
    apiAsUser(`/engagements/${engagementId}/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        scheduledStart: str(form, 'scheduledStart'),
        scheduledEnd: str(form, 'scheduledEnd'),
        timezone: str(form, 'timezone') || 'Asia/Kolkata',
      }),
    }),
  );
  if (result.error) return { error: result.error };
  revalidatePath(`/engagements/${engagementId}`);
  revalidatePath('/sessions');
  return { ok: true };
}

/* ── Agenda ────────────────────────────────────────────────────── */

/**
 * Goals arrive as repeated `goal` fields, so the form can add and remove
 * rows without a fixed shape. Empty rows are dropped rather than stored.
 */
export async function draftAgendaAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const engagementId = str(form, 'engagementId');
  const lang = str(form, 'originalLang') || 'en';
  const items = form
    .getAll('goal')
    .map((g) => String(g).trim())
    .filter(Boolean)
    .map((labelText) => ({ labelLang: lang, labelText }));

  if (items.length === 0) {
    return { error: { code: 'AGENDA_NO_GOALS', message: 'Add at least one goal before sending this.' } };
  }

  const result = await run(() =>
    apiAsUser(`/engagements/${engagementId}/agenda`, {
      method: 'POST',
      body: JSON.stringify({
        originalLang: lang,
        expectedDeliverable: str(form, 'expectedDeliverable'),
        successCriteria: str(form, 'successCriteria'),
        outOfScope: str(form, 'outOfScope'),
        context: str(form, 'context'),
        items,
      }),
    }),
  );
  if (result.error) return { error: result.error };
  revalidatePath(`/engagements/${engagementId}/agenda`);
  return { ok: true };
}

/** After this the agenda is immutable. Changes need a change order. */
export async function lockAgendaAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const agendaId = str(form, 'agendaId');
  const engagementId = str(form, 'engagementId');
  const result = await run(() => apiAsUser(`/agendas/${agendaId}/lock`, { method: 'POST' }));
  if (result.error) return { error: result.error };
  revalidatePath(`/engagements/${engagementId}`);
  revalidatePath(`/engagements/${engagementId}/agenda`);
  return { ok: true };
}

export async function agreeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const engagementId = str(form, 'engagementId');
  const result = await run(() => apiAsUser(`/engagements/${engagementId}/agree`, { method: 'POST' }));
  if (result.error) return { error: result.error };
  revalidatePath(`/engagements/${engagementId}`);
  return { ok: true };
}

/**
 * The seeker pays, and the money goes into escrow.
 *
 * The idempotency key is derived from the ENGAGEMENT, not generated
 * fresh per click. That is the whole point: a double-submitted form, a
 * refreshed tab, or an impatient second click must all reach the same
 * key and therefore the same single charge. A `crypto.randomUUID()` here
 * would satisfy the header requirement and defeat what it is for.
 *
 * There is no amount in this form. The API reads it from the engagement
 * row, so there is nothing a browser could alter to change what is
 * charged (CLAUDE.md #28).
 */
export async function payAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const engagementId = str(form, 'engagementId');
  const result = await run(() =>
    apiAsUser(`/engagements/${engagementId}/payment`, {
      method: 'POST',
      idempotencyKey: `engagement-payment:${engagementId}`,
    }),
  );
  if (result.error) return { error: result.error };
  revalidatePath(`/engagements/${engagementId}`);
  revalidatePath('/engagements');
  return { ok: true };
}

/* ── Work and assessment ───────────────────────────────────────── */

/**
 * Send the work to be marked.
 *
 * `attachmentId` is a real uploaded file now; `contentRef` remains
 * accepted because the API takes either, and a live session's outcome may
 * genuinely have no document behind it. What is no longer possible is
 * submitting a text "reference" to a file the platform never received.
 */
export async function submitWorkAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const engagementId = str(form, 'engagementId');
  const attachmentId = str(form, 'attachmentId');
  const contentRef = str(form, 'contentRef');

  if (!attachmentId && !contentRef) {
    return {
      error: {
        code: 'SUBMISSION_EMPTY',
        message: 'Attach the file you want marked before sending this.',
      },
    };
  }

  const result = await run(() =>
    apiAsUser(`/engagements/${engagementId}/submissions`, {
      method: 'POST',
      body: JSON.stringify({
        ...(attachmentId ? { attachmentId } : {}),
        ...(contentRef ? { contentRef } : {}),
        note: str(form, 'note'),
      }),
    }),
  );
  if (result.error) return { error: result.error };
  revalidatePath(`/engagements/${engagementId}`);
  return { ok: true };
}

export async function openEvaluationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const engagementId = str(form, 'engagementId');
  const result = await run(() =>
    apiAsUser(`/engagements/${engagementId}/evaluations`, { method: 'POST', body: JSON.stringify({}) }),
  );
  if (result.error) return { error: result.error };
  revalidatePath(`/engagements/${engagementId}/evaluate`);
  return { ok: true };
}

/**
 * Scoring every dimension of the bound rubric in one submit.
 *
 * The dimension codes come from the template, never from this form —
 * a mentor cannot add a dimension (CLAUDE.md #16), and the API rejects
 * a code the template does not carry.
 */
export async function scoreEvaluationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const evaluationId = str(form, 'evaluationId');
  const engagementId = str(form, 'engagementId');
  const codes = form.getAll('dimensionCode').map(String);

  for (const code of codes) {
    const raw = str(form, `score:${code}`);
    if (raw === '') continue;
    const result = await run(() =>
      apiAsUser(`/evaluations/${evaluationId}/scores`, {
        method: 'POST',
        body: JSON.stringify({
          dimensionCode: code,
          score: Number(raw),
          comment: str(form, `comment:${code}`),
        }),
      }),
    );
    if (result.error) return { error: result.error };
  }

  revalidatePath(`/engagements/${engagementId}/evaluate`);
  return { ok: true };
}

/** Refused unless every dimension is scored — the API pre-checks, a trigger enforces. */
/**
 * Place a remark on the work.
 *
 * Called from the sheet rather than a form, so it takes the values
 * directly instead of FormData — a click at a point is not a form
 * submission, and pretending otherwise would mean serialising
 * coordinates through hidden inputs for no gain.
 *
 * The ordinal is NOT sent. The server assigns it, because "pin 4" has to
 * mean one thing to both parties and to a dispute.
 */
export async function addAnnotationAction(input: {
  evaluationId: string;
  engagementId: string;
  page: number;
  anchorX: number | null;
  anchorY: number | null;
  bodyText: string;
  bodyLang: string;
}): Promise<ActionState> {
  const result = await run(() =>
    apiAsUser(`/evaluations/${input.evaluationId}/annotations`, {
      method: 'POST',
      body: JSON.stringify({
        page: input.page,
        anchorX: input.anchorX,
        anchorY: input.anchorY,
        bodyText: input.bodyText,
        bodyLang: input.bodyLang,
      }),
    }),
  );
  if (result.error) return { error: result.error };
  revalidatePath(`/engagements/${input.engagementId}/evaluate`);
  return { ok: true };
}

export async function removeAnnotationAction(input: {
  annotationId: string;
  engagementId: string;
}): Promise<ActionState> {
  const result = await run(() =>
    apiAsUser(`/annotations/${input.annotationId}`, { method: 'DELETE' }),
  );
  if (result.error) return { error: result.error };
  revalidatePath(`/engagements/${input.engagementId}/evaluate`);
  return { ok: true };
}

export async function returnEvaluationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const evaluationId = str(form, 'evaluationId');
  const engagementId = str(form, 'engagementId');
  const result = await run(() =>
    apiAsUser(`/evaluations/${evaluationId}/return`, {
      method: 'POST',
      body: JSON.stringify({ overallNote: str(form, 'overallNote'), annotatedRef: str(form, 'annotatedRef') }),
    }),
  );
  if (result.error) return { error: result.error };
  revalidatePath(`/engagements/${engagementId}`);
  return { ok: true };
}

/* ── Closing out ───────────────────────────────────────────────── */

/** Releases escrow. Only the seeker can call it — it is their money. */
export async function completeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const engagementId = str(form, 'engagementId');
  const result = await run(() =>
    apiAsUser(`/engagements/${engagementId}/complete`, {
      method: 'POST',
      idempotencyKey: `complete:${engagementId}`,
    }),
  );
  if (result.error) return { error: result.error };
  revalidatePath(`/engagements/${engagementId}`);
  return { ok: true };
}

export async function reviewAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const engagementId = str(form, 'engagementId');
  const result = await run(() =>
    apiAsUser(`/engagements/${engagementId}/reviews`, {
      method: 'POST',
      body: JSON.stringify({
        direction: str(form, 'direction'),
        rating: Number(str(form, 'rating')),
        bodyOriginal: str(form, 'bodyOriginal'),
        bodyLang: str(form, 'bodyLang') || 'en',
      }),
    }),
  );
  if (result.error) return { error: result.error };
  revalidatePath(`/engagements/${engagementId}`);
  return { ok: true };
}

/** Freezes the money before the packet is assembled. */
export async function raiseDisputeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const engagementId = str(form, 'engagementId');
  const result = await run(() =>
    apiAsUser(`/engagements/${engagementId}/disputes`, {
      method: 'POST',
      body: JSON.stringify({
        reasonCode: str(form, 'reasonCode'),
        bodyOriginal: str(form, 'bodyOriginal'),
        bodyLang: str(form, 'bodyLang') || 'en',
      }),
    }),
  );
  if (result.error) return { error: result.error };
  revalidatePath(`/engagements/${engagementId}`);
  return { ok: true };
}

/* ── Board ─────────────────────────────────────────────────────── */

export async function createBoardPostAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await run(() =>
    apiAsUser<{ id: string }>('/board/posts', {
      method: 'POST',
      body: JSON.stringify({
        domainCode: str(form, 'domainCode'),
        categoryId: str(form, 'categoryId'),
        engagementType: str(form, 'engagementType'),
        language: str(form, 'language'),
        currency: 'INR',
        budgetMinPaise: str(form, 'budgetMinPaise'),
        budgetMaxPaise: str(form, 'budgetMaxPaise'),
        description: str(form, 'description'),
      }),
    }),
  );
  if (result.error) return { error: result.error };
  revalidatePath('/board');
  redirect(`/board/${result.value!.id}`);
}

export async function submitProposalAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const postId = str(form, 'boardPostId');
  const result = await run(() =>
    apiAsUser(`/board/posts/${postId}/proposals`, {
      method: 'POST',
      body: JSON.stringify({
        message: str(form, 'message'),
        proposedAmountPaise: str(form, 'proposedAmountPaise'),
      }),
    }),
  );
  if (result.error) return { error: result.error };
  revalidatePath(`/board/${postId}`);
  return { ok: true };
}

export async function acceptProposalAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const proposalId = str(form, 'proposalId');
  const result = await run(() =>
    apiAsUser<{ engagementId?: string }>(`/board/proposals/${proposalId}/accept`, { method: 'POST' }),
  );
  if (result.error) return { error: result.error };
  revalidatePath('/board');
  revalidatePath('/engagements');
  return { ok: true };
}

/**
 * The right of reply.
 *
 * Only the person a review is about may use it, once, and never edit it
 * afterwards — all three enforced by triggers, so this does not
 * re-check them. A review the reviewed party cannot answer is a weapon
 * rather than a record, and until now nothing in either app could write
 * one: replies rendered on profiles and could only be created by a seed
 * script.
 */
export async function replyToReviewAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const reviewId = String(form.get('reviewId') ?? '');
  try {
    await apiAsUser(`/reviews/${reviewId}/reply`, {
      method: 'POST',
      body: JSON.stringify({
        bodyOriginal: String(form.get('bodyOriginal') ?? ''),
        // Kept in the language it was written in, never overwritten by a
        // translation (SPEC-PLATFORM.md §8).
        bodyLang: String(form.get('bodyLang') ?? 'en'),
      }),
    });
    revalidatePath('/mentor');
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { error: { code: err.code, message: err.message } };
    throw err;
  }
}
