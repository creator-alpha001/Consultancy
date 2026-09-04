'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, apiAsUser } from '@/lib/api';
import { requireRole } from '@/lib/session';

/**
 * Ticking one of the things a reviewer asked for.
 *
 * The smallest action in the product and the one carrying the most of
 * CLAUDE.md #17 and #24. This list is what replaces the streaks, badges
 * and percentiles a progress screen would normally reach for: the
 * honest version of the same motivation is the four things a real
 * person actually asked this person to change.
 *
 * Which means the details matter more than the size suggests:
 *
 *  - It is REVERSIBLE. A one-way tick makes the list lie, and a list
 *    that lies is worse than no list. The API models it as a nullable
 *    `doneAt` for the same reason.
 *  - Un-ticking is never framed as losing anything. There is no count
 *    to protect, no run to break, and nothing here that could produce
 *    one later.
 *  - A failure leaves the box as it was and says so, rather than
 *    showing a tick the server did not record.
 */
export async function setActionDone(formData: FormData): Promise<void> {
  await requireRole('seeker', '/progress');

  const annotationId = String(formData.get('annotationId') ?? '').trim();
  if (!annotationId) return;

  /*
   * The checkbox's own value, not a toggle computed here. A toggle
   * would race two quick clicks into the wrong final state; sending the
   * state the person chose makes the last write correct whatever order
   * they arrive in.
   */
  const done = formData.get('done') === 'on';

  try {
    await apiAsUser(`/me/action-items/${encodeURIComponent(annotationId)}`, {
      method: 'POST',
      body: JSON.stringify({ done }),
    });
  } catch (err) {
    /*
     * Deliberately silent, and deliberately not a redirect.
     *
     * `revalidatePath` below re-reads the list from the API, so a failed
     * write simply renders the box as the server still has it. Throwing
     * someone to an error page over an unticked box would be wildly out
     * of proportion to what just happened.
     */
    if (!(err instanceof ApiError)) throw err;
  }

  revalidatePath('/progress');
}
