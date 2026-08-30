'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, apiAsUser } from '@/lib/api';

export interface CredentialState {
  error?: { code: string; message: string };
  submitted?: boolean;
}

/**
 * Submitting a credential for verification.
 *
 * The `verifier_data` keys are not enumerated here. They come from the
 * verifier's own declared inputs, which the form rendered — so a new
 * verifier needing a different field works with no change to this file
 * and no change to the form. Anything the form collected under
 * `vd.<key>` is passed through.
 *
 * None of it is public. Whether any key ever appears on a profile is
 * decided by the credential type's `publicFields` allow-list, which
 * defaults to empty (CLAUDE.md #30) — a roll number proves the
 * achievement, it is not the achievement.
 */
export async function submitCredentialAction(
  _prev: CredentialState,
  form: FormData,
): Promise<CredentialState> {
  const verifierData: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (!key.startsWith('vd.')) continue;
    const field = key.slice(3);
    const raw = String(value).trim();
    if (raw === '') continue;
    // The form declares which fields are numeric; a number arriving as a
    // string fails the verifier's own type check at review time, which is
    // a confusing place to discover a typo.
    verifierData[field] = form.get(`numeric.${field}`) ? Number(raw) : raw;
  }

  try {
    await apiAsUser('/me/credentials', {
      method: 'POST',
      body: JSON.stringify({
        credentialTypeCode: String(form.get('credentialTypeCode') ?? ''),
        domainCode: String(form.get('domainCode') ?? ''),
        skillCodes: form.getAll('skillCodes').map(String),
        verifierData,
      }),
    });
    revalidatePath('/mentor/credentials');
    return { submitted: true };
  } catch (err) {
    if (err instanceof ApiError) return { error: { code: err.code, message: err.message } };
    throw err;
  }
}
