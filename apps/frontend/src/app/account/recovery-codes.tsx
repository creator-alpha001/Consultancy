'use client';

import { useState } from 'react';
import { regenerateRecoveryCodes } from '@/app/actions/account';
import { Button } from '@/components/ui';

/**
 * New recovery codes, shown once in the page and nowhere else — not in
 * the URL, not in a cookie, not in a log. Making new ones cancels the old
 * set immediately, and the button says so before it is pressed.
 */
export function RecoveryCodes(): JSX.Element {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-3">
      {codes ? (
        <>
          <p className="text-small text-ink-muted">
            Write these down now. Only their hashes are kept, so this page cannot show them again.
          </p>
          <ul className="grid grid-cols-2 gap-2 font-mono text-small">
            {codes.map((c) => (
              <li key={c} className="rounded-md bg-surface-sunk px-2.5 py-1.5">
                {c}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-small text-ink-muted">
          For getting back in if you lose your authenticator. Making new ones cancels the old ones straight away.
        </p>
      )}
      {error && (
        <p role="alert" className="text-small text-danger">
          {error === 'MFA_NOT_ENROLLED'
            ? 'This account has no second factor, so there are no recovery codes to make.'
            : 'That did not go through. Try again.'}
        </p>
      )}
      <Button
        tone="secondary"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm('Your existing recovery codes stop working the moment new ones are made. Continue?')) {
            return;
          }
          setBusy(true);
          setError(null);
          const r = await regenerateRecoveryCodes();
          setBusy(false);
          if ('codes' in r) setCodes(r.codes);
          else setError(r.error);
        }}
      >
        {codes ? 'Make another set' : 'Make new codes'}
      </Button>
    </div>
  );
}
