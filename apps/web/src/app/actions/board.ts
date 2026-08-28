'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, apiAsUser } from '@/lib/api';

export interface AskState {
  error?: { code: string; message: string };
  heldForReview?: boolean;
  distressFlagged?: boolean;
  supportResources?: Array<{ label: string; value: string }>;
  published?: boolean;
}

/**
 * Asking a question.
 *
 * CLAUDE.md #25 is the whole shape of the response handling: a flagged
 * question is HELD, never rejected, and if the flag was distress
 * language the reply carries the family's real helplines — never "your
 * post was rejected".
 */
export async function askQuestionAction(_prev: AskState, form: FormData): Promise<AskState> {
  try {
    const res = await apiAsUser<{
      question: { status: string; distressFlagged: boolean };
      heldForReview: boolean;
      supportResources?: Array<{ label: string; value: string }>;
    }>('/board/questions', {
      method: 'POST',
      body: JSON.stringify({
        domainCode: String(form.get('domainCode') ?? ''),
        bodyOriginal: String(form.get('bodyOriginal') ?? ''),
        bodyLang: String(form.get('bodyLang') ?? 'en'),
      }),
    });
    revalidatePath('/board');
    return {
      heldForReview: res.heldForReview,
      distressFlagged: res.question.distressFlagged,
      supportResources: res.supportResources,
      published: res.question.status === 'published',
    };
  } catch (err) {
    if (err instanceof ApiError) return { error: { code: err.code, message: err.message } };
    throw err;
  }
}
