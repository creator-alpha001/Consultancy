'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { setDomainListing } from '@/app/actions/catalogue';

/**
 * Open or close one domain.
 *
 * Two things this deliberately does NOT do:
 *
 *  - It does not disable itself when a domain is below its supply floor.
 *    Opening below the floor is a legitimate decision — a launch domain
 *    with founding providers, a field being seeded by hand — and the
 *    server records the number it was opened at. A disabled button would
 *    move that judgement into the UI, where it cannot see the reasons.
 *  - It does not confirm. Listing is reversible in one click and takes
 *    effect on the next page load, so a confirmation step here would be
 *    friction without protection. Unlisting is the same.
 */
export function ListingControl({
  domainCode,
  publiclyListed,
  belowFloor,
}: {
  domainCode: string;
  publiclyListed: boolean;
  belowFloor: boolean;
}): JSX.Element {
  const [state, formAction] = useFormState(setDomainListing, { error: undefined });

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-xs">
      <input type="hidden" name="domainCode" value={domainCode} />
      <input type="hidden" name="publiclyListed" value={publiclyListed ? 'false' : 'true'} />
      <SubmitButton opening={!publiclyListed} belowFloor={belowFloor} />
      {state.error && (
        <span role="alert" className="text-caption text-correction">
          {state.error}
        </span>
      )}
    </form>
  );
}

function SubmitButton({ opening, belowFloor }: { opening: boolean; belowFloor: boolean }): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      // Closing a domain is destructive in the sense that matters here —
      // people lose a route they were using — so it is an outlined button
      // with red text, never a filled red one (#destructive is reachable,
      // not inviting).
      className={
        opening
          ? 'inline-flex min-h-[44px] items-center rounded-pill bg-accent px-lg text-caption font-medium text-accent-ink transition-opacity hover:opacity-85 disabled:opacity-40'
          : 'inline-flex min-h-[44px] items-center rounded-pill border border-rule px-lg text-caption font-medium text-correction transition-colors hover:bg-correction-soft disabled:opacity-40'
      }
    >
      {pending ? 'Saving…' : opening ? (belowFloor ? 'Open anyway' : 'Open') : 'Close'}
    </button>
  );
}
