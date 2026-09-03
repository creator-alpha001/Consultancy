'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, apiAsUser } from '@/lib/api';

export interface ListingActionState {
  error?: string;
}

/**
 * Open or close a domain to the public.
 *
 * The admin identity is never carried in this form — the API takes it
 * from the session and refuses a non-admin (CLAUDE.md #28). What the form
 * carries is only which domain and which direction.
 *
 * Both `/domains` and the ops table are revalidated: opening a domain
 * that the visitor-facing Explore page still renders without would be a
 * decision that appeared not to have happened.
 */
export async function setDomainListing(
  _prev: ListingActionState,
  form: FormData,
): Promise<ListingActionState> {
  const domainCode = String(form.get('domainCode') ?? '');
  const publiclyListed = String(form.get('publiclyListed') ?? '') === 'true';

  try {
    await apiAsUser(`/admin/catalogue/${domainCode}/listing`, {
      method: 'POST',
      body: JSON.stringify({ publiclyListed }),
    });
    revalidatePath('/admin/catalogue');
    revalidatePath('/domains');
    return {};
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    throw err;
  }
}
