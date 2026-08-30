'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, apiAsUser } from '@/lib/api';
import { ActionState } from './engagement';

async function run<T>(fn: () => Promise<T>): Promise<ActionState> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { error: { code: err.code, message: err.message } };
    throw err;
  }
}

function id(form: FormData): string {
  return String(form.get('sessionId') ?? '');
}

/**
 * CLAUDE.md #21: recording needs explicit opt-in from BOTH parties at
 * the start of EVERY session — never blanket consent in the Terms.
 *
 * Consent and refusal go through the same action. A refusal is a
 * recorded decision, not an absence, and the UI must make declining as
 * easy as agreeing — a consent flow with only a yes button is not
 * consent.
 */
export async function consentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const sessionId = id(form);
  const consentGiven = String(form.get('consentGiven')) === 'true';
  const result = await run(() =>
    apiAsUser(`/sessions/${sessionId}/consent`, {
      method: 'POST',
      body: JSON.stringify({ consentGiven }),
    }),
  );
  revalidatePath(`/sessions/${sessionId}`);
  return result;
}

/** Refused by a DB trigger unless every participant has said yes. */
export async function recordingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const sessionId = id(form);
  const active = String(form.get('active')) === 'true';
  const result = await run(() =>
    apiAsUser(`/sessions/${sessionId}/recording`, { method: 'POST', body: JSON.stringify({ active }) }),
  );
  revalidatePath(`/sessions/${sessionId}`);
  return result;
}

export async function startSessionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const sessionId = id(form);
  // Creating the room first is idempotent-ish and keeps "join" meaningful
  // even if the caller starts before the room exists.
  await run(() => apiAsUser(`/sessions/${sessionId}/room`, { method: 'POST' }));
  const result = await run(() => apiAsUser(`/sessions/${sessionId}/start`, { method: 'POST' }));
  revalidatePath(`/sessions/${sessionId}`);
  return result;
}

export async function endSessionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const sessionId = id(form);
  const result = await run(() => apiAsUser(`/sessions/${sessionId}/end`, { method: 'POST' }));
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath('/sessions');
  return result;
}

export async function cancelSessionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const sessionId = id(form);
  const result = await run(() => apiAsUser(`/sessions/${sessionId}/cancel`, { method: 'POST' }));
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath('/sessions');
  return result;
}

/**
 * CLAUDE.md #22: audio-only fallback is required, not an enhancement.
 * Either party can drop the call to audio without asking the other —
 * nobody should have to negotiate while their connection is failing.
 */
export async function audioOnlyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const sessionId = id(form);
  const result = await run(() => apiAsUser(`/sessions/${sessionId}/audio-only`, { method: 'POST' }));
  revalidatePath(`/sessions/${sessionId}`);
  return result;
}

/** The in-session checklist. Either party ticks; both see progress. */
export async function tickAgendaItemAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const sessionId = id(form);
  const itemId = String(form.get('itemId') ?? '');
  const result = await run(() =>
    apiAsUser(`/sessions/${sessionId}/agenda-items/${itemId}/tick`, { method: 'POST' }),
  );
  revalidatePath(`/sessions/${sessionId}`);
  return result;
}

/**
 * Offering more time at a price. Either party may offer; only the seeker
 * can accept, because it is their money.
 */
export async function proposeExtensionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const sessionId = String(form.get('sessionId') ?? '');
  const minutes = Number(form.get('minutes') ?? 0);
  const rupees = Number(form.get('rupees') ?? 0);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return { error: { code: 'MINUTES_REQUIRED', message: 'How many more minutes?' } };
  }
  if (!Number.isFinite(rupees) || rupees <= 0) {
    return { error: { code: 'AMOUNT_REQUIRED', message: 'What does the extra time cost?' } };
  }
  try {
    await apiAsUser(`/sessions/${sessionId}/extensions`, {
      method: 'POST',
      // Rupees on the screen, paise on the wire — money is never a float.
      body: JSON.stringify({ minutes, amountPaise: Math.round(rupees * 100) }),
    });
    revalidatePath(`/sessions/${sessionId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { error: { code: err.code, message: err.message } };
    throw err;
  }
}

/**
 * The seeker accepts the pack's terms and pays. The wording they saw is
 * stored in full server-side, so this action deliberately does NOT send
 * the text — a client that supplied what it claims to have shown could
 * claim anything.
 */
export async function acceptExtensionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const extensionId = String(form.get('extensionId') ?? '');
  const sessionId = String(form.get('sessionId') ?? '');
  if (form.get('agreed') !== 'on') {
    return { error: { code: 'AGREEMENT_REQUIRED', message: 'You have to accept the terms to add time.' } };
  }
  try {
    await apiAsUser(`/extensions/${extensionId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ lang: String(form.get('lang') ?? 'en') }),
    });
    revalidatePath(`/sessions/${sessionId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { error: { code: err.code, message: err.message } };
    throw err;
  }
}

export async function declineExtensionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const extensionId = String(form.get('extensionId') ?? '');
  const sessionId = String(form.get('sessionId') ?? '');
  try {
    await apiAsUser(`/extensions/${extensionId}/decline`, { method: 'POST' });
    revalidatePath(`/sessions/${sessionId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return { error: { code: err.code, message: err.message } };
    throw err;
  }
}
