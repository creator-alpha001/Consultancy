'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import {
  ActionState,
  agreeAction,
  completeAction,
  raiseDisputeAction,
  replyToReviewAction,
  reviewAction,
  submitWorkAction,
} from '@/app/actions/engagement';
import { bookSessionAction } from '@/app/actions/engagement';
import { Button, Card, ErrorNote } from '@/components/ui';

function Pending({ children, variant }: { children: string; variant?: 'secondary' | 'danger' }): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? 'Working…' : children}
    </Button>
  );
}

export function AgreePanel({ engagementId }: { engagementId: string }): JSX.Element {
  const [state, formAction] = useFormState<ActionState, FormData>(agreeAction, {});
  return (
    <Card>
      <ErrorNote code={state.error?.code} message={state.error?.message} />
      <p className="text-sm">
        Both of you confirm the terms here. Agreeing snapshots which skills this work requires — a later change to
        the taxonomy will not alter what was agreed today.
      </p>
      <form action={formAction} className="mt-3">
        <input type="hidden" name="engagementId" value={engagementId} />
        <Pending>Agree to these terms</Pending>
      </form>
    </Card>
  );
}

export function SubmitWorkPanel({ engagementId }: { engagementId: string }): JSX.Element {
  const [state, formAction] = useFormState<ActionState, FormData>(submitWorkAction, {});
  return (
    <Card>
      <ErrorNote code={state.error?.code} message={state.error?.message} />
      <form action={formAction}>
        <input type="hidden" name="engagementId" value={engagementId} />
        <label htmlFor="contentRef" className="mb-1 block text-sm font-medium">
          What you are sending
        </label>
        <input
          id="contentRef"
          name="contentRef"
          required
          placeholder="A reference to your answer, e.g. gs2-collegium-attempt-3"
          className="w-full rounded-card border border-rule bg-paper px-3 py-2 text-sm"
        />
        <label htmlFor="note" className="mb-1 mt-3 block text-sm font-medium">
          Anything they should look at first
        </label>
        <textarea
          id="note"
          name="note"
          rows={3}
          className="w-full rounded-card border border-rule bg-paper px-3 py-2 text-sm"
        />
        <div className="mt-3">
          <Pending>Send it</Pending>
        </div>
      </form>
      {/*
          A text reference, not an upload. Private storage with signed URLs
          and viewer watermarking is required before any real document can
          move through here — so this screen does not offer a file picker it
          could not honour.
      */}
    </Card>
  );
}

/**
 * Accepting the work releases escrow, so this is deliberately a
 * deliberate act: the money moves the moment it is pressed, and the
 * three options are shown together so accepting is not the only visible
 * door.
 */
export function DecisionPanel({
  engagementId,
  untickedGoals,
}: {
  engagementId: string;
  untickedGoals: number;
}): JSX.Element {
  const [completeState, completeForm] = useFormState<ActionState, FormData>(completeAction, {});
  const [disputeState, disputeForm] = useFormState<ActionState, FormData>(raiseDisputeAction, {});
  const [showDispute, setShowDispute] = useState(false);

  return (
    <Card>
      <ErrorNote code={completeState.error?.code} message={completeState.error?.message} />
      <ErrorNote code={disputeState.error?.code} message={disputeState.error?.message} />

      {untickedGoals > 0 && (
        <p className="mb-3 rounded-card border border-correction px-3 py-2 text-sm text-correction">
          {untickedGoals} agreed goal{untickedGoals === 1 ? ' was' : 's were'} never ticked. Worth raising before
          you accept.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <form action={completeForm}>
          <input type="hidden" name="engagementId" value={engagementId} />
          <Pending>Accept and release payment</Pending>
        </form>
        <Button type="button" variant="secondary" disabled title="Not built yet — see TRACKER.md D9">
          Ask for a revision
        </Button>
        <Button type="button" variant="danger" onClick={() => setShowDispute(!showDispute)}>
          Something is wrong
        </Button>
      </div>

      {/*
          "Ask for a revision" is deliberately visible but disabled: it is
          designed and not built, so today the only paths are accepting or
          disputing. Hiding it would make the gap invisible instead of known.
      */}

      {showDispute && (
        <form action={disputeForm} className="mt-4 border-t border-rule pt-4">
          <input type="hidden" name="engagementId" value={engagementId} />
          <label htmlFor="reasonCode" className="mb-1 block text-sm font-medium">
            What went wrong
          </label>
          <select
            id="reasonCode"
            name="reasonCode"
            className="w-full rounded-card border border-rule bg-paper px-3 py-2 text-sm"
          >
            <option value="not_delivered">Nothing was delivered</option>
            <option value="not_as_agreed">Not what the agenda agreed</option>
            <option value="quality">The quality is not what was promised</option>
            <option value="conduct">A conduct problem</option>
          </select>
          <label htmlFor="bodyOriginal" className="mb-1 mt-3 block text-sm font-medium">
            In your own words
          </label>
          <textarea
            id="bodyOriginal"
            name="bodyOriginal"
            rows={4}
            required
            className="w-full rounded-card border border-rule bg-paper px-3 py-2 text-sm"
          />
          <div className="mt-3">
            <Pending variant="danger">Raise the dispute</Pending>
          </div>
          {/*
              Raising this freezes the money first, before anything else happens —
              nobody can draw it while you disagree. Your words are kept in the
              language you wrote them in, and that original is what an adjudicator
              reads.
          */}
        </form>
      )}
    </Card>
  );
}

export function ReviewPanel({
  engagementId,
  direction,
}: {
  engagementId: string;
  direction: 'seeker_on_provider' | 'provider_on_seeker';
}): JSX.Element {
  const [state, formAction] = useFormState<ActionState, FormData>(reviewAction, {});
  const [rating, setRating] = useState(4);

  if (state.ok) {
    return (
      <Card>
        <p className="text-sm">Thank you — recorded against the skills this engagement actually required.</p>
      </Card>
    );
  }

  return (
    <Card>
      <ErrorNote code={state.error?.code} message={state.error?.message} />
      <form action={formAction}>
        <input type="hidden" name="engagementId" value={engagementId} />
        <input type="hidden" name="direction" value={direction} />
        <input type="hidden" name="rating" value={rating} />

        <p className="mb-2 text-sm font-medium">How did it go?</p>
        <div className="flex gap-1" role="group" aria-label="Rating out of five">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              aria-pressed={rating === n}
              aria-label={`${n} out of 5`}
              className={`h-9 w-9 rounded-card border text-sm ${
                n <= rating ? 'border-accent bg-accent text-white' : 'border-rule bg-paper'
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        <label htmlFor="bodyOriginal" className="mb-1 mt-3 block text-sm font-medium">
          What did they actually help you fix?
        </label>
        <textarea
          id="bodyOriginal"
          name="bodyOriginal"
          rows={3}
          className="w-full rounded-card border border-rule bg-paper px-3 py-2 text-sm"
        />
        <div className="mt-3">
          <Pending>Leave the review</Pending>
        </div>
      </form>
      {/*
          Recorded against this engagement's skills, not as a general score
          for the person — and append-only, so it cannot be quietly rewritten
          later.
      */}
    </Card>
  );
}

/** Booking a session onto an engagement that does not have one yet. */
export function BookSessionPanel({ engagementId }: { engagementId: string }): JSX.Element {
  const [state, formAction] = useFormState<ActionState, FormData>(bookSessionAction, {});
  const timezone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'Asia/Kolkata';

  return (
    <Card>
      <ErrorNote code={state.error?.code} message={state.error?.message} />
      {state.ok && <p className="mb-2 text-sm text-accent">Booked.</p>}
      <form action={formAction}>
        <input type="hidden" name="engagementId" value={engagementId} />
        <input type="hidden" name="timezone" value={timezone} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="scheduledStart" className="mb-1 block text-sm font-medium">
              Starts
            </label>
            <input
              id="scheduledStart"
              name="scheduledStart"
              type="datetime-local"
              required
              className="w-full rounded-card border border-rule bg-paper px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="scheduledEnd" className="mb-1 block text-sm font-medium">
              Ends
            </label>
            <input
              id="scheduledEnd"
              name="scheduledEnd"
              type="datetime-local"
              required
              className="w-full rounded-card border border-rule bg-paper px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-3">
          <Pending>Book this time</Pending>
        </div>
      </form>
      {/*
          Times are stored in UTC with your timezone ({timezone}) alongside —
          never a fixed offset.
      */}
    </Card>
  );
}

/**
 * Answering a review about you.
 *
 * One reply, by the subject only, append-only — all enforced by
 * triggers, so this form does not re-check any of it and simply lets the
 * server refuse. A review the reviewed party cannot answer is a weapon
 * rather than a record.
 */
export function ReplyPanel({
  reviewId,
  lang,
}: {
  reviewId: string;
  lang: string;
}): JSX.Element {
  const [state, formAction] = useFormState<ActionState, FormData>(replyToReviewAction, {});

  if (state.ok) {
    return <p className="mt-md text-small text-ink-muted">Your reply is published beside the review.</p>;
  }

  return (
    <form action={formAction} className="mt-md">
      <ErrorNote code={state.error?.code} message={state.error?.message} />
      <input type="hidden" name="reviewId" value={reviewId} />
      <input type="hidden" name="bodyLang" value={lang} />
      <label htmlFor={`reply-${reviewId}`} className="mb-sm block text-smallStrong font-medium">
        Reply — once, and it cannot be edited afterwards
      </label>
      <textarea
        id={`reply-${reviewId}`}
        name="bodyOriginal"
        rows={3}
        required
        className="mb-md w-full rounded-md border border-rule bg-surface px-lg py-md text-base"
        placeholder="Answer the substance. This sits beside the review permanently."
      />
      <SubmitButtonPlain label="Publish the reply" busy="Publishing…" />
    </form>
  );
}

function SubmitButtonPlain({ label, busy }: { label: string; busy: string }): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}
