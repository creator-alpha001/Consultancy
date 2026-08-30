'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { ActionState, acceptProposalAction, submitProposalAction } from '@/app/actions/engagement';
import { Button, Card, ErrorNote } from '@/components/ui';

function Pending({ children }: { children: string }): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Working…' : children}
    </Button>
  );
}

/**
 * A mentor proposing.
 *
 * Eligibility is checked twice on the server — a service pre-check for a
 * readable error, and a database trigger that fires even on a raw SQL
 * insert. A mentor without the verified skill, tier and language simply
 * cannot land a row here, whatever this form sends.
 */
export function ProposeForm({
  boardPostId,
  suggestedPaise,
}: {
  boardPostId: string;
  suggestedPaise: string;
}): JSX.Element {
  const [state, formAction] = useFormState<ActionState, FormData>(submitProposalAction, {});

  if (state.ok) {
    return (
      <Card>
        <p className="text-sm">Proposal sent. The seeker decides — you will hear either way.</p>
      </Card>
    );
  }

  return (
    <Card>
      <ErrorNote code={state.error?.code} message={state.error?.message} />
      <form action={formAction}>
        <input type="hidden" name="boardPostId" value={boardPostId} />
        <label htmlFor="message" className="mb-1 block text-sm font-medium">
          What would you actually do?
        </label>
        <textarea
          id="message"
          name="message"
          rows={4}
          required
          placeholder="Be concrete. What will they have at the end that they do not have now?"
          className="w-full rounded-card border border-rule bg-paper px-3 py-2 text-sm"
        />
        <label htmlFor="proposedAmountPaise" className="mb-1 mt-3 block text-sm font-medium">
          Your price (paise)
        </label>
        <input
          id="proposedAmountPaise"
          name="proposedAmountPaise"
          type="number"
          min={1}
          defaultValue={suggestedPaise}
          className="w-40 rounded-card border border-rule bg-paper px-3 py-2 text-sm tabular-nums"
        />
        <div className="mt-3">
          <Pending>Send the proposal</Pending>
        </div>
      </form>
      {/*
          If you are not verified for the skills this category requires, in
          this language and at the required tier, this will be refused — by
          the database, not just by a check that could be bypassed.
      */}
    </Card>
  );
}

export function AcceptButton({ proposalId }: { proposalId: string }): JSX.Element {
  const [state, formAction] = useFormState<ActionState, FormData>(acceptProposalAction, {});
  return (
    <form action={formAction}>
      <input type="hidden" name="proposalId" value={proposalId} />
      <ErrorNote code={state.error?.code} message={state.error?.message} />
      <Pending>Accept</Pending>
    </form>
  );
}
