'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Button, ErrorNote, Field } from '@/components/ui';
import { FormState, loginAction } from '@/app/actions/auth';

function Submit(): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Signing in…' : 'Sign in'}
    </Button>
  );
}

export function LoginForm(): JSX.Element {
  const [state, action] = useFormState<FormState, FormData>(loginAction, {});
  const [useRecovery, setUseRecovery] = useState(false);

  // The API answers MFA_REQUIRED when the password was right but a
  // second factor is still needed. That is a prompt, not a failure — so
  // it is presented as the next step rather than as an error.
  const needsCode = state.error?.code === 'MFA_REQUIRED' || state.error?.code === 'MFA_INVALID';

  return (
    <form action={action}>
      {needsCode ? (
        <div role="status" className="mb-4 rounded-card border border-accent bg-surface-sunk p-3 text-sm">
          <p className="font-medium">One more step</p>
          <p className="mt-1 text-ink-muted">
            {state.error?.code === 'MFA_INVALID'
              ? 'That code was not valid. Try the current one from your authenticator.'
              : 'Enter the six-digit code from your authenticator app.'}
          </p>
        </div>
      ) : (
        <ErrorNote code={state.error?.code} message={state.error?.message} />
      )}

      <Field label="Email" name="email" type="email" required autoComplete="email" />
      <Field label="Password" name="password" type="password" required autoComplete="current-password" />

      {needsCode &&
        (useRecovery ? (
          <Field
            label="Recovery code"
            name="recoveryCode"
            required
            autoComplete="one-time-code"
            hint="Each recovery code works once."
          />
        ) : (
          <Field
            label="Authenticator code"
            name="totpCode"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            required
            autoComplete="one-time-code"
          />
        ))}

      <Submit />

      {needsCode && (
        <button
          type="button"
          onClick={() => setUseRecovery((v) => !v)}
          className="mt-3 w-full text-center text-sm text-ink-muted underline"
        >
          {useRecovery ? 'Use my authenticator instead' : 'I have lost my device — use a recovery code'}
        </button>
      )}
    </form>
  );
}
