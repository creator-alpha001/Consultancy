'use client';

import { useEffect, useState } from 'react';
import { resetPassword } from '@/app/actions/account';
import { Button, Field } from '@/components/ui';

const ERRORS: Record<string, string> = {
  TOKEN_INVALID: 'This link is not valid any more — it may have been used, replaced by a newer one, or expired. Ask for a new one.',
  PASSWORD_TOO_WEAK: 'Use at least twelve characters, and not your email address.',
  UNKNOWN: 'That did not go through. Try again.',
};

/**
 * The token is read from the URL fragment (`#token=`), which a browser
 * never sends to a server — so it stays out of access logs and Referer
 * headers. That is why this is a client component: only the page's own
 * script can see a fragment.
 */
export function ResetForm(): JSX.Element {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const match = /(?:^|[#&])token=([A-Za-z0-9_-]+)/.exec(window.location.hash);
    setToken(match?.[1] ?? '');
  }, []);

  if (token === null) return <p className="text-small text-ink-muted">Loading…</p>;

  if (token === '') {
    return (
      <p role="alert" className="text-body">
        This page needs the link from your email. <a className="text-brand underline" href="/forgot-password">Ask for a new one</a>.
      </p>
    );
  }

  if (done) {
    return (
      <div role="status" className="space-y-3">
        <p className="text-body">Your password is changed, and you have been signed out everywhere.</p>
        <a href="/login" className="text-brand underline underline-offset-2">
          Sign in with the new password
        </a>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const password = String(form.get('password') ?? '');
        const confirm = String(form.get('confirm') ?? '');
        if (password !== confirm) {
          setError('The two passwords do not match.');
          return;
        }
        setBusy(true);
        setError(null);
        const result = await resetPassword(token, password);
        setBusy(false);
        if (result.error) setError(ERRORS[result.error] ?? 'That did not go through. Try again.');
        else {
          // Take the spent token out of the address bar and history.
          window.history.replaceState(null, '', window.location.pathname);
          setDone(true);
        }
      }}
    >
      {error && (
        <div role="alert" className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-3 text-small text-danger">
          {error}
        </div>
      )}
      <Field
        label="New password"
        name="password"
        type="password"
        required
        minLength={12}
        autoComplete="new-password"
        hint="At least twelve characters. A phrase you will remember beats a word with symbols."
      />
      <Field label="The same again" name="confirm" type="password" required minLength={12} autoComplete="new-password" />
      <Button full size="lg" type="submit" disabled={busy}>
        {busy ? 'Setting it…' : 'Set the new password'}
      </Button>
    </form>
  );
}
