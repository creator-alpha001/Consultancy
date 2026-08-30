'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { ReportActionState, raiseReportAction } from '@/app/actions/report';
import { Button, Card, ErrorNote } from '@/components/ui';

interface Reason {
  code: string;
  labels: Record<string, string>;
  isWelfareConcern: boolean;
}

function Submit(): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? 'Sending…' : 'Send report'}
    </Button>
  );
}

/**
 * Reporting, from wherever the thing being reported is shown.
 *
 * Collapsed by default and never styled as a warning: a report control
 * that shouts is a control people press by accident, and one buried in a
 * settings page is one nobody finds when it matters.
 *
 * The reasons come from the family pack — the caller passes them in, and
 * neither this component nor any other client code names one.
 */
export function ReportControl({
  subjectType,
  subjectId,
  domainCode,
  reasons,
  what,
  lang = 'en',
}: {
  subjectType: string;
  subjectId: string;
  domainCode: string;
  reasons: Reason[];
  what: string;
  lang?: string;
}): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState<ReportActionState, FormData>(raiseReportAction, {});

  if (reasons.length === 0) return null;

  if (state.done) {
    return (
      <Card className="mt-lg">
        <p className="text-bodyStrong font-medium">Thank you for telling us.</p>
        <p className="mt-sm text-small">
          A person will read this. We will not tell them who reported it.
          {state.done.contentHeld ? ' It is out of public view while it is reviewed.' : ''}
        </p>
        {state.done.supportResources && state.done.supportResources.length > 0 && (
          <ul className="mt-md flex flex-col gap-xs text-small">
            <li className="font-medium">If you need to talk to someone yourself:</li>
            {state.done.supportResources.map((r) => (
              <li key={r.value}>
                {r.label} — <span className="font-medium">{r.value}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-xl min-h-[48px] text-small text-ink-muted underline"
      >
        Report this {what}
      </button>
    );
  }

  return (
    <Card className="mt-xl">
      <p className="text-bodyStrong font-medium">Report this {what}</p>
      <p className="mt-sm text-small text-ink-muted">
        A person reviews every report. The person you are reporting is never told who reported them.
      </p>
      <ErrorNote code={state.error?.code} message={state.error?.message} />
      <form action={action} className="mt-md flex flex-col gap-md">
        <input type="hidden" name="subjectType" value={subjectType} />
        <input type="hidden" name="subjectId" value={subjectId} />
        <input type="hidden" name="domainCode" value={domainCode} />

        <fieldset className="flex flex-col gap-xs">
          <legend className="text-small text-ink-muted">What happened?</legend>
          {reasons.map((r) => (
            <label key={r.code} className="flex min-h-[44px] items-center gap-md text-body">
              <input type="radio" name="reasonCode" value={r.code} required />
              {r.labels[lang] ?? r.labels.en ?? r.code}
            </label>
          ))}
        </fieldset>

        <label className="flex flex-col gap-xs">
          <span className="text-small text-ink-muted">Anything you want to add (optional)</span>
          <textarea
            name="detail"
            rows={3}
            className="w-full rounded-md border border-rule bg-surface px-lg py-md text-base"
          />
        </label>

        <div className="flex gap-md">
          <Submit />
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
