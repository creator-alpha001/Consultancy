'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, apiAsUser } from '@/lib/api';
import { requireRole } from '@/lib/session';

const QUEUE = '/admin/verification';

function back(params: Record<string, string>): never {
  redirect(`${QUEUE}?${new URLSearchParams(params).toString()}`);
}

function code(err: unknown): string {
  return err instanceof ApiError ? err.code : 'UNKNOWN';
}

/**
 * Runs the credential type's automated check. It never decides: a pass
 * moves the credential to `under_review`, where a person still has to.
 */
export async function runAutomatedCheck(formData: FormData): Promise<void> {
  await requireRole('admin', QUEUE);
  const id = String(formData.get('credentialId') ?? '');
  try {
    await apiAsUser(`/admin/credentials/${encodeURIComponent(id)}/automated-check`, { method: 'POST' });
  } catch (err) {
    back({ id, error: code(err) });
  }
  revalidatePath(QUEUE);
  back({ id, notice: 'checked' });
}

/**
 * The human decision. The reviewer is the signed-in admin — the API takes
 * it from the session, never from this form (#28). A refusal must carry a
 * reason: the provider reads it, in the email and on their standing page.
 */
export async function decideCredential(formData: FormData): Promise<void> {
  await requireRole('admin', QUEUE);
  const id = String(formData.get('credentialId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  const note = String(formData.get('note') ?? '').trim();
  if (decision !== 'verified' && decision !== 'rejected') back({ id, error: 'DECISION_REQUIRED' });
  if (decision === 'rejected' && note.length < 10) back({ id, error: 'REASON_REQUIRED' });
  try {
    await apiAsUser(`/admin/credentials/${encodeURIComponent(id)}/decide`, {
      method: 'POST',
      body: JSON.stringify({ decision, note }),
    });
  } catch (err) {
    back({ id, error: code(err) });
  }
  revalidatePath(QUEUE);
  back({ notice: decision });
}

/**
 * Opens the evidence through the route that grants THIS reviewer access,
 * logs it, and returns a five-minute watermarked link (#29). Redirected
 * to directly, never shown or stored.
 */
export async function openCredentialDocument(formData: FormData): Promise<void> {
  await requireRole('admin', QUEUE);
  const id = String(formData.get('credentialId') ?? '');
  let url: string;
  try {
    ({ url } = await apiAsUser<{ url: string }>(`/admin/credentials/${encodeURIComponent(id)}/document`));
  } catch (err) {
    back({ id, error: code(err) });
  }
  redirect(url);
}
