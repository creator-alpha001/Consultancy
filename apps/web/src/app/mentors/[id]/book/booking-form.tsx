'use client';

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
  currency?: string;
}): JSX.Element {
  const [state, formAction] = useFormState<ActionState, FormData>(bookMentorAction, {});
  const [engagementType, setEngagementType] = useState(engagementTypes[0] ?? 'document_review');
  const [selected, setSelected] = useState<Slot | null>(null);
  const [amountRupees, setAmountRupees] = useState(() => {
    const band = priceBands[engagementTypes[0] ?? ''] ?? [8000, 25000];
    return Math.round(band[0] / 100);
  });

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

  const band = priceBands[engagementType];
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  const belowBand = band ? amountRupees * 100 < band[0] : false;

  return (
    <form action={formAction}>
      <input type="hidden" name="providerId" value={providerId} />
      <input type="hidden" name="domainCode" value={domainCode} />
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="timezone" value={timezone} />
      <input type="hidden" name="amountPaise" value={String(Math.round(amountRupees * 100))} />
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
            {engagementTypes.map((t) => (
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
                  onChange={() => {
                    setEngagementType(t);
                    const b = priceBands[t];
                    if (b) setAmountRupees(Math.round(b[0] / 100));
                  }}
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

          <div>
            <label htmlFor="amount" className="mb-1 block text-sm font-medium">
              Your offer
            </label>
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="text-ink-muted">₹</span>
              <input
                id="amount"
                type="number"
                min={1}
                step={1}
                value={amountRupees}
                onChange={(e) => setAmountRupees(Number(e.target.value))}
                className="w-full rounded-card border border-rule bg-paper px-3 py-2 text-sm tabular-nums"
              />
            </div>
            {band && (
              <p className="mt-1 text-xs text-ink-muted tabular-nums">
                Typical for this category: ₹{Math.round(band[0] / 100)} – ₹{Math.round(band[1] / 100)}
              </p>
            )}
            {belowBand && (
              <p className="mt-1 text-xs text-correction">
                Below the typical band. Allowed — but fewer mentors will take it.
              </p>
            )}
            <p className="mt-1 text-xs text-ink-muted tabular-nums">
              Stored as {Math.round(amountRupees * 100)} paise · {currency}
            </p>
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
