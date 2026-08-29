'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Button, Card, ErrorNote } from '@/components/ui';
import {
  AdminActionState,
  RelayState,
  runRelayAction,
  clearHeldAction,
  decideCredentialAction,
  ruleDisputeAction,
  runCredentialCheckAction,
  settleDisputeAction,
} from '@/app/actions/admin';

function Submit({
  label,
  busy,
  variant = 'primary',
}: {
  label: string;
  busy: string;
  variant?: 'primary' | 'secondary' | 'danger';
}): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}

const input =
  'w-full min-h-[48px] rounded-md border border-rule bg-surface px-lg py-md text-base';

/**
 * Deciding a credential.
 *
 * Two buttons in one form, distinguished by the `decision` they submit —
 * a verify and a reject are the same decision made two ways, and putting
 * them side by side stops "verify" being the path of least resistance.
 * A rejection requires a note, because "rejected" with no reason gives
 * the provider nothing to correct.
 */
export function CredentialDecision({ credentialId }: { credentialId: string }): JSX.Element {
  const [state, action] = useFormState<AdminActionState, FormData>(decideCredentialAction, {});
  const [checkState, checkAction] = useFormState<AdminActionState, FormData>(
    runCredentialCheckAction,
    {},
  );

  if (state.done) {
    return <p className="text-small text-ink-muted">Recorded: {state.done}.</p>;
  }

  return (
    <div className="mt-lg flex flex-col gap-md">
      <ErrorNote code={state.error?.code ?? checkState.error?.code} message={state.error?.message ?? checkState.error?.message} />

      <form action={checkAction}>
        <input type="hidden" name="credentialId" value={credentialId} />
        {/*
          Advisory only. It never grants a tier — running it is a way of
          gathering evidence for the person deciding, not a decision.
        */}
        <Submit label="Run the automated check" busy="Checking…" variant="secondary" />
      </form>

      <form action={action} className="flex flex-col gap-md">
        <input type="hidden" name="credentialId" value={credentialId} />
        <textarea
          name="note"
          rows={2}
          placeholder="Note — required to reject, and the provider reads it."
          className={input}
        />
        <div className="flex flex-wrap gap-md">
          <button
            type="submit"
            name="decision"
            value="verified"
            className="inline-flex min-h-[48px] items-center rounded-pill bg-accent px-xl text-bodyStrong font-medium text-accent-ink"
          >
            Verify
          </button>
          <button
            type="submit"
            name="decision"
            value="rejected"
            className="inline-flex min-h-[48px] items-center rounded-pill border border-rule bg-surface px-xl text-bodyStrong font-medium text-correction"
          >
            Reject
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Ruling, then settling — deliberately two steps.
 *
 * Ruling decides; settling moves money through `money/`. Keeping them
 * apart means a mistyped ruling can be appealed before anything is paid,
 * and it makes the money movement a separate, deliberate act rather than
 * a side effect of filling in a form.
 */
export function DisputeDecision({
  disputeId,
  status,
}: {
  disputeId: string;
  status: string;
}): JSX.Element {
  const [state, action] = useFormState<AdminActionState, FormData>(ruleDisputeAction, {});
  const [settleState, settleActionFn] = useFormState<AdminActionState, FormData>(
    settleDisputeAction,
    {},
  );

  return (
    <div className="mt-lg flex flex-col gap-lg">
      <ErrorNote
        code={state.error?.code ?? settleState.error?.code}
        message={state.error?.message ?? settleState.error?.message}
      />

      {status !== 'settled' && (
        <form action={action} className="flex flex-col gap-md">
          <input type="hidden" name="disputeId" value={disputeId} />
          <label htmlFor={`outcome-${disputeId}`} className="text-smallStrong font-medium">
            Outcome
          </label>
          <select id={`outcome-${disputeId}`} name="outcome" className={input}>
            <option value="release_to_provider">Release to the provider</option>
            <option value="refund_to_seeker">Refund the seeker</option>
            <option value="split">Split</option>
          </select>

          <label htmlFor={`refund-${disputeId}`} className="text-smallStrong font-medium">
            Refund to the seeker (₹, for a split)
          </label>
          <input id={`refund-${disputeId}`} name="seekerRefundRupees" type="number" step="0.01" className={input} />

          <label htmlFor={`rationale-${disputeId}`} className="text-smallStrong font-medium">
            Rationale
          </label>
          <textarea
            id={`rationale-${disputeId}`}
            name="rationale"
            rows={3}
            required
            className={input}
            placeholder="What the evidence showed, and why this outcome follows from it. Both parties read this."
          />
          <div>
            <Submit label={state.done ? 'Ruled' : 'Record the ruling'} busy="Recording…" />
          </div>
        </form>
      )}

      {(status === 'ruled' || state.done === 'ruled') && (
        <form action={settleActionFn}>
          <input type="hidden" name="disputeId" value={disputeId} />
          <p className="mb-md text-small text-ink-muted">
            Settling carries the standing ruling out against the escrow. It moves money.
          </p>
          <Submit label="Settle" busy="Settling…" variant="secondary" />
        </form>
      )}
    </div>
  );
}

/** Releasing held content into public view. */
export function ClearHeld({ questionId }: { questionId: string }): JSX.Element {
  const [state, action] = useFormState<AdminActionState, FormData>(clearHeldAction, {});
  if (state.done) return <p className="mt-md text-small text-ink-muted">Published.</p>;
  return (
    <form action={action} className="mt-md">
      <ErrorNote code={state.error?.code} message={state.error?.message} />
      <input type="hidden" name="questionId" value={questionId} />
      <Submit label="Publish it" busy="Publishing…" variant="secondary" />
    </form>
  );
}

/**
 * Pushing the outbox through.
 *
 * The counts come back from the relay itself rather than being guessed
 * from a page reload: `claimed` is what it took, `dispatched` what
 * actually reached the aggregator, and `failed` / `deadLettered` are the
 * two ways it did not — reported separately because a transient failure
 * and one that has given up need different responses.
 */
export function RelayPanel(): JSX.Element {
  const [state, action] = useFormState<RelayState, FormData>(runRelayAction, {});
  return (
    <div className="flex flex-col gap-md">
      <ErrorNote code={state.error?.code} message={state.error?.message} />
      {state.result && (
        <p className="text-small">
          Claimed {state.result.claimed} · instructed {state.result.dispatched} · failed{' '}
          {state.result.failed} · gave up on {state.result.deadLettered}
        </p>
      )}
      <form action={action}>
        <Submit label="Run the relay now" busy="Dispatching…" variant="secondary" />
      </form>
    </div>
  );
}
