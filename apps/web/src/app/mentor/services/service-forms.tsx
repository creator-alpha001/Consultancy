'use client';

import { useState } from 'react';

import { useFormState, useFormStatus } from 'react-dom';
import { removeServiceAction, setServiceAction } from '@/app/actions/services';
import { Card, Money } from '@/components/ui';

export interface ProviderService {
  id: string;
  engagementType: string;
  skillId: string | null;
  skillCode: string | null;
  skillLabels: Record<string, string> | null;
  currency: string;
  amountPaise: string;
  /** Contact time. Live work only. */
  durationMinutes: number | null;
  /** Time until it comes back. Async work only. */
  turnaroundHours: number | null;
}

function typeLabel(code: string): string {
  return code.replace(/_/g, ' ');
}

/**
 * Setting a rate.
 *
 * Two levels, because both questions are real: "what do I charge for a
 * document review", and "…but an essay takes me longer than a polity
 * answer". A rate with no skill is the default for that kind of work; one
 * naming a skill overrides it there only.
 *
 * There is no comparison to other providers anywhere on this screen. A
 * "you charge more than 70% of mentors" line would be the first step to
 * competing on price, which is the thing hard rule #15 exists to prevent.
 */
export function ServiceForms({
  rates,
  engagementTypes,
  skills,
  language,
}: {
  rates: ProviderService[];
  engagementTypes: string[];
  skills: Array<{ id: string; label: string }>;
  language: string;
}): JSX.Element {
  const [state, formAction] = useFormState(setServiceAction, {});
  const [, removeAction] = useFormState(removeServiceAction, {});
  const [chosenType, setChosenType] = useState(engagementTypes[0] ?? 'document_review');
  const isLive = chosenType === 'live_session';

  const defaults = rates.filter((r) => r.skillId === null);
  const perSkill = rates.filter((r) => r.skillId !== null);

  return (
    <>
      <section className="mb-xxl">
        <h2 className="mb-lg text-heading font-semibold tracking-tight">What you offer</h2>

        {rates.length === 0 ? (
          <Card tone="outline" className="border-dashed">
            <p className="text-body text-ink-muted">
              You have not published anything, so nobody can book you. A service is a kind of work, a
              price, and how long it takes.
            </p>
          </Card>
        ) : (
          <div className="grid gap-lg">
            {[
              ['For any skill', defaults] as const,
              ['For a particular skill', perSkill] as const,
            ]
              .filter(([, list]) => list.length > 0)
              .map(([heading, list]) => (
                <div key={heading}>
                  <h3 className="mb-md text-caption font-medium uppercase tracking-[0.12em] text-ink-muted">
                    {heading}
                  </h3>
                  <ul className="grid gap-md">
                    {list.map((rate) => (
                      <li key={rate.id}>
                        <Card tone="outline" className="flex flex-wrap items-center justify-between gap-md">
                          <div className="min-w-0">
                            <p className="text-bodyStrong font-medium capitalize">
                              {typeLabel(rate.engagementType)}
                            </p>
                            {commitmentOf(rate) && (
                              <p className="mt-xs text-small text-ink-muted">{commitmentOf(rate)}</p>
                            )}
                            {rate.skillLabels && (
                              <p className="mt-xs text-small text-ink-muted">
                                {rate.skillLabels[language] ?? rate.skillLabels.en ?? rate.skillCode}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-lg">
                            <span className="text-heading font-semibold tabular-nums">
                              <Money paise={rate.amountPaise} currency={rate.currency} />
                            </span>
                            <form action={removeAction}>
                              <input type="hidden" name="rateId" value={rate.id} />
                              <Remove />
                            </form>
                          </div>
                        </Card>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </section>

      <section className="mb-xxl">
        <h2 className="mb-lg text-heading font-semibold tracking-tight">Publish a service</h2>
        <Card>
          <form action={formAction}>
            {state.error && (
              <p role="alert" className="mb-lg rounded-md bg-correction-soft px-lg py-md text-small text-correction">
                {state.error}
              </p>
            )}
            {state.ok && (
              <p className="mb-lg rounded-md bg-good-soft px-lg py-md text-small text-good">Saved.</p>
            )}

            <div className="grid gap-lg sm:grid-cols-2">
              <div className="mb-lg">
                <label htmlFor="engagementType" className="mb-sm block text-small font-medium">
                  Kind of work
                </label>
                <select
                  id="engagementType"
                  name="engagementType"
                  required
                  value={chosenType}
                  onChange={(e) => setChosenType(e.target.value)}
                  className="min-h-[48px] w-full rounded-md border border-rule bg-surface px-lg text-body capitalize"
                >
                  {engagementTypes.map((type) => (
                    <option key={type} value={type}>
                      {typeLabel(type)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-lg">
                <label htmlFor="skillId" className="mb-sm block text-small font-medium">
                  Skill
                </label>
                <select
                  id="skillId"
                  name="skillId"
                  className="min-h-[48px] w-full rounded-md border border-rule bg-surface px-lg text-body"
                >
                  {/* The empty value is a real choice, not a blank. */}
                  <option value="">Any — my usual rate for this</option>
                  {skills.map((skill) => (
                    <option key={skill.id} value={skill.id}>
                      {skill.label}
                    </option>
                  ))}
                </select>
                <p className="mt-sm text-caption text-ink-muted">
                  Only skills you are verified on. A rate here beats your usual one.
                </p>
              </div>
            </div>

            <div className="mb-lg">
              <label htmlFor="rupees" className="mb-sm block text-small font-medium">
                Amount
              </label>
              <div className="flex items-center gap-md">
                <span className="text-body text-ink-muted">₹</span>
                <input
                  id="rupees"
                  name="rupees"
                  inputMode="decimal"
                  required
                  placeholder="800"
                  className="min-h-[48px] w-40 rounded-md border border-rule bg-surface px-lg py-md text-body tabular-nums placeholder:text-ink-faint"
                />
              </div>
              <p className="mt-sm text-caption text-ink-muted">
                What the seeker pays. The platform fee comes out of this — you see the split on every
                engagement.
              </p>
            </div>

            {/*
                A price with no stated commitment is half a listing: the
                seeker is told what it costs and not what they get. The
                unit follows the kind of work — contact time for a live
                session, time-until-returned for everything else.
            */}
            <div className="mb-lg">
              <label htmlFor="commitment" className="mb-sm block text-small font-medium">
                {isLive ? 'How long is the session?' : 'How long until you return it?'}
              </label>
              <div className="flex items-center gap-md">
                <input
                  id="commitment"
                  name="commitment"
                  type="number"
                  min={1}
                  required
                  defaultValue={isLive ? 60 : 72}
                  className="min-h-[48px] w-32 rounded-md border border-rule bg-surface px-lg py-md text-body tabular-nums"
                />
                <span className="text-small text-ink-muted">{isLive ? 'minutes' : 'hours'}</span>
              </div>
              <p className="mt-sm text-caption text-ink-muted">
                {isLive
                  ? 'Shown on your profile, and it is what the seeker is buying.'
                  : 'A deadline you are promising. Shown before anyone books.'}
              </p>
            </div>

            <Submit />
          </form>
        </Card>
      </section>
    </>
  );
}

function Submit(): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[48px] items-center rounded-pill bg-accent px-xl text-bodyStrong font-medium text-accent-ink transition-opacity hover:opacity-85 disabled:opacity-40"
    >
      {pending ? 'Saving…' : 'Publish this service'}
    </button>
  );
}

function Remove(): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[44px] items-center rounded-pill border border-rule px-lg text-small font-medium text-correction transition-colors hover:bg-correction-soft disabled:opacity-40"
    >
      {pending ? 'Removing…' : 'Remove'}
    </button>
  );
}

/** What the seeker actually gets for the money, in the right unit. */
function commitmentOf(service: ProviderService): string | null {
  if (service.durationMinutes) return `${service.durationMinutes} minutes`;
  if (service.turnaroundHours) {
    const h = service.turnaroundHours;
    return h % 24 === 0 ? `Back within ${h / 24} ${h === 24 ? 'day' : 'days'}` : `Back within ${h} hours`;
  }
  return null;
}
