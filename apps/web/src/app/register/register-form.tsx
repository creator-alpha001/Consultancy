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
  familyCode,
  lang = 'en',
  adultText,
  termsText,
}: {
  seekerWord: string;
  providerWord: string;
  familyCode: string | undefined;
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
        {/*
            The whole row is the target, not the 16px dot. This is the
            choice that decides which half of the product someone lands
            in, and a mis-tap sends them to the wrong one.
        */}
        <div className="grid gap-sm">
          <label className="flex min-h-[44px] cursor-pointer items-center gap-md rounded-md border border-rule px-lg text-small transition-colors hover:bg-surface-sunk has-[:checked]:border-ink has-[:checked]:bg-surface-sunk">
            <input type="radio" name="role" value="seeker" defaultChecked className="h-5 w-5 flex-none" />
            <span>
              {seekerWord} <span className="text-ink-muted">— I want guidance</span>
            </span>
          </label>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-md rounded-md border border-rule px-lg text-small transition-colors hover:bg-surface-sunk has-[:checked]:border-ink has-[:checked]:bg-surface-sunk">
            <input type="radio" name="role" value="provider" className="h-5 w-5 flex-none" />
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
      {familyCode && <input type="hidden" name="familyCode" value={familyCode} />}
      <input type="hidden" name="lang" value={lang} />

      {/*
          A 16px checkbox is a miss on a phone, and this is the one that
          gates an 18+ platform (#27) — a mis-tap here is not cosmetic.
          The whole row is the target, not just the box.
      */}
      <label className="mb-lg flex min-h-[44px] cursor-pointer items-start gap-md py-sm text-small">
        <input type="checkbox" name="confirmsAdult" className="mt-[2px] h-6 w-6 flex-none" required />
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
