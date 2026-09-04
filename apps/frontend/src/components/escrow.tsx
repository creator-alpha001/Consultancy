import type { EscrowState, EscrowStage } from '@/lib/types';
import { money, dateLong } from '@/lib/format';
import { Eyebrow, GlyphLock } from './ui';

/**
 * The escrow rail.
 *
 * One component, used unchanged on the seeker's task view, the
 * provider's delivery view and the admin's dispute view. That is not
 * code thrift — when both parties are looking at the same picture of
 * where the money is, most of the argument disappears before it starts.
 *
 * The rule it enforces visually: any screen where money is held, moving
 * or deducted shows the amount, the state, and the date it changes.
 * Never a bare "processing".
 */

type Audience = 'seeker' | 'provider' | 'admin';

interface Stop {
  code: EscrowStage;
  label: string;
  meaning: string;
}

const STAGES: Stop[] = [
  { code: 'posted', label: 'Posted', meaning: 'Nothing is held yet.' },
  { code: 'awarded', label: 'Held', meaning: 'Money is with the payment aggregator, out of both parties’ reach.' },
  { code: 'in_progress', label: 'In progress', meaning: 'Work is under way. The hold stands.' },
  { code: 'review', label: 'Your review', meaning: 'Delivered. You have the review window to confirm or dispute.' },
  { code: 'released', label: 'Released', meaning: 'Paid out to the provider.' },
];

/**
 * The last stop, which is the only one whose wording depends on how the
 * escrow actually closed.
 *
 * A refund and a payout both finish the escrow, so they share the final
 * position on the rail — but they are opposite events for the person
 * reading it, and the rail used to describe both as "paid out to the
 * provider". Whose money it is is not a detail worth getting wrong on
 * the one screen a dispute is argued from.
 */
function lastStop(escrow: EscrowState, audience: Audience): Stop {
  const them = audience === 'seeker' ? 'you' : 'the seeker';
  switch (escrow.outcome) {
    case 'refunded':
      return {
        code: 'released',
        label: 'Refunded',
        meaning: `Returned to ${them}. Nothing was paid out.`,
      };
    case 'split':
      return {
        code: 'released',
        label: 'Settled',
        meaning: `Split under a ruling: part paid out, the rest returned to ${them}.`,
      };
    default:
      return STAGES[STAGES.length - 1]!;
  }
}

/** The rail as this reader should see it. Pure, and tested as such. */
export function railFor(escrow: EscrowState, audience: Audience = 'seeker'): Stop[] {
  return [...STAGES.slice(0, -1), lastStop(escrow, audience)];
}

/**
 * The line under the amount: where the money is, and when that changes.
 * Never a bare "processing" — a date or an explicit condition, always.
 */
export function escrowLine(escrow: EscrowState, audience: Audience = 'seeker'): string {
  if (escrow.stage === 'released') {
    const word = railFor(escrow, audience)[STAGES.length - 1]!.label;
    return escrow.releasedOn ? `${word} ${dateLong(escrow.releasedOn)}` : word;
  }
  return escrow.releasesOn
    ? `Releases ${dateLong(escrow.releasesOn)} unless you act`
    : 'Held until the goals are confirmed';
}

export function EscrowRail({
  escrow,
  audience = 'seeker',
}: {
  escrow: EscrowState;
  audience?: Audience;
}): JSX.Element {
  const stages = railFor(escrow, audience);
  const index = stages.findIndex((s) => s.code === escrow.stage);
  const current = stages[index];

  return (
    <div className="rounded-lg border border-line bg-surface p-5 shadow-e1">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow>Where the money is</Eyebrow>
          <p className="figure mt-1 text-title font-semibold">{money(escrow.held)}</p>
          <p className="mt-1 flex items-center gap-1.5 text-small text-ink-muted">
            <span className="text-verified"><GlyphLock /></span>
            {escrowLine(escrow, audience)}
          </p>
        </div>

        {/*
          The provider sees the split, always. Opacity about the fee
          destroys trust faster than the fee itself does.
        */}
        {audience === 'provider' && escrow.providerNet && (
          <dl className="text-small">
            <div className="flex justify-between gap-6">
              <dt className="text-ink-muted">You receive</dt>
              <dd className="figure font-semibold">{money(escrow.providerNet)}</dd>
            </div>
            <div className="mt-1 flex justify-between gap-6">
              <dt className="text-ink-muted">Platform fee</dt>
              <dd className="figure text-ink-muted">−{money(escrow.platformFee)}</dd>
            </div>
          </dl>
        )}
      </div>

      {/*
        A five-column grid with one continuous rule behind the dots,
        rather than flex segments between them. The flex version looked
        right at 1280px and collapsed at 360px, where the labels are
        wider than the space between the dots and squeezed the
        connectors to nothing.
      */}
      <ol className="relative mt-5 grid grid-cols-5" aria-label="Escrow progress">
        <span
          aria-hidden="true"
          className="absolute left-[10%] right-[10%] top-[5px] h-0.5 rounded-pill bg-line"
        />
        <span
          aria-hidden="true"
          className="absolute left-[10%] top-[5px] h-0.5 rounded-pill bg-brand transition-all"
          style={{ width: `${(Math.max(0, index) / (stages.length - 1)) * 80}%` }}
        />
        {stages.map((stage, i) => {
          const done = i < index;
          const isCurrent = i === index;
          return (
            <li key={stage.code} className="relative flex flex-col items-center gap-1.5 text-center">
              <span
                aria-hidden="true"
                className={`h-3 w-3 flex-none rounded-full ring-2 ring-[color:var(--surface)] ${
                  done ? 'bg-brand' : isCurrent ? 'bg-brand escrow-pulse' : 'bg-line-strong'
                }`}
              />
              <span
                className={`px-0.5 text-caption leading-tight ${
                  isCurrent ? 'font-semibold text-ink' : done ? 'text-ink-muted' : 'text-ink-faint'
                }`}
              >
                {stage.label}
              </span>
            </li>
          );
        })}
      </ol>

      {current && (
        <p className="mt-4 border-t border-line pt-3 text-small text-ink-muted">
          <span className="font-medium text-ink">{current.label}.</span> {current.meaning}
        </p>
      )}
    </div>
  );
}

/** A one-line version for list rows, where the full rail would be noise. */
export function EscrowLine({
  escrow,
  audience = 'seeker',
}: {
  escrow: EscrowState;
  audience?: Audience;
}): JSX.Element {
  const stages = railFor(escrow, audience);
  const index = stages.findIndex((s) => s.code === escrow.stage);
  return (
    <span className="inline-flex items-center gap-2 text-small">
      <span aria-hidden="true" className="flex gap-0.5">
        {stages.map((s, i) => (
          <span
            key={s.code}
            className={`h-1.5 w-4 rounded-pill ${i <= index ? 'bg-brand' : 'bg-line'}`}
          />
        ))}
      </span>
      <span className="figure font-medium">{money(escrow.held)}</span>
      <span className="text-ink-muted">{stages[index]?.label.toLowerCase()}</span>
    </span>
  );
}
