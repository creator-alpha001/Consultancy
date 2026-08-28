'use client';

import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { Button, ErrorNote, Field } from '@/components/ui';
import { FormState, confirmEnrolmentAction } from '@/app/actions/auth';

function Submit(): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Checking…' : 'Confirm and finish'}
    </Button>
  );
}

export function EnrolForm({
  secret,
  error,
}: {
  secret?: string;
  error?: { code: string; message: string };
}): JSX.Element {
  const [state, action] = useFormState<FormState, FormData>(confirmEnrolmentAction, {});

  // Recovery codes are shown EXACTLY once — the server stores only
  // hashes, so this screen is the only chance to keep them.
  if (state.ok && state.recoveryCodes) {
    return (
      <div>
        <div role="status" className="mb-4 rounded-card border border-accent bg-paper-raised p-3 text-sm">
          <p className="font-medium">Two-factor authentication is on.</p>
        </div>
        <h2 className="mb-2 font-medium">Save your recovery codes</h2>
        <p className="mb-3 text-sm text-ink-muted">
          Each one works once, if you lose your device. They are shown now and never again — only
          hashes are stored.
        </p>
        <ul className="mb-4 grid grid-cols-2 gap-1 rounded-card border border-rule bg-paper p-3 font-mono text-sm">
          {state.recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <Link href="/login" className="block rounded-card bg-accent px-4 py-2 text-center text-sm font-medium text-white">
          Continue to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action}>
      <ErrorNote code={error?.code ?? state.error?.code} message={error?.message ?? state.error?.message} />

      <ol className="mb-4 space-y-3 text-sm">
        <li>
          <span className="font-medium">1. Add this key to your authenticator app.</span>
          {secret && (
            <code className="mt-1 block break-all rounded-card border border-rule bg-paper p-2 font-mono text-xs">
              {secret}
            </code>
          )}
          <p className="mt-1 text-xs text-ink-muted">
            Any TOTP app works — the standard six-digit, 30-second kind.
          </p>
        </li>
        <li className="font-medium">2. Enter the code it shows.</li>
      </ol>

      <Field
        label="Six-digit code"
        name="code"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        required
        autoComplete="one-time-code"
      />
      <Submit />
    </form>
  );
}
