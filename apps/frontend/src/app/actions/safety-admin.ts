'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, apiAsUser } from '@/lib/api';
import { requireRole } from '@/lib/session';

const QUEUE = '/admin/safety';

function back(params: Record<string, string>): never {
  redirect(`${QUEUE}?${new URLSearchParams(params).toString()}`);
}

function code(err: unknown): string {
  return err instanceof ApiError ? err.code : 'UNKNOWN';
}

/** Takes a report, so two reviewers are not working the same one. */
export async function claimReport(formData: FormData): Promise<void> {
  await requireRole('admin', QUEUE);
  const id = String(formData.get('reportId') ?? '');
  try {
    await apiAsUser(`/admin/reports/${encodeURIComponent(id)}/claim`, { method: 'POST' });
  } catch (err) {
    back({ error: code(err) });
  }
  revalidatePath(QUEUE);
  back({ notice: 'claimed' });
}

/**
 * A person's decision on a report. `actioned` keeps held content down;
 * `dismissed` releases any hold the report placed. A note is required —
 * a resolution without a reason is not a record.
 */
export async function resolveReport(formData: FormData): Promise<void> {
  await requireRole('admin', QUEUE);
  const id = String(formData.get('reportId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  const note = String(formData.get('note') ?? '').trim();
  if (decision !== 'actioned' && decision !== 'dismissed') back({ error: 'DECISION_REQUIRED' });
  if (note.length < 10) back({ error: 'NOTE_REQUIRED' });
  try {
    await apiAsUser(`/admin/reports/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ decision, note }),
    });
  } catch (err) {
    back({ error: code(err) });
  }
  revalidatePath(QUEUE);
  back({ notice: decision });
}

/** Publishes a held board question as written, after a person has read it. */
export async function clearHeldQuestion(formData: FormData): Promise<void> {
  await requireRole('admin', QUEUE);
  const id = String(formData.get('questionId') ?? '');
  try {
    await apiAsUser(`/board/moderation/held/${encodeURIComponent(id)}/clear`, { method: 'POST' });
  } catch (err) {
    back({ error: code(err) });
  }
  revalidatePath(QUEUE);
  back({ notice: 'published' });
}
