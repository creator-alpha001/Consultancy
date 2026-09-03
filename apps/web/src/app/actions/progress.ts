'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, apiAsUser } from '@/lib/api';

/**
 * Tick, or un-tick, something a reviewer asked you to work on.
 *
 * Reversible on purpose: someone who marks a thing done and then realises
 * they have not done it must be able to say so. A one-way tick makes the
 * list lie, and a list that lies stops getting opened.
 */
export async function setActionDoneAction(input: {
  annotationId: string;
  done: boolean;
}): Promise<{ error?: string }> {
  try {
    await apiAsUser(`/me/action-items/${input.annotationId}`, {
      method: 'POST',
      body: JSON.stringify({ done: input.done }),
    });
    revalidatePath('/progress');
    return {};
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    throw err;
  }
}
