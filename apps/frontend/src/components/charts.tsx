import type { AssessmentDimension, ProgressPoint } from '@/lib/types';
import { SCORE_MIN, SCORE_MAX } from '@/lib/types';
import { dateShort } from '@/lib/format';
import { Eyebrow } from './ui';

/**
 * Charts.
 *
 * Two forms, and the choice of form is the important part.
 *
 * Progress is drawn as SMALL MULTIPLES — one single-series sparkline per
 * rubric dimension — rather than one chart with three coloured lines.
 * Three reasons, in order of weight:
 *
 *  1. It removes any implied comparison. A shared axis invites reading
 *     "structure beats content", which is not a claim the data makes.
 *     Progress compares a person only to their own earlier work
 *     (CLAUDE.md #17), and the form should make the wrong reading hard.
 *  2. A single series per plot needs no legend and no categorical
 *     palette, so identity is never carried by colour alone and there is
 *     no colourblind-separation problem to solve.
 *  3. It survives 360px. Three stacked lines with a legend do not.
 *
 * Every mark is thin, the grid is recessive, only the endpoints are
 * labelled, and every value is also present as text — a bar is never the
 * only carrier of its number.
 */

/* ------------------------------------------------------------------ */
/* Rubric bars — magnitude, one hue                                    */
/* ------------------------------------------------------------------ */

export function RubricBars({
  dimensions,
  scores,
  previous,
}: {
  dimensions: AssessmentDimension[];
  scores: Record<string, number>;
  /** The same person's previous scores, if any. Never anyone else's. */
  previous?: Record<string, number>;
}): JSX.Element {
  return (
    <ul className="space-y-4">
      {dimensions.map((d) => {
        const value = scores[d.code];
        const before = previous?.[d.code];
        /*
         * One scale for every dimension, because the platform has one:
         * `assessment_scores.score` is checked BETWEEN 0 AND 100 and
         * nothing declares a per-dimension range. This used to read a
         * `min`/`max` off the dimension that no API ever sent.
         */
        const pct = value === undefined ? 0 : ((value - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100;
        const beforePct =
          before === undefined ? null : ((before - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100;
        const delta = value !== undefined && before !== undefined ? value - before : null;
        return (
          <li key={d.code}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-small font-medium">{d.labelKey}</span>
              <span className="figure text-small">
                <span className="font-semibold">{value === undefined ? '—' : value}</span>
                <span className="text-ink-muted"> / {SCORE_MAX}</span>
                {delta !== null && delta !== 0 && (
                  <span className={`ml-2 ${delta > 0 ? 'text-verified' : 'text-ink-muted'}`}>
                    {delta > 0 ? '+' : ''}
                    {delta}
                  </span>
                )}
              </span>
            </div>

            <div className="relative mt-1.5 h-2 w-full rounded-pill bg-surface-sunk">
              {/* Where the same person was last time — a recessive tick, not a second bar. */}
              {beforePct !== null && (
                <span
                  aria-hidden="true"
                  className="absolute top-[-3px] h-[14px] w-0.5 rounded-pill bg-line-strong"
                  style={{ left: `${beforePct}%` }}
                />
              )}
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 rounded-pill bg-brand"
                style={{ width: `${pct}%` }}
              />
            </div>

          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Progress — small multiples, one series each                         */
/* ------------------------------------------------------------------ */

export function ProgressSmallMultiples({
  points,
  dimensionLabels,
}: {
  points: ProgressPoint[];
  dimensionLabels: Record<string, string>;
}): JSX.Element {
  const dims = Array.from(new Set(points.map((p) => p.dimension)));
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {dims.map((dim) => (
        <Sparkline
          key={dim}
          label={dimensionLabels[dim] ?? dim}
          points={points.filter((p) => p.dimension === dim)}
        />
      ))}
    </div>
  );
}

function Sparkline({ label, points }: { label: string; points: ProgressPoint[] }): JSX.Element {
  const W = 260;
  const H = 72;
  const PAD = 6;
  const sorted = [...points].sort((a, b) => a.at.localeCompare(b.at));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return <div />;

  /*
   * The platform's own fixed domain, not one fitted to the data: an
   * auto-fitted axis turns a small drift into a cliff, and this is a
   * screen someone reads about their own progress.
   *
   * It was hardcoded to 0–10 while scores are stored 0–100, so every
   * real mark plotted off the top of the chart and every line was flat
   * against the ceiling.
   */
  const lo = SCORE_MIN;
  const hi = SCORE_MAX;
  const x = (i: number) => PAD + (i / Math.max(1, sorted.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - lo) / (hi - lo)) * (H - PAD * 2);

  const path = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
  const delta = last.score - first.score;

  return (
    <figure className="rounded-lg border border-line bg-surface p-4 shadow-e1">
      <figcaption className="flex items-baseline justify-between gap-2">
        <Eyebrow>{label}</Eyebrow>
        <span className="figure text-small">
          <span className="font-semibold">{last.score}</span>
          {delta !== 0 && (
            <span className={delta > 0 ? 'ml-1.5 text-verified' : 'ml-1.5 text-ink-muted'}>
              {delta > 0 ? '+' : ''}
              {delta}
            </span>
          )}
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full"
        role="img"
        aria-label={`${label}: ${first.score} on ${dateShort(first.at)} to ${last.score} on ${dateShort(
          last.at,
        )} out of ${SCORE_MAX}, across ${sorted.length} pieces of your own work.`}
      >
        {/* Recessive reference lines at the quartiles. No axis furniture. */}
        {[0.25, 0.5, 0.75].map((f) => hi * f).map((v) => (
          <line
            key={v}
            x1={PAD}
            x2={W - PAD}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--line)"
            strokeWidth="1"
            strokeDasharray="2 4"
          />
        ))}
        <path d={path} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/*
          No <title> tooltips on the points. React hoists <title> out of
          the tree, which broke hydration on this page — and a tooltip is
          the wrong place for these numbers anyway, because a tooltip is
          unreachable by touch and by keyboard. The accessible name on
          the svg carries the trend, and the table below carries every
          value; both work everywhere a tooltip does not.
        */}
        {sorted.map((p, i) => (
          <circle key={p.at} cx={x(i)} cy={y(p.score)} r={i === sorted.length - 1 ? 4 : 2.5} fill="var(--brand)" />
        ))}
      </svg>

      <p className="mt-1 text-caption text-ink-muted">
        {dateShort(first.at)} — {dateShort(last.at)} · {sorted.length} pieces of your work
      </p>

      {/* The table view. A chart is never the only way to reach the numbers. */}
      <details className="mt-2">
        <summary className="cursor-pointer text-caption text-ink-muted hover:text-ink">Show the numbers</summary>
        <table className="mt-2 w-full text-caption">
          <thead className="sr-only">
            <tr>
              <th>Date</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.at} className="border-t border-line">
                <td className="py-1 text-ink-muted">{dateShort(p.at)}</td>
                <td className="figure py-1 text-right font-medium">{p.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/**
 * A rating distribution. Shown instead of a bare average, because an
 * average hides the shape — forty fours and one one read very
 * differently from a cloud of threes and fives.
 */
export function RatingDistribution({ distribution }: { distribution: number[] }): JSX.Element {
  const total = distribution.reduce((a, b) => a + b, 0) || 1;
  return (
    <ul className="space-y-1.5">
      {[5, 4, 3, 2, 1].map((star) => {
        const count = distribution[star - 1] ?? 0;
        const pct = (count / total) * 100;
        return (
          <li key={star} className="flex items-center gap-3 text-caption">
            <span className="figure w-3 text-ink-muted">{star}</span>
            <span className="h-1.5 flex-1 rounded-pill bg-surface-sunk">
              <span
                aria-hidden="true"
                className="block h-full rounded-pill bg-brand"
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="figure w-8 text-right text-ink-muted">{count}</span>
          </li>
        );
      })}
    </ul>
  );
}
