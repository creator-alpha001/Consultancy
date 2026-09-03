'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, apiAsUser } from '@/lib/api';

export interface PayoutActionState {
  error?: string;
  ok?: boolean;
}

/**
 * Set where a provider's payouts go.
 *
 * The account number passes through this function and is never returned,
 * never revalidated into a cache, and never written into the action's
 * result. `PayoutActionState` deliberately has nowhere to put it: a state
 * object that echoed the submitted value back would put an account number
 * into the RSC payload, where it lives in the browser's memory and in
 * whatever the page's error reporting picks up.
 *
 * The API exchanges it with the licensed aggregator for a token and keeps
 * only the last four digits (CLAUDE.md #31).
 */
export async function setPayoutDestinationAction(
  _prev: PayoutActionState,
  form: FormData,
): Promise<PayoutActionState> {
  const accountHolderName = String(form.get('accountHolderName') ?? '').trim();
  const accountNumber = String(form.get('accountNumber') ?? '').trim();
  const confirmAccountNumber = String(form.get('confirmAccountNumber') ?? '').trim();
  const ifsc = String(form.get('ifsc') ?? '').trim();

  // Checked here rather than at the API, because it is the only check that
  // needs both fields — the server is sent one number, and a typo repeated
  // identically twice is a decision, not a slip.
  if (accountNumber !== confirmAccountNumber) {
    return { error: 'The two account numbers do not match. Check both and try again.' };
  }

  try {
    await apiAsUser('/me/payout-destination', {
      method: 'POST',
      body: JSON.stringify({ accountHolderName, accountNumber, ifsc }),
    });
    revalidatePath('/mentor/earnings');
    return { ok: true };
  } catch (err) {
    // The API's messages are written for a person to act on ("that is not
    // a valid IFSC code"), so they are shown as-is.
    if (err instanceof ApiError) return { error: err.message };
    throw err;
  }
}
