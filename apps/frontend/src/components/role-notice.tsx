'use client';

import { useSearchParams } from 'next/navigation';

/**
 * Said once, where a fresh sign-in lands, when the account is not the
 * side the person chose on the sign-in form. The account decides which
 * product opens (#28); this only explains why it is not the one they
 * picked. A person who wants both needs two accounts.
 */
export function RoleNotice(): JSX.Element | null {
  // Null outside the app router (a component rendered on its own).
  const notice = useSearchParams()?.get('notice') ?? null;
  const text =
    notice === 'account-is-provider'
      ? 'This account is for giving guidance, so you are on that side. Getting guidance needs its own account.'
      : notice === 'account-is-seeker'
        ? 'This account is for getting guidance, so you are on that side. Giving guidance needs its own account, with a different email.'
        : null;
  if (!text) return null;
  return (
    <div role="status" className="mb-6 rounded-md border border-info-line bg-info-soft px-4 py-3 text-small text-info">
      {text}
    </div>
  );
}
