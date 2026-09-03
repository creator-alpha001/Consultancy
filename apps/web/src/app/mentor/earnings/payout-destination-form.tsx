'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { setPayoutDestinationAction } from '@/app/actions/payout';
import { Card } from '@/components/ui';
import type { PayoutDestination } from './page';

/**
 * Where payouts go.
 *
 * The account number is typed and never shown again — not in this form,
 * not on reload, not as a masked placeholder built from the real value.
 * What comes back from the server is the last four digits, which is all
 * anyone needs to recognise their own account.
 *
 * The form starts COLLAPSED when a destination already exists. Changing
 * where money goes should take a deliberate click, not be one stray
 * keystroke away in a field that is already focused — it is the single
 * highest-value thing an attacker with a hijacked session could alter.
 */
export function PayoutDestinationForm({
  destination,
}: {
  destination: PayoutDestination | null;
}): JSX.Element {
  const [state, formAction] = useFormState(setPayoutDestinationAction, {});
  const [open, setOpen] = useState(destination === null);

  return (
    <Card tone="outline">
      {destination && (
        <div className="mb-lg">
          <dl className="grid gap-x-xl gap-y-md sm:grid-cols-2">
            <div>
              <dt className="text-small text-ink-muted">Account holder</dt>
              <dd className="mt-xs text-bodyStrong font-medium">{destination.accountHolderName}</dd>
            </div>
            <div>
              <dt className="text-small text-ink-muted">Account</dt>
              <dd className="mt-xs text-bodyStrong font-medium tabular-nums">
                ……{destination.bankAccountLast4}
                <span className="ml-md font-normal text-ink-muted">{destination.bankIfsc}</span>
              </dd>
            </div>
          </dl>

          <p className="mt-lg text-small">
            {destination.verifiedAt ? (
              <span className="inline-flex items-center gap-sm text-good">
                <svg viewBox="0 0 16 16" className="h-[13px] w-[13px]" fill="currentColor" aria-hidden="true">
                  <path d="M6.2 11.6L3 8.4l1.1-1.1 2.1 2.1L11.9 3.6 13 4.7z" />
                </svg>
                The bank confirmed this account
              </span>
            ) : (
              // Not an error, and not a success either. A destination that
              // has not been proven must not look proven.
              <span className="text-warn">
                Waiting for the bank to confirm this account. Payouts can be instructed, but a wrong
                detail will only surface when one fails.
              </span>
            )}
          </p>

          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-lg inline-flex min-h-[44px] items-center rounded-pill border border-rule px-xl text-small font-medium transition-colors hover:bg-surface-sunk"
            >
              Change these details
            </button>
          )}
        </div>
      )}

      {open && (
        <form action={formAction} className={destination ? 'border-t border-rule pt-lg' : ''}>
          {state.error && (
            <p role="alert" className="mb-lg rounded-md bg-correction-soft px-lg py-md text-small text-correction">
              {state.error}
            </p>
          )}
          {state.ok && (
            <p className="mb-lg rounded-md bg-good-soft px-lg py-md text-small text-good">
              Saved. Payouts from now on go to this account.
            </p>
          )}

          <Field
            name="accountHolderName"
            label="Name on the account"
            hint="Exactly as your bank has it. A mismatch is the usual reason a transfer is refused."
            defaultValue={destination?.accountHolderName}
            autoComplete="off"
          />

          {/*
            `type="password"` on an account number, and autoComplete off.
            Not because it is a password, but because a bank account number
            on screen in a shared room or a screen-shared call is the same
            exposure — and browser autofill has no business storing it.
          */}
          <Field
            name="accountNumber"
            label="Account number"
            type="password"
            inputMode="numeric"
            hint="We never store this. It is exchanged with the payment aggregator, and we keep the last four digits only."
            autoComplete="off"
          />
          <Field
            name="confirmAccountNumber"
            label="Account number again"
            type="password"
            inputMode="numeric"
            hint="Typed twice on purpose — nothing checks this number until a transfer fails."
            autoComplete="off"
          />
          <Field
            name="ifsc"
            label="IFSC code"
            hint="Eleven characters, e.g. HDFC0001234."
            defaultValue={destination?.bankIfsc}
            autoComplete="off"
          />

          <div className="mt-xl flex flex-wrap gap-md">
            <Submit hasExisting={destination !== null} />
            {destination && (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-[48px] items-center rounded-pill border border-rule px-xl text-bodyStrong font-medium transition-colors hover:bg-surface-sunk"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </Card>
  );
}

function Submit({ hasExisting }: { hasExisting: boolean }): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[48px] items-center rounded-pill bg-accent px-xl text-bodyStrong font-medium text-accent-ink transition-opacity hover:opacity-85 disabled:opacity-40"
    >
      {pending ? 'Checking with the bank…' : hasExisting ? 'Send payouts here instead' : 'Send payouts here'}
    </button>
  );
}

function Field({
  name,
  label,
  hint,
  type = 'text',
  defaultValue,
  inputMode,
  autoComplete,
}: {
  name: string;
  label: string;
  hint?: string;
  type?: string;
  defaultValue?: string;
  inputMode?: 'numeric';
  autoComplete?: string;
}): JSX.Element {
  const id = `payout-${name}`;
  return (
    <div className="mb-lg">
      <label htmlFor={id} className="mb-sm block text-small font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required
        inputMode={inputMode}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="w-full min-h-[48px] rounded-md border border-rule bg-surface px-lg py-md text-body transition-colors hover:border-ink-faint focus:border-ink"
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-sm text-caption text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
