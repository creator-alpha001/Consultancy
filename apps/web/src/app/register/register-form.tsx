'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Button, ErrorNote, Field } from '@/components/ui';
import { FormState, registerAction } from '@/app/actions/auth';
import { pluralWord } from '@/lib/words';

function Submit(): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Creating…' : 'Create account'}
    </Button>
  );
}

export function RegisterForm({
  seekerWord,
  providerWord,
}: {
  seekerWord: string;
  providerWord: string;
}): JSX.Element {
  const [state, action] = useFormState<FormState, FormData>(registerAction, {});

  return (
    <form action={action}>
      <ErrorNote code={state.error?.code} message={state.error?.message} />

      <Field label="Email" name="email" type="email" required autoComplete="email" />
      <Field
        label="Password"
        name="password"
        type="password"
        required
        autoComplete="new-password"
        minLength={12}
        hint="At least 12 characters. A memorable phrase beats a short complicated one."
      />

      <fieldset className="mb-4">
        <legend className="mb-1 block text-sm font-medium">I am joining as</legend>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="role" value="seeker" defaultChecked className="h-4 w-4" />
            <span>
              {seekerWord} <span className="text-ink-muted">— I want guidance</span>
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="role" value="provider" className="h-4 w-4" />
            <span>
              {providerWord} <span className="text-ink-muted">— I want to give it</span>
            </span>
          </label>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          {pluralWord(providerWord)} must set up two-factor authentication before signing in, and must be
          verified before taking paid work.
        </p>
      </fieldset>

      {/* CLAUDE.md #27 — 18+. The API refuses registration without this. */}
      <label className="mb-4 flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmsAdult" className="mt-1 h-4 w-4" />
        <span>I confirm I am 18 years of age or older.</span>
      </label>

      <Submit />
    </form>
  );
}
