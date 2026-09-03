'use client';

import { useFormState, useFormStatus } from 'react-dom';
import {
  addAvailabilityExceptionAction,
  addAvailabilityRuleAction,
  removeAvailabilityExceptionAction,
  removeAvailabilityRuleAction,
  setBookingPolicyAction,
} from '@/app/actions/availability';
import { Card } from '@/components/ui';

export interface AvailabilityRule {
  id: string;
  timezone: string;
  rrule: string;
  startMinute: number;
  endMinute: number;
}

export interface AvailabilityException {
  id: string;
  onDate: string;
  startMinute: number | null;
  endMinute: number | null;
  reason: string | null;
}

export interface BookingPolicy {
  minNoticeMinutes: number;
  bufferMinutes: number;
  maxAdvanceDays: number;
  slotMinutes: number;
}

const DAY_LABELS: Array<[string, string]> = [
  ['MO', 'Mon'],
  ['TU', 'Tue'],
  ['WE', 'Wed'],
  ['TH', 'Thu'],
  ['FR', 'Fri'],
  ['SA', 'Sat'],
  ['SU', 'Sun'],
];

/** 570 → "09:30". Minutes from midnight, local to the rule's own timezone. */
function fromMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function daysOf(rrule: string): string {
  const byday = /BYDAY=([A-Z,]+)/.exec(rrule)?.[1] ?? '';
  const set = new Set(byday.split(','));
  const named = DAY_LABELS.filter(([code]) => set.has(code)).map(([, label]) => label);
  if (named.length === 7) return 'Every day';
  if (named.length === 5 && !set.has('SA') && !set.has('SU')) return 'Weekdays';
  return named.join(', ');
}

/**
 * When a mentor can be booked.
 *
 * The whole slot engine — RRULE parsing, DST-correct expansion, buffers,
 * notice periods — has existed and been tested since the booking
 * milestone, running in Postgres so that timezone questions are answered
 * by the tz database rather than by arithmetic. What did not exist was any
 * way for a provider to say a single thing about when they are free, so
 * every one of them had an empty calendar and could not be booked at all.
 *
 * Weekly windows and blocked dates are kept apart, matching the API: a
 * holiday must not edit away the pattern it interrupts, or a provider
 * comes back from a week off no longer bookable.
 */
export function AvailabilityForms({
  rules,
  exceptions,
  policy,
}: {
  rules: AvailabilityRule[];
  exceptions: AvailabilityException[];
  policy: BookingPolicy;
}): JSX.Element {
  return (
    <>
      <WeeklyWindows rules={rules} />
      <BlockedDates exceptions={exceptions} />
      <PolicyForm policy={policy} />
    </>
  );
}

function WeeklyWindows({ rules }: { rules: AvailabilityRule[] }): JSX.Element {
  const [state, formAction] = useFormState(addAvailabilityRuleAction, {});
  const [, removeAction] = useFormState(removeAvailabilityRuleAction, {});

  return (
    <section className="mb-xxl">
      <h2 className="mb-lg text-heading font-semibold tracking-tight">When you are free, most weeks</h2>

      {rules.length > 0 ? (
        <ul className="mb-lg grid gap-md">
          {rules.map((rule) => (
            <li key={rule.id}>
              <Card tone="outline" className="flex flex-wrap items-center justify-between gap-md">
                <div>
                  <p className="text-bodyStrong font-medium">{daysOf(rule.rrule)}</p>
                  <p className="mt-xs text-small text-ink-muted tabular-nums">
                    {fromMinutes(rule.startMinute)} – {fromMinutes(rule.endMinute)}
                    <span className="ml-md">{rule.timezone}</span>
                  </p>
                </div>
                <form action={removeAction}>
                  <input type="hidden" name="ruleId" value={rule.id} />
                  <RemoveButton>Remove</RemoveButton>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card tone="outline" className="mb-lg border-dashed">
          <p className="text-body text-ink-muted">
            You have no hours set, so nobody can book you. Add one window below — you can add more, and
            block individual dates separately.
          </p>
        </Card>
      )}

      <Card>
        <form action={formAction}>
          {state.error && (
            <p role="alert" className="mb-lg rounded-md bg-correction-soft px-lg py-md text-small text-correction">
              {state.error}
            </p>
          )}

          <fieldset className="mb-lg">
            <legend className="mb-sm text-small font-medium">Days</legend>
            <div className="flex flex-wrap gap-sm">
              {DAY_LABELS.map(([code, label]) => (
                <label
                  key={code}
                  className="inline-flex min-h-[44px] cursor-pointer items-center gap-sm rounded-pill border border-rule px-lg text-small transition-colors hover:bg-surface-sunk has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-accent-ink"
                >
                  <input type="checkbox" name="day" value={code} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-lg sm:grid-cols-3">
            <TimeField name="startTime" label="From" defaultValue="09:00" />
            <TimeField name="endTime" label="To" defaultValue="17:00" />
            <div className="mb-lg">
              <label htmlFor="timezone" className="mb-sm block text-small font-medium">
                Your timezone
              </label>
              <input
                id="timezone"
                name="timezone"
                defaultValue="Asia/Kolkata"
                className="w-full min-h-[48px] rounded-md border border-rule bg-surface px-lg py-md text-body"
              />
              {/*
                Stored with the rule, not converted away. "18:00" has to
                stay 18:00 across a DST change, and it only can if the zone
                travels with it.
              */}
              <p className="mt-sm text-caption text-ink-muted">
                Times are yours. Seekers see them converted to their own.
              </p>
            </div>
          </div>

          <Submit>Add these hours</Submit>
        </form>
      </Card>
    </section>
  );
}

function BlockedDates({ exceptions }: { exceptions: AvailabilityException[] }): JSX.Element {
  const [state, formAction] = useFormState(addAvailabilityExceptionAction, {});
  const [, removeAction] = useFormState(removeAvailabilityExceptionAction, {});

  return (
    <section className="mb-xxl">
      <h2 className="mb-sm text-heading font-semibold tracking-tight">Dates you are not available</h2>
      <p className="mb-lg max-w-prose text-small text-ink-muted">
        These cut through the hours above without changing them. Past dates drop off on their own.
      </p>

      {exceptions.length > 0 && (
        <ul className="mb-lg grid gap-md">
          {exceptions.map((exception) => (
            <li key={exception.id}>
              <Card tone="outline" className="flex flex-wrap items-center justify-between gap-md">
                <div>
                  <p className="text-bodyStrong font-medium tabular-nums">
                    {new Date(`${exception.onDate}T00:00:00`).toLocaleDateString('en-IN', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                  <p className="mt-xs text-small text-ink-muted">
                    {exception.startMinute === null
                      ? 'All day'
                      : `${fromMinutes(exception.startMinute)} – ${fromMinutes(exception.endMinute ?? 0)}`}
                    {exception.reason && <span className="ml-md">{exception.reason}</span>}
                  </p>
                </div>
                <form action={removeAction}>
                  <input type="hidden" name="exceptionId" value={exception.id} />
                  <RemoveButton>Unblock</RemoveButton>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <form action={formAction}>
          {state.error && (
            <p role="alert" className="mb-lg rounded-md bg-correction-soft px-lg py-md text-small text-correction">
              {state.error}
            </p>
          )}
          <div className="grid gap-lg sm:grid-cols-2">
            <div className="mb-lg">
              <label htmlFor="onDate" className="mb-sm block text-small font-medium">
                Date
              </label>
              <input
                id="onDate"
                name="onDate"
                type="date"
                required
                className="w-full min-h-[48px] rounded-md border border-rule bg-surface px-lg py-md text-body"
              />
            </div>
            <div />
            <TimeField name="startTime" label="From (leave blank for the whole day)" required={false} />
            <TimeField name="endTime" label="To" required={false} />
          </div>
          <div className="mb-lg">
            <label htmlFor="reason" className="mb-sm block text-small font-medium">
              Reason (only you see this)
            </label>
            <input
              id="reason"
              name="reason"
              placeholder="Optional"
              className="w-full min-h-[48px] rounded-md border border-rule bg-surface px-lg py-md text-body placeholder:text-ink-faint"
            />
          </div>
          <Submit>Block this date</Submit>
        </form>
      </Card>
    </section>
  );
}

function PolicyForm({ policy }: { policy: BookingPolicy }): JSX.Element {
  const [state, formAction] = useFormState(setBookingPolicyAction, {});
  return (
    <section className="mb-xxl">
      <h2 className="mb-lg text-heading font-semibold tracking-tight">Booking rules</h2>
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
            <NumberField
              name="minNoticeHours"
              label="Least notice you need"
              suffix="hours"
              defaultValue={Math.round(policy.minNoticeMinutes / 60)}
              hint="Nobody can book a slot closer than this."
            />
            <NumberField
              name="slotMinutes"
              label="Length of one session"
              suffix="minutes"
              defaultValue={policy.slotMinutes}
            />
            <NumberField
              name="bufferMinutes"
              label="Gap between sessions"
              suffix="minutes"
              defaultValue={policy.bufferMinutes}
              hint="Time to write up one before the next starts."
            />
            <NumberField
              name="maxAdvanceDays"
              label="How far ahead people may book"
              suffix="days"
              defaultValue={policy.maxAdvanceDays}
            />
          </div>
          <Submit>Save these rules</Submit>
        </form>
      </Card>
    </section>
  );
}

function TimeField({
  name,
  label,
  defaultValue,
  required = true,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
}): JSX.Element {
  const id = `av-${name}-${label.replace(/\W/g, '')}`;
  return (
    <div className="mb-lg">
      <label htmlFor={id} className="mb-sm block text-small font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="time"
        required={required}
        defaultValue={defaultValue}
        className="w-full min-h-[48px] rounded-md border border-rule bg-surface px-lg py-md text-body tabular-nums"
      />
    </div>
  );
}

function NumberField({
  name,
  label,
  suffix,
  defaultValue,
  hint,
}: {
  name: string;
  label: string;
  suffix: string;
  defaultValue: number;
  hint?: string;
}): JSX.Element {
  const id = `pol-${name}`;
  return (
    <div className="mb-lg">
      <label htmlFor={id} className="mb-sm block text-small font-medium">
        {label}
      </label>
      <div className="flex items-center gap-md">
        <input
          id={id}
          name={name}
          type="number"
          min={0}
          required
          defaultValue={defaultValue}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="min-h-[48px] w-28 rounded-md border border-rule bg-surface px-lg py-md text-body tabular-nums"
        />
        <span className="text-small text-ink-muted">{suffix}</span>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-sm text-caption text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

function Submit({ children }: { children: string }): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[48px] items-center rounded-pill bg-accent px-xl text-bodyStrong font-medium text-accent-ink transition-opacity hover:opacity-85 disabled:opacity-40"
    >
      {pending ? 'Saving…' : children}
    </button>
  );
}

function RemoveButton({ children }: { children: string }): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      // Destructive is reachable, not inviting: outlined with red text,
      // never a filled red button.
      className="inline-flex min-h-[44px] items-center rounded-pill border border-rule px-lg text-small font-medium text-correction transition-colors hover:bg-correction-soft disabled:opacity-40"
    >
      {pending ? 'Removing…' : children}
    </button>
  );
}
