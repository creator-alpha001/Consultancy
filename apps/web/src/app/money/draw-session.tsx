'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { drawSessionAction } from '@/app/actions/packages';
import { Card, Money } from '@/components/ui';

export interface PackagePurchase {
  id: string;
  title: string;
  sessionsTotal: number;
  sessionsUsed: number;
  sessionsLeft: number;
  amountPaise: string;
  perSessionPaise: string;
  currency: string;
  engagementType: string;
  createdAt: string;
}

/**
 * One package, and a way to spend a session from it.
 *
 * The category is chosen HERE rather than at purchase, which is the point
 * of the design: five reviews can be spent on five different papers. If
 * it were fixed when the package was bought, a package would be less
 * useful than buying singly.
 *
 * Drawing a session lands on the agenda, because a drawn session is an
 * ordinary engagement and the next thing to settle is what it is for.
 */
export function DrawSession({
  purchase,
  categories,
  language,
  domainCode,
}: {
  purchase: PackagePurchase;
  categories: Array<{ id: string; path: string }>;
  language: string;
  /** The field the session will be spent in. Null when none is resolved. */
  domainCode: string | null;
}): JSX.Element {
  const [state, formAction] = useFormState(drawSessionAction, {});
  const exhausted = purchase.sessionsLeft <= 0;
  // Without a field there is nothing to spend the session against — the
  // categories list would be empty and the draw would fail on the
  // server. Say so here instead of offering a form that cannot work.
  const noField = !domainCode || categories.length === 0;

  return (
    <Card tone={exhausted ? 'sunk' : 'outline'}>
      <div className="flex flex-wrap items-baseline justify-between gap-md">
        <div>
          <p className="text-heading font-semibold tracking-tight">{purchase.title}</p>
          <p className="mt-xs text-small text-ink-muted">
            <Money paise={purchase.amountPaise} currency={purchase.currency} /> ·{' '}
            <Money paise={purchase.perSessionPaise} currency={purchase.currency} /> a session
          </p>
        </div>
        <p className="text-bodyStrong font-medium tabular-nums">
          {/* The number is the thing they came to check. */}
          {purchase.sessionsLeft} of {purchase.sessionsTotal} left
        </p>
      </div>

      {/* Progress as a bar AND as the numbers above — never colour alone. */}
      <div className="mt-lg h-1.5 overflow-hidden rounded-pill bg-surface-sunk" aria-hidden="true">
        <div
          className="h-full rounded-pill bg-ink"
          style={{ width: `${(purchase.sessionsUsed / purchase.sessionsTotal) * 100}%` }}
        />
      </div>

      {noField ? (
        <p className="mt-lg text-small text-ink-muted">
          Pick a field first — a session is spent on a category, and there is no field selected to
          choose one from.
        </p>
      ) : exhausted ? (
        <p className="mt-lg text-small text-ink-muted">
          All used. Cancelled sessions come back to you, so this only reads as finished when the work
          actually happened.
        </p>
      ) : (
        <form action={formAction} className="mt-lg">
          {state.error && (
            <p role="alert" className="mb-lg rounded-md bg-correction-soft px-lg py-md text-small text-correction">
              {state.error}
            </p>
          )}
          <input type="hidden" name="purchaseId" value={purchase.id} />
          <input type="hidden" name="domainCode" value={domainCode ?? ''} />
          <input type="hidden" name="language" value={language} />

          <label htmlFor={`cat-${purchase.id}`} className="mb-sm block text-small font-medium">
            What is this session for?
          </label>
          {/* Stacks on a phone: a select with a minimum width beside a
              button cannot fit 360px, and forcing it pushed the whole card
              off the screen. */}
          <div className="flex flex-col gap-md sm:flex-row sm:items-end">
            <select
              id={`cat-${purchase.id}`}
              name="categoryId"
              required
              className="min-h-[48px] w-full rounded-md border border-rule bg-surface px-lg text-body sm:flex-1"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.path}
                </option>
              ))}
            </select>
            <Draw />
          </div>
          <p className="mt-sm text-caption text-ink-muted">
            You are not charged again — this spends one session you have already paid for.
          </p>
        </form>
      )}
    </Card>
  );
}

function Draw(): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[48px] items-center rounded-pill bg-accent px-xl text-bodyStrong font-medium text-accent-ink transition-opacity hover:opacity-85 disabled:opacity-40"
    >
      {pending ? 'Starting…' : 'Use a session'}
    </button>
  );
}
