'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Button, ErrorNote } from '@/components/ui';
import { AskState, askQuestionAction } from '@/app/actions/board';

function Submit(): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Sending…' : 'Ask'}
    </Button>
  );
}

export function AskForm({ domainCode }: { domainCode: string }): JSX.Element {
  const [state, action] = useFormState<AskState, FormData>(askQuestionAction, {});

  // CLAUDE.md #25: distress-flagged content is never answered with "your
  // post was rejected". It is held quietly, and the response is the
  // family's real helplines.
  if (state.distressFlagged && state.supportResources) {
    return (
      <div role="status" className="rounded-card border border-accent bg-paper p-3">
        <p className="font-medium">Thank you for writing that down.</p>
        <p className="mt-2 text-sm text-ink-muted">
          Preparing for these exams is genuinely hard, and you do not have to do it alone. If you
          want to talk to someone now, these lines are free and open around the clock.
        </p>
        <ul className="mt-3 space-y-1.5 text-sm">
          {state.supportResources.map((r) => (
            <li key={r.value} className="flex items-center justify-between gap-2">
              <span className="text-ink-muted">{r.label}</span>
              {/* A number worth calling in a bad moment deserves a
                  thumb-sized target — this is the response to a distress
                  flag (#25), not a place to make someone tap precisely. */}
              <a href={`tel:${r.value}`} className="inline-flex min-h-[44px] items-center font-medium underline">
                {r.value}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-muted">
          Your question has been passed to a person on our team, not published automatically.
        </p>
      </div>
    );
  }

  if (state.heldForReview) {
    return (
      <div role="status" className="rounded-card border border-rule bg-paper p-3 text-sm">
        <p className="font-medium">Thanks — a person is reviewing this before it goes up.</p>
        <p className="mt-1 text-ink-muted">
          That usually means it looked like it contained contact details. Keeping conversations on
          the platform is what lets us hold money in escrow and settle disputes.
        </p>
      </div>
    );
  }

  if (state.published) {
    return (
      <div role="status" className="rounded-card border border-accent bg-paper p-3 text-sm">
        <p className="font-medium">Posted. Mentors can answer it now.</p>
      </div>
    );
  }

  return (
    <form action={action}>
      <ErrorNote code={state.error?.code} message={state.error?.message} />
      <input type="hidden" name="domainCode" value={domainCode} />
      <input type="hidden" name="bodyLang" value="en" />
      <label htmlFor="q-body" className="mb-1 block text-sm font-medium">
        Your question
      </label>
      <textarea
        id="q-body"
        name="bodyOriginal"
        required
        rows={4}
        className="mb-3 w-full rounded-card border border-rule bg-paper px-3 py-2 text-base"
        placeholder="What are you stuck on?"
      />
      <Submit />
    </form>
  );
}
