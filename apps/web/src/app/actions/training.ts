'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, apiAsUser } from '@/lib/api';

export interface TrainingResult {
  passed: boolean;
  score: number;
  outOf: number;
  /** Question codes that were answered wrongly, so the screen can mark them. */
  wrong: string[];
}

/**
 * Submit a training attempt.
 *
 * The grading happens at the API and nowhere else. The correct answers
 * are never sent to the browser, so this cannot check them here even if
 * someone later thought that would be faster — which is the point.
 */
export async function submitTrainingAction(input: {
  moduleCode: string;
  answers: Record<string, string>;
  /** The family whose module this is — the page knows it; this file must not. */
  familyCode: string;
}): Promise<{ result?: TrainingResult; error?: string }> {
  try {
    const result = await apiAsUser<TrainingResult>(`/me/training/${input.moduleCode}`, {
      method: 'POST',
      body: JSON.stringify({
        familyCode: input.familyCode,
        answers: input.answers,
      }),
    });
    if (result.passed) {
      // A pass changes whether this person can be booked, so the
      // workspace checklist has to be recomputed.
      revalidatePath('/mentor');
      revalidatePath('/mentor/training');
    }
    return { result };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    throw err;
  }
}
