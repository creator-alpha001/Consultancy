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
  domainCode,
  lang = 'en',
  adultText,
  termsText,
}: {
  seekerWord: string;
  providerWord: string;
  domainCode: string;
  lang?: string;
  /** The 18+ wording, from the family pack — never written in this file. */
  adultText: string;
  termsText: string | null;
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

      {/*
        The wording comes from the family pack and is stored in full when
        accepted — so what someone agreed to survives the text being
        revised later. It is shown here rather than linked, because an
        agreement nobody read is not much of an agreement.
      */}
      <input type="hidden" name="domainCode" value={domainCode} />
      <input type="hidden" name="lang" value={lang} />

      <label className="mb-4 flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmsAdult" className="mt-1 h-4 w-4" required />
        <span>{adultText}</span>
      </label>

      {termsText && (
        <details className="mb-4 rounded-card border border-rule bg-surface-sunk p-3 text-sm">
          <summary className="cursor-pointer font-medium">What you are agreeing to</summary>
          <p className="mt-2 whitespace-pre-wrap text-ink-muted">{termsText}</p>
        </details>
      )}

      <Submit />
    </form>
  );
}
