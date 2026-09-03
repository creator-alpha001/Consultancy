'use client';

import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { useMemo, useState } from 'react';
import { ActionState, bookMentorAction } from '@/app/actions/engagement';
import { Button, Card, ErrorNote } from '@/components/ui';

interface Slot {
  startIso: string;
  endIso: string;
  label: string;
  day: string;
}

/**
 * Turns the provider's real free slots into something displayable.
 *
 * These come from the availability engine — their own rules, exceptions,
 * buffers and notice period, minus anything already booked — so a time
 * offered here is a time the server will accept. This used to be a grid
 * the browser invented, which meant a seeker could pick 7am on a day the
 * mentor never offered and only find out at submit.
 */
function toSlots(raw: Array<{ start: string; end: string }>): Slot[] {
  return raw.map((s) => {
    const start = new Date(s.start);
    return {
      startIso: s.start,
      endIso: s.end,
      label: new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(start),
      day: new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).format(start),
    };
  });
}

interface Rate {
  engagementType: string;
  skillId: string | null;
  amountPaise: string;
  durationMinutes: number | null;
  turnaroundHours: number | null;
}

export function BookingForm({
  providerId,
  providerName,
  domainCode,
  categoryId,
  categoryLabel,
  language,
  languages,
  engagementTypes,
  priceBands,
  availableSlots,
  rates,
  currency = 'INR',
}: {
  providerId: string;
  providerName: string;
  domainCode: string;
  categoryId: string;
  categoryLabel: string;
  language: string;
  languages: string[];
  engagementTypes: string[];
  priceBands: Record<string, [number, number]>;
  /** The provider's real free slots, resolved on the server. */
  availableSlots: Array<{ start: string; end: string }>;
  /**
   * What this provider says they charge. Used to prefill and to show the
   * seeker whose number they are looking at — never to compare providers.
   */
  rates: Rate[];
  currency?: string;
}): JSX.Element {
  const [state, formAction] = useFormState<ActionState, FormData>(bookMentorAction, {});
  /**
   * Only what this provider actually sells.
   *
   * The picker used to offer every engagement type the DOMAIN allows,
   * whether or not this provider had said they do it — so a seeker could
   * book a live session from someone who has never offered one, at a
   * price nobody set. A provider is bookable for what they have
   * published, and for nothing else.
   */
  const bookableTypes = engagementTypes.filter((t) => rateFor(rates, t) !== null);
  const [engagementType, setEngagementType] = useState(bookableTypes[0] ?? '');
  const [selected, setSelected] = useState<Slot | null>(null);
  /**
   * The provider's own rate wins over the domain's typical band.
   *
   * The band was the only starting point there was, which meant every
   * booking opened at the bottom of what other people charge — a default
   * that quietly argues the provider down before they have seen the
   * request. Their stated rate is the honest starting number; the band
   * stays visible as context.
   */
  const needsSlot = engagementType === 'live_session';
  const slots = useMemo(() => toSlots(availableSlots), [availableSlots]);
  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const list = map.get(s.day) ?? [];
      list.push(s);
      map.set(s.day, list);
    }
    return [...map.entries()];
  }, [slots]);

  const statedRateRow = rateFor(rates, engagementType);
  const statedRate = statedRateRow?.amountPaise ?? null;
  const statedCommitment = statedRateRow ?? null;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

  if (bookableTypes.length === 0) {
    return (
      <Card>
        <p className="text-body">
          {providerName} has not published any services for this {categoryLabel} yet, so there is
          nothing to book.
        </p>
        <p className="mt-md text-small text-ink-muted">
          You can still describe what you need on the board and let people come to you.
        </p>
        <Link
          href="/board/new"
          className="mt-lg inline-flex min-h-[44px] items-center rounded-pill border border-rule px-xl text-small font-medium transition-colors hover:bg-surface-sunk"
        >
          Post on the board
        </Link>
      </Card>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="providerId" value={providerId} />
      <input type="hidden" name="domainCode" value={domainCode} />
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="timezone" value={timezone} />
      {needsSlot && selected && (
        <>
          <input type="hidden" name="scheduledStart" value={selected.startIso} />
          <input type="hidden" name="scheduledEnd" value={selected.endIso} />
        </>
      )}

      <ErrorNote code={state.error?.code} message={state.error?.message} />

      {/* ── 1. How you want to work ────────────────────────────── */}
      <Card className="mb-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">How should this happen?</legend>
          <div className="flex flex-wrap gap-2">
            {bookableTypes.map((t) => (
              <label
                key={t}
                className={`cursor-pointer rounded-card border px-3 py-2 text-sm ${
                  engagementType === t ? 'border-accent bg-paper text-accent' : 'border-rule bg-paper'
                }`}
              >
                <input
                  type="radio"
                  name="engagementType"
                  value={t}
                  checked={engagementType === t}
                  // Nothing to recompute: the price follows the chosen
                  // service, which is read straight from the provider's
                  // published rate for it.
                  onChange={() => setEngagementType(t)}
                  className="sr-only"
                />
                {t.replace(/_/g, ' ')}
              </label>
            ))}
          </div>
        </fieldset>
      </Card>

      {/* ── 2. When (live sessions only) ───────────────────────── */}
      {needsSlot && (
        <Card className="mb-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            {/*
              No duration picker any more: the slot length is the
              mentor's, set in their booking policy. A seeker choosing 90
              minutes against a 60-minute grid was choosing something the
              server would refuse.
            */}
            <span className="text-sm font-medium">Pick a time</span>
          </div>

          <div className="max-h-72 overflow-y-auto pr-1">
            {byDay.map(([day, daySlots]) => (
              <div key={day} className="mb-3">
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-muted">{day}</p>
                <div className="flex flex-wrap gap-2">
                  {daySlots.map((s) => {
                    const isOn = selected?.startIso === s.startIso;
                    return (
                      <button
                        key={s.startIso}
                        type="button"
                        onClick={() => setSelected(isOn ? null : s)}
                        aria-pressed={isOn}
                        className={`rounded-card border px-3 py-1.5 text-sm tabular-nums ${
                          isOn ? 'border-accent bg-accent text-white' : 'border-rule bg-paper hover:bg-surface-sunk'
                        }`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-2 text-xs text-ink-muted">
            Times shown in <span className="tabular-nums">{timezone}</span>.
          </p>
          {/*
            The recurring-availability engine (exceptions, buffers, notice
            periods) is specified but not built, so no calendar has been
            consulted here. The user-facing line says only what the user
            needs to act on — that these are proposals — rather than
            explaining our build state to them.
          */}
          <p className="mt-md text-small text-ink-muted">
            {slots.length > 0
              ? `Times ${providerName} is free. They still have to accept the work itself.`
              : `${providerName} has nothing free in the next fortnight.`}
          </p>
        </Card>
      )}

      {/* ── 3. Language and price ──────────────────────────────── */}
      <Card className="mb-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="language" className="mb-1 block text-sm font-medium">
              Language you will work in
            </label>
            <select
              id="language"
              name="language"
              defaultValue={language}
              className="w-full rounded-card border border-rule bg-paper px-3 py-2 text-sm"
            >
              {languages.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink-muted">
              A matching requirement, not a preference — this must intersect {providerName}&rsquo;s working
              languages.
            </p>
          </div>

          {/*
              A price, not an offer.

              This was an editable "Your offer" box: the seeker typed a
              number and that became the amount. That is a reverse-market
              interaction (SPEC-PLATFORM §5.3) placed on a direct-booking
              screen, and it made price a thing to haggle over. It is not.
              The provider publishes a service at a price for a stated
              length of work; the seeker buys it. What the two of them
              negotiate is the AGENDA — the goals, what is out of scope —
              and that happens on the next screen.

              A provider may still reduce what they charge, but only once
              the work has actually started. That is a decision made with
              knowledge of the work, not a price to be argued down before
              it begins.
          */}
          <div>
            <p className="mb-1 block text-sm font-medium">Price</p>
            <p className="text-lg font-semibold tabular-nums">
              ₹{Math.round(Number(statedRate) / 100).toLocaleString('en-IN')}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              {commitmentLine(statedCommitment, engagementType)}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Set by {providerName}. It goes into escrow and is released when the goals you agree are
              met.
            </p>
            <input type="hidden" name="amountPaise" value={statedRate ?? ''} />
          </div>
        </div>
      </Card>

      {/* ── 4. What happens next ───────────────────────────────── */}
      <Card className="mb-4">
        <p className="text-sm font-medium">What happens after this</p>
        <ol className="mt-2 grid gap-1.5 text-sm text-ink-muted">
          <li>1. You and {providerName} write the agenda together — goals, and what is out of scope.</li>
          <li>2. Both agree. The agenda locks and is hashed; you both hold the same copy.</li>
          <li>3. Your money goes into escrow. Only then does work start.</li>
          <li>4. You accept the work, or ask for a change. Money moves when you accept.</li>
        </ol>
        {/*
          The database refuses the transition to a working state without
          both a locked agenda and held escrow, so there is no "start now,
          pay later" path. The user is told the one fact that affects them.
        */}
        <p className="mt-md text-small text-ink-muted">Nothing is charged yet.</p>
      </Card>

      <SubmitButton disabled={needsSlot && !selected} needsSlot={needsSlot} />
    </form>
  );
}

function SubmitButton({ disabled, needsSlot }: { disabled: boolean; needsSlot: boolean }): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={disabled || pending}>
        {pending ? 'Setting up…' : 'Agree terms and draft the agenda'}
      </Button>
      {disabled && needsSlot && <span className="text-sm text-ink-muted">Pick a time first.</span>}
    </div>
  );
}

/**
 * The rate that applies to one kind of work.
 *
 * Mirrors the server's precedence — a rate naming a skill beats the
 * provider's default — but the booking form only knows the engagement
 * type, so it takes the default. The server re-resolves properly when the
 * engagement is created; this is a starting number, not an authority.
 */
function rateFor(rates: Rate[], engagementType: string): Rate | null {
  const forType = rates.filter((r) => r.engagementType === engagementType);
  if (forType.length === 0) return null;
  return forType.find((r) => r.skillId === null) ?? forType[0];
}

/**
 * What the seeker actually gets for the money.
 *
 * A price with no stated commitment is half a listing. The two units are
 * genuinely different promises — time WITH someone, versus time UNTIL it
 * comes back — so they are worded differently rather than both rendered
 * as "duration".
 */
function commitmentLine(rate: Rate | null, engagementType: string): string {
  if (rate?.durationMinutes) return `${rate.durationMinutes} minutes with them`;
  if (rate?.turnaroundHours) {
    const hours = rate.turnaroundHours;
    return hours % 24 === 0
      ? `Back within ${hours / 24} ${hours === 24 ? 'day' : 'days'}`
      : `Back within ${hours} hours`;
  }
  return engagementType === 'live_session'
    ? 'Session length is set when you pick a slot.'
    : 'They have not stated a turnaround for this.';
}
