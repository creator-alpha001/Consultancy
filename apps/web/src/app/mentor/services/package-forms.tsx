'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { publishPackageAction, withdrawPackageAction } from '@/app/actions/packages';
import { Card, Money } from '@/components/ui';

export interface ProviderPackage {
  id: string;
  engagementType: string;
  skillId: string | null;
  title: string;
  sessionCount: number;
  amountPaise: string;
  perSessionPaise: string;
  currency: string;
  durationMinutes: number | null;
  turnaroundHours: number | null;
}

/**
 * Packages — several sessions sold at once.
 *
 * The form asks for the TOTAL price, not a per-session one, because the
 * total is what gets charged. The per-session figure is shown back as a
 * derived number so a provider can see the discount they are offering
 * without having to hold two figures that must agree.
 */
export function PackageForms({
  packages,
  engagementTypes,
  skills,
  language,
}: {
  packages: ProviderPackage[];
  engagementTypes: string[];
  skills: Array<{ id: string; label: string }>;
  language: string;
}): JSX.Element {
  const [state, formAction] = useFormState(publishPackageAction, {});
  const [, withdrawAction] = useFormState(withdrawPackageAction, {});
  const [chosenType, setChosenType] = useState(engagementTypes[0] ?? 'document_review');
  const [sessions, setSessions] = useState(5);
  const [rupees, setRupees] = useState('');
  const isLive = chosenType === 'live_session';

  const perSession =
    rupees && Number(rupees) > 0 && sessions >= 2
      ? Math.floor((Number(rupees) * 100) / sessions)
      : null;

  return (
    <>
      <section className="mb-xxl">
        <h2 className="mb-sm text-heading font-semibold tracking-tight">Packages</h2>
        <p className="mb-lg max-w-prose text-small text-ink-muted">
          Several sessions bought together. The seeker pays once and uses them when they need to —
          each one still gets its own agreed goals.
        </p>

        {packages.length === 0 ? (
          <Card tone="outline" className="border-dashed">
            <p className="text-body text-ink-muted">
              No packages yet. They are worth offering: someone committing to five reviews is someone
              you will get to know, and the work gets better for it.
            </p>
          </Card>
        ) : (
          <ul className="grid gap-md">
            {packages.map((pkg) => (
              <li key={pkg.id}>
                <Card tone="outline" className="flex flex-wrap items-center justify-between gap-md">
                  <div className="min-w-0">
                    <p className="text-bodyStrong font-medium">{pkg.title}</p>
                    <p className="mt-xs text-small text-ink-muted">
                      {pkg.sessionCount} × {pkg.engagementType.replace(/_/g, ' ')}
                      {commitmentOf(pkg) && <span> · {commitmentOf(pkg)} each</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-lg">
                    <div className="text-right">
                      <p className="text-heading font-semibold tabular-nums">
                        <Money paise={pkg.amountPaise} currency={pkg.currency} />
                      </p>
                      <p className="text-caption text-ink-muted tabular-nums">
                        <Money paise={pkg.perSessionPaise} currency={pkg.currency} /> each
                      </p>
                    </div>
                    <form action={withdrawAction}>
                      <input type="hidden" name="packageId" value={pkg.id} />
                      <Withdraw />
                    </form>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-xxl">
        <h2 className="mb-lg text-heading font-semibold tracking-tight">Offer a package</h2>
        <Card>
          <form action={formAction}>
            {state.error && (
              <p role="alert" className="mb-lg rounded-md bg-correction-soft px-lg py-md text-small text-correction">
                {state.error}
              </p>
            )}
            {state.ok && (
              <p className="mb-lg rounded-md bg-good-soft px-lg py-md text-small text-good">Published.</p>
            )}

            <div className="mb-lg">
              <label htmlFor="pkg-title" className="mb-sm block text-small font-medium">
                What to call it
              </label>
              <input
                id="pkg-title"
                name="title"
                required
                placeholder="Five answer reviews"
                className="w-full min-h-[48px] rounded-md border border-rule bg-surface px-lg py-md text-body placeholder:text-ink-faint"
              />
              <p className="mt-sm text-caption text-ink-muted">
                In the seeker&rsquo;s words, not ours — this is what they see.
              </p>
            </div>

            <div className="grid gap-lg sm:grid-cols-2">
              <div className="mb-lg">
                <label htmlFor="pkg-type" className="mb-sm block text-small font-medium">
                  Kind of work
                </label>
                <select
                  id="pkg-type"
                  name="engagementType"
                  required
                  value={chosenType}
                  onChange={(e) => setChosenType(e.target.value)}
                  className="min-h-[48px] w-full rounded-md border border-rule bg-surface px-lg text-body capitalize"
                >
                  {engagementTypes.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-lg">
                <label htmlFor="pkg-skill" className="mb-sm block text-small font-medium">
                  Skill
                </label>
                <select
                  id="pkg-skill"
                  name="skillId"
                  className="min-h-[48px] w-full rounded-md border border-rule bg-surface px-lg text-body"
                >
                  <option value="">Any</option>
                  {skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-lg">
                <label htmlFor="pkg-sessions" className="mb-sm block text-small font-medium">
                  How many sessions
                </label>
                <input
                  id="pkg-sessions"
                  name="sessionCount"
                  type="number"
                  min={2}
                  required
                  value={sessions}
                  onChange={(e) => setSessions(Number(e.target.value))}
                  className="min-h-[48px] w-32 rounded-md border border-rule bg-surface px-lg py-md text-body tabular-nums"
                />
                <p className="mt-sm text-caption text-ink-muted">Two or more — one is just a service.</p>
              </div>

              <div className="mb-lg">
                <label htmlFor="pkg-commitment" className="mb-sm block text-small font-medium">
                  {isLive ? 'Length of each session' : 'Turnaround on each'}
                </label>
                <div className="flex items-center gap-md">
                  <input
                    id="pkg-commitment"
                    name="commitment"
                    type="number"
                    min={1}
                    required
                    defaultValue={isLive ? 60 : 72}
                    className="min-h-[48px] w-32 rounded-md border border-rule bg-surface px-lg py-md text-body tabular-nums"
                  />
                  <span className="text-small text-ink-muted">{isLive ? 'minutes' : 'hours'}</span>
                </div>
              </div>
            </div>

            <div className="mb-lg">
              <label htmlFor="pkg-price" className="mb-sm block text-small font-medium">
                Total price for the whole package
              </label>
              <div className="flex items-center gap-md">
                <span className="text-body text-ink-muted">₹</span>
                <input
                  id="pkg-price"
                  name="rupees"
                  inputMode="decimal"
                  required
                  value={rupees}
                  onChange={(e) => setRupees(e.target.value)}
                  placeholder="4000"
                  className="min-h-[48px] w-40 rounded-md border border-rule bg-surface px-lg py-md text-body tabular-nums placeholder:text-ink-faint"
                />
              </div>
              {/*
                  Shown, not asked for. Two price fields that have to agree
                  is one field too many — the total is what is charged and
                  this is arithmetic on it.
              */}
              {perSession !== null && (
                <p className="mt-sm text-small text-ink-muted tabular-nums">
                  That is ₹{(perSession / 100).toLocaleString('en-IN')} a session.
                </p>
              )}
            </div>

            <Publish />
          </form>
        </Card>
      </section>
    </>
  );
}

function commitmentOf(pkg: ProviderPackage): string | null {
  if (pkg.durationMinutes) return `${pkg.durationMinutes} minutes`;
  if (pkg.turnaroundHours) {
    const h = pkg.turnaroundHours;
    return h % 24 === 0 ? `back in ${h / 24} ${h === 24 ? 'day' : 'days'}` : `back in ${h} hours`;
  }
  return null;
}

function Publish(): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[48px] items-center rounded-pill bg-accent px-xl text-bodyStrong font-medium text-accent-ink transition-opacity hover:opacity-85 disabled:opacity-40"
    >
      {pending ? 'Publishing…' : 'Offer this package'}
    </button>
  );
}

function Withdraw(): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[44px] items-center rounded-pill border border-rule px-lg text-small font-medium text-correction transition-colors hover:bg-correction-soft disabled:opacity-40"
    >
      {pending ? 'Withdrawing…' : 'Withdraw'}
    </button>
  );
}
