'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Button, Card, ErrorNote } from '@/components/ui';
import {
  DisputeActionState,
  appealAction,
  withdrawDisputeAction,
} from '@/app/actions/dispute';

function Submit({ label, busy }: { label: string; busy: string }): JSX.Element {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? busy : label}</Button>;
}

/**
 * Appealing.
 *
 * Whether an appeal is possible at all is the API's decision — the tier
 * ladder is family data and the final rung is declared there. This form
 * is offered whenever a ruling exists and lets the server refuse, rather
 * than reimplementing the ladder in the browser where it would drift.
 */
export function AppealPanel({ disputeId, lang }: { disputeId: string; lang: string }): JSX.Element {
  const [state, action] = useFormState<DisputeActionState, FormData>(appealAction, {});

  if (state.appealed) {
    return (
      <Card>
        <p className="text-body">Appealed. It moves to the next rung and a different person looks at it.</p>
      </Card>
    );
  }

  return (
    <Card>
      <ErrorNote code={state.error?.code} message={state.error?.message} />
      <form action={action}>
        <input type="hidden" name="disputeId" value={disputeId} />
        {/*
          The original language is kept, never overwritten by a
          translation (CLAUDE.md #20) — in a dispute the original text is
          what is authoritative, so it is captured with its language.
        */}
        <input type="hidden" name="bodyLang" value={lang} />
        <label htmlFor="appeal-body" className="mb-sm block text-smallStrong font-medium">
          Why is this ruling wrong?
        </label>
        <textarea
          id="appeal-body"
          name="bodyOriginal"
          required
          rows={5}
          className="mb-lg w-full rounded-md border border-rule bg-surface px-lg py-md text-base"
          placeholder="What the ruling missed, and what you think should happen instead."
        />
        <Submit label="Appeal this ruling" busy="Sending…" />
      </form>
    </Card>
  );
}

/** Withdrawing. Only the raiser, only while open — the API enforces both. */
export function WithdrawPanel({ disputeId }: { disputeId: string }): JSX.Element {
  const [state, action] = useFormState<DisputeActionState, FormData>(withdrawDisputeAction, {});

  if (state.withdrawn) {
    return (
      <Card>
        <p className="text-body">Withdrawn. The engagement goes back to where it was and the money unfreezes.</p>
      </Card>
    );
  }

  return (
    <Card>
      <ErrorNote code={state.error?.code} message={state.error?.message} />
      <form action={action}>
        <input type="hidden" name="disputeId" value={disputeId} />
        <p className="mb-md text-small text-ink-muted">
          If you have settled this between yourselves, withdraw it and the engagement continues.
        </p>
        <Submit label="Withdraw" busy="Withdrawing…" />
      </form>
    </Card>
  );
}
