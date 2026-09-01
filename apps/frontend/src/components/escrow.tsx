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

const STAGES: Array<{ code: EscrowStage; label: string; meaning: string }> = [
  { code: 'posted', label: 'Posted', meaning: 'Nothing is held yet.' },
  { code: 'awarded', label: 'Held', meaning: 'Money is with the payment aggregator, out of both parties’ reach.' },
  { code: 'in_progress', label: 'In progress', meaning: 'Work is under way. The hold stands.' },
  { code: 'review', label: 'Your review', meaning: 'Delivered. You have the review window to confirm or dispute.' },
  { code: 'released', label: 'Released', meaning: 'Paid out to the provider.' },
];

export function EscrowRail({
  escrow,
  audience = 'seeker',
}: {
  escrow: EscrowState;
  audience?: 'seeker' | 'provider' | 'admin';
}): JSX.Element {
  const index = STAGES.findIndex((s) => s.code === escrow.stage);
  const current = STAGES[index];

  return (
    <div className="rounded-lg border border-line bg-surface p-5 shadow-e1">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow>Where the money is</Eyebrow>
          <p className="figure mt-1 text-title font-semibold">{money(escrow.held)}</p>
          <p className="mt-1 flex items-center gap-1.5 text-small text-ink-muted">
            <span className="text-verified"><GlyphLock /></span>
            {escrow.stage === 'released'
              ? `Released ${dateLong(escrow.releasedOn)}`
              : escrow.releasesOn
                ? `Releases ${dateLong(escrow.releasesOn)} unless you act`
                : 'Held until the goals are confirmed'}
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
          style={{ width: `${(Math.max(0, index) / (STAGES.length - 1)) * 80}%` }}
        />
        {STAGES.map((stage, i) => {
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
export function EscrowLine({ escrow }: { escrow: EscrowState }): JSX.Element {
  const index = STAGES.findIndex((s) => s.code === escrow.stage);
  return (
    <span className="inline-flex items-center gap-2 text-small">
      <span aria-hidden="true" className="flex gap-0.5">
        {STAGES.map((s, i) => (
          <span
            key={s.code}
            className={`h-1.5 w-4 rounded-pill ${i <= index ? 'bg-brand' : 'bg-line'}`}
          />
        ))}
      </span>
      <span className="figure font-medium">{money(escrow.held)}</span>
      <span className="text-ink-muted">{STAGES[index]?.label.toLowerCase()}</span>
    </span>
  );
}
