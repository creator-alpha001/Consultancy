'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { setActionDoneAction } from '@/app/actions/progress';
import { Card, EmptyState } from '@/components/ui';

export interface ActionItem {
  annotationId: string;
  engagementId: string;
  ordinal: number;
  bodyText: string;
  bodyLang: string;
  returnedAt: string;
  doneAt: string | null;
}

export interface SeekerProgress {
  trends: Array<{
    dimensionCode: string;
    labels: Record<string, string>;
    points: Array<{ engagementId: string; score: number; at: string }>;
    first: number;
    latest: number;
    change: number;
  }>;
  evaluationsReturned: number;
  actionItems: ActionItem[];
}

/**
 * The things a reviewer asked you to change.
 *
 * These are not a separate list somebody wrote — they are the anchored
 * remarks from marked answers, which is where the advice actually lives.
 * Asking mentors to write action items as well would mean the same thing
 * entered twice and the two drifting apart.
 *
 * Deliberately absent: any count of how many other people finished
 * theirs, any streak, any percentage complete presented as a score. The
 * done ones collapse out of the way rather than being celebrated (#17,
 * and the no-congratulation rule in the voice guide).
 */
export function ActionItemList({
  items,
  language,
}: {
  items: ActionItem[];
  language: string;
}): JSX.Element {
  const [state, setState] = useState<Record<string, boolean>>(
    Object.fromEntries(items.map((i) => [i.annotationId, i.doneAt !== null])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showDone, setShowDone] = useState(false);

  function toggle(annotationId: string): void {
    const next = !state[annotationId];
    // Optimistic: ticking should feel instant on a slow connection, and
    // the failure path below puts it back rather than leaving a lie.
    setState((prev) => ({ ...prev, [annotationId]: next }));
    startTransition(async () => {
      const result = await setActionDoneAction({ annotationId, done: next });
      if (result.error) {
        setState((prev) => ({ ...prev, [annotationId]: !next }));
        setError(result.error);
      } else {
        setError(null);
      }
    });
  }

  if (items.length === 0) {
    return (
      <EmptyState>
        Nothing yet. These appear when a reviewer marks your work and leaves remarks on it.
      </EmptyState>
    );
  }

  const outstanding = items.filter((i) => !state[i.annotationId]);
  const done = items.filter((i) => state[i.annotationId]);

  return (
    <>
      {error && (
        <p role="alert" className="mb-lg rounded-md bg-correction-soft px-lg py-md text-small text-correction">
          {error}
        </p>
      )}

      {outstanding.length === 0 ? (
        <Card>
          <p className="text-body">
            {/* Stated plainly. No congratulation, no exclamation mark. */}
            Nothing outstanding. Everything your reviewers raised is ticked.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-md">
          {outstanding.map((item) => (
            <li key={item.annotationId}>
              <Item item={item} checked={false} onToggle={toggle} pending={pending} language={language} />
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <div className="mt-lg">
          <button
            type="button"
            onClick={() => setShowDone(!showDone)}
            className="text-small text-ink-muted underline underline-offset-4 hover:text-ink"
          >
            {showDone ? 'Hide' : 'Show'} {done.length} you have done
          </button>
          {showDone && (
            <ul className="mt-md grid gap-md">
              {done.map((item) => (
                <li key={item.annotationId}>
                  <Item item={item} checked onToggle={toggle} pending={pending} language={language} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

function Item({
  item,
  checked,
  onToggle,
  pending,
  language,
}: {
  item: ActionItem;
  checked: boolean;
  onToggle: (id: string) => void;
  pending: boolean;
  language: string;
}): JSX.Element {
  return (
    <Card tone={checked ? 'sunk' : 'outline'}>
      <label className="flex cursor-pointer items-start gap-lg">
        <input
          type="checkbox"
          checked={checked}
          disabled={pending}
          onChange={() => onToggle(item.annotationId)}
          className="mt-[3px] h-5 w-5 flex-none"
        />
        <span className="min-w-0 flex-1">
          <span
            className={`block text-body ${checked ? 'text-ink-muted line-through' : ''}`}
            lang={item.bodyLang}
          >
            {item.bodyText}
          </span>
          <span className="mt-sm block text-caption text-ink-muted">
            Remark {item.ordinal} ·{' '}
            {new Date(item.returnedAt).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}{' '}
            ·{' '}
            {/* Back to the sheet it came from — a remark out of context is
                half of what was said. */}
            <Link
              href={`/engagements/${item.engagementId}`}
              className="underline underline-offset-4"
            >
              see it on the answer
            </Link>
          </span>
        </span>
      </label>
    </Card>
  );
}
