// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RubricBars, ProgressSmallMultiples, RatingDistribution } from './charts';
import type { AssessmentDimension, ProgressPoint } from '@/lib/types';
import { SCORE_MAX } from '@/lib/types';

/**
 * The charts, which are where the duty-of-care rules either hold or do
 * not.
 *
 * Everything asserted here is a product rule wearing a visual form: the
 * dimensions come from the template and are never assumed (#3), the
 * comparison is always to the same person's earlier work and never to
 * anyone else's (#17), and every number a bar carries is also reachable
 * as text (the accessibility bar in the definition of done).
 */

function dim(over: Partial<AssessmentDimension> = {}): AssessmentDimension {
  return { code: 'structure', labelKey: 'Structure', ...over };
}

afterEach(cleanup);

describe('RubricBars — the dimensions are the template’s', () => {
  /*
   * CLAUDE.md #3. Never assume six, never assume any particular set,
   * and never assume a template exists at all. The component is handed
   * dimensions and renders exactly those.
   */
  it.each([1, 2, 3, 7])('renders exactly the %i dimensions it was given', (n) => {
    const dims = Array.from({ length: n }, (_, i) => dim({ code: `d${i}`, labelKey: `Dimension ${i}` }));
    const { container } = render(<RubricBars dimensions={dims} scores={{}} />);
    expect(container.querySelectorAll('li')).toHaveLength(n);
  });

  it('draws nothing at all where a category has no template', () => {
    // An objective-exam category has none. An empty rubric is the right
    // answer; an invented default one would be a fabricated assessment.
    const { container } = render(<RubricBars dimensions={[]} scores={{}} />);
    expect(container.querySelectorAll('li')).toHaveLength(0);
  });

  /*
   * One scale, because the platform has exactly one: `score numeric
   * CHECK (score BETWEEN 0 AND 100)`. The dimension type used to carry
   * `min`/`max`/`step` that no API ever sent, and the delivery screen
   * drew half-point sliders on a 0–10 range the database would have
   * rejected.
   */
  it('marks every dimension against the platform’s one scale', () => {
    const { container } = render(<RubricBars dimensions={[dim()]} scores={{ structure: 68 }} />);
    expect(container.textContent).toContain(`/ ${SCORE_MAX}`);
    expect(container.textContent).toContain('68');
  });

  it('draws full marks as a full bar', () => {
    const { container } = render(
      <RubricBars dimensions={[dim()]} scores={{ structure: SCORE_MAX }} />,
    );
    expect(container.querySelector('[style*="width"]')?.getAttribute('style')).toContain('100%');
  });

  it('shows an em dash for an unscored dimension rather than zero', () => {
    // A missing score is not a score of nought, and the difference is
    // somebody's work being called worthless.
    const { container } = render(<RubricBars dimensions={[dim()]} scores={{}} />);
    expect(container.textContent).toContain('—');
    expect(container.textContent).not.toMatch(/0/);
  });

  /*
   * CLAUDE.md #17. `previous` is documented as the same person's
   * earlier scores and nothing else. The delta is therefore always
   * self-referential — there is no parameter through which another
   * person's score could arrive.
   */
  it('compares only against the same person’s previous score', () => {
    const { container } = render(
      <RubricBars dimensions={[dim()]} scores={{ structure: 70 }} previous={{ structure: 55 }} />,
    );
    expect(container.textContent).toContain('+15');
    const text = (container.textContent ?? '').toLowerCase();
    for (const word of ['average', 'others', 'peers', 'percentile', 'rank', 'cohort']) {
      expect(text).not.toContain(word);
    }
  });

  it('says nothing about change when there is no earlier work', () => {
    const { container } = render(<RubricBars dimensions={[dim()]} scores={{ structure: 70 }} />);
    expect(container.textContent).not.toContain('+');
  });

  it('reports a fall plainly, without dramatising it', () => {
    // Shown in the muted ink, not the danger red: a lower score on one
    // piece of work is information, not an alarm.
    const { container } = render(
      <RubricBars dimensions={[dim()]} scores={{ structure: 50 }} previous={{ structure: 70 }} />,
    );
    expect(container.textContent).toContain('-20');
    expect(container.querySelector('.text-danger')).toBeNull();
  });

  it('carries every value as text, not only as a bar', () => {
    const { container } = render(<RubricBars dimensions={[dim()]} scores={{ structure: 75 }} />);
    expect(container.textContent).toContain('75');
  });
});

describe('ProgressSmallMultiples — one series per plot', () => {
  const points: ProgressPoint[] = [
    { at: '2026-06-01', dimension: 'structure', score: 50 },
    { at: '2026-07-01', dimension: 'structure', score: 65 },
    { at: '2026-06-01', dimension: 'content', score: 40 },
    { at: '2026-07-01', dimension: 'content', score: 45 },
  ];

  /*
   * The form is the argument. One chart with two coloured lines invites
   * "structure beats content", which is not a claim the data makes —
   * two dimensions are not on a common scale of goodness. Separate
   * plots make that misreading hard, and remove the legend and the
   * categorical palette along with it.
   */
  it('gives each dimension its own plot rather than a shared axis', () => {
    const { container } = render(
      <ProgressSmallMultiples points={points} dimensionLabels={{ structure: 'Structure', content: 'Content' }} />,
    );
    expect(container.querySelectorAll('figure')).toHaveLength(2);
    expect(container.querySelectorAll('svg')).toHaveLength(2);
    // One line per plot. Two paths in one svg would be the shared axis.
    for (const svg of container.querySelectorAll('svg')) {
      expect(svg.querySelectorAll('path')).toHaveLength(1);
    }
  });

  it('names each plot in words, so identity is never carried by colour', () => {
    render(
      <ProgressSmallMultiples points={points} dimensionLabels={{ structure: 'Structure', content: 'Content' }} />,
    );
    expect(screen.getByText('Structure')).toBeTruthy();
    expect(screen.getByText('Content')).toBeTruthy();
  });

  it('falls back to the dimension code rather than an unlabelled plot', () => {
    const { container } = render(<ProgressSmallMultiples points={points} dimensionLabels={{}} />);
    expect(container.textContent).toContain('structure');
  });

  /*
   * A fixed 0–10 domain, not one fitted to the data. An auto-fitted
   * axis turns a 0.5 drift into a cliff — on a screen someone reads
   * about their own progress, after months of it.
   */
  it('keeps a fixed scale, so a small drift does not read as a cliff', () => {
    const flat: ProgressPoint[] = [
      { at: '2026-06-01', dimension: 'structure', score: 50 },
      { at: '2026-07-01', dimension: 'structure', score: 55 },
    ];
    const { container } = render(<ProgressSmallMultiples points={flat} dimensionLabels={{}} />);
    const d = container.querySelector('path')?.getAttribute('d') ?? '';
    const ys = [...d.matchAll(/,(\d+\.\d)/g)].map((m) => Number(m[1]));
    // Five points out of a hundred, on a 72px plot: a few pixels, not
    // the full height it would be on a fitted axis.
    expect(Math.abs((ys[0] ?? 0) - (ys[1] ?? 0))).toBeLessThan(6);
  });

  /*
   * The domain is the platform's, not a guess. It was hardcoded to
   * 0–10 while scores are stored 0–100, so every real mark plotted
   * above the top of the plot and every line sat flat on the ceiling.
   */
  it('plots a real score inside the chart, not above it', () => {
    const high: ProgressPoint[] = [
      { at: '2026-06-01', dimension: 'structure', score: 20 },
      { at: '2026-07-01', dimension: 'structure', score: 95 },
    ];
    const { container } = render(<ProgressSmallMultiples points={high} dimensionLabels={{}} />);
    const d = container.querySelector('path')?.getAttribute('d') ?? '';
    const ys = [...d.matchAll(/,(-?\d+\.\d)/g)].map((m) => Number(m[1]));
    // Inside the 72px viewBox, and the two marks clearly apart.
    expect(ys.every((y) => y >= 0 && y <= 72)).toBe(true);
    expect(Math.abs((ys[0] ?? 0) - (ys[1] ?? 0))).toBeGreaterThan(20);
  });

  it('describes the trend in the chart’s accessible name', () => {
    render(<ProgressSmallMultiples points={points} dimensionLabels={{ structure: 'Structure' }} />);
    const name = screen.getAllByRole('img')[0]?.getAttribute('aria-label') ?? '';
    expect(name).toContain('Structure');
    expect(name).toContain('your own work');
  });

  it('reaches every number without the chart, in a table', () => {
    // A chart is never the only way to the values: no tooltips, which
    // are unreachable by touch and by keyboard anyway.
    const { container } = render(
      <ProgressSmallMultiples points={points} dimensionLabels={{ structure: 'Structure' }} />,
    );
    expect(container.querySelectorAll('table').length).toBeGreaterThan(0);
    expect(container.querySelector('table')?.textContent).toContain('50');
    expect(container.querySelectorAll('svg title')).toHaveLength(0);
  });

  it('draws nothing rather than an empty frame when there is no work yet', () => {
    const { container } = render(<ProgressSmallMultiples points={[]} dimensionLabels={{}} />);
    expect(container.querySelectorAll('figure')).toHaveLength(0);
  });
});

describe('RatingDistribution', () => {
  /*
   * The shape, not the average. Forty fours and a single one read very
   * differently from a cloud of threes and fives, and the mean hides
   * exactly that.
   */
  it('shows all five bands, highest first', () => {
    const { container } = render(<RatingDistribution distribution={[1, 0, 2, 12, 30]} />);
    const rows = [...container.querySelectorAll('li')].map((li) => li.textContent ?? '');
    expect(rows).toHaveLength(5);
    expect(rows[0]).toContain('5');
    expect(rows[0]).toContain('30');
    expect(rows[4]).toContain('1');
  });

  it('shows a band with no reviews as zero rather than hiding it', () => {
    // The gap is the information. Dropping empty bands would flatter.
    const { container } = render(<RatingDistribution distribution={[0, 0, 0, 0, 4]} />);
    expect(container.querySelectorAll('li')).toHaveLength(5);
  });

  it('does not divide by zero when nobody has reviewed yet', () => {
    const { container } = render(<RatingDistribution distribution={[0, 0, 0, 0, 0]} />);
    expect(container.innerHTML).not.toContain('NaN');
  });
});
