import type { Config } from 'tailwindcss';
import { radius, space, typeScale } from './src/lib/generated-tokens';

/**
 * Tailwind reads COLOURS FROM CSS CUSTOM PROPERTIES, not hardcoded
 * values: the variables are set at runtime from the resolved domain, so
 * swapping family swaps the look with no rebuild (CLAUDE.md #7).
 *
 * The non-colour scales — type, spacing, radii — come straight from
 * packages/design/tokens.json via the generated file, which is the same
 * source apps/mobile uses. A font size can therefore only be changed in
 * one place, and `dev.sh test` fails if the generated copies drift.
 *
 * ── The one web-only addition: a fluid curve ──────────────────────────
 *
 * The shared scale is sized for a phone, because React Native has no
 * media queries and the mobile app is where it was designed. Rendering
 * those same numbers at 1440px is why the web app read as a phone layout
 * stretched wide: a 38px hero on a desktop monitor is a paragraph, not a
 * headline.
 *
 * So the big three sizes are `clamp()`ed — COMPUTED FROM the token, not
 * a second set of numbers. The token remains the floor (what a 360px
 * phone gets, identical to apps/mobile) and `GROWTH` says how far each
 * may travel by 1440px. Editing tokens.json still moves both apps; this
 * only decides how the web one breathes on a big screen.
 *
 * Tracking is converted to `em` so it stays proportional as the size
 * grows — a -1.3px letter-spacing that was right at 38px is invisible at
 * 76px. Line height becomes a unitless ratio for the same reason.
 */
const px = (n: number): string => `${n}px`;

/** How much each size may grow between a 360px phone and a 1440px desktop. */
const GROWTH: Record<string, { max: number; leading: number }> = {
  display: { max: 2.0, leading: 1.04 },
  title:   { max: 1.6, leading: 1.12 },
  heading: { max: 1.25, leading: 1.3 },
};

function sizeFor(name: string, v: (typeof typeScale)[keyof typeof typeScale]) {
  const tracking = `${(v.letterSpacing / v.fontSize).toFixed(4)}em`;
  const growth = GROWTH[name];
  if (!growth) {
    return [px(v.fontSize), { lineHeight: px(v.lineHeight), letterSpacing: tracking }] as const;
  }
  const min = v.fontSize;
  const max = Math.round(v.fontSize * growth.max);
  // Solved so the value equals `min` at 360px and `max` at 1440px.
  const slope = ((max - min) / (1440 - 360)) * 100;
  const intercept = min - (slope * 360) / 100;
  return [
    `clamp(${px(min)}, ${intercept.toFixed(2)}px + ${slope.toFixed(3)}vw, ${px(max)})`,
    { lineHeight: String(growth.leading), letterSpacing: tracking },
  ] as const;
}

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--color-ink)',
        'ink-muted': 'var(--color-ink-muted)',
        'ink-faint': 'var(--color-ink-faint)',
        correction: 'var(--color-correction)',
        'correction-soft': 'var(--color-correction-soft)',
        paper: 'var(--color-paper)',
        surface: 'var(--color-surface)',
        'surface-sunk': 'var(--color-surface-sunk)',
        rule: 'var(--color-rule)',
        accent: 'var(--color-accent)',
        'accent-ink': 'var(--color-accent-ink)',
        good: 'var(--color-good)',
        'good-soft': 'var(--color-good-soft)',
        warn: 'var(--color-warn)',
        'warn-soft': 'var(--color-warn-soft)',
      },
      fontSize: Object.fromEntries(
        Object.entries(typeScale).map(([k, v]) => [k, sizeFor(k, v)]),
      ) as Record<string, [string, { lineHeight: string; letterSpacing: string }]>,
      spacing: Object.fromEntries(Object.entries(space).map(([k, v]) => [k, px(v)])),
      borderRadius: {
        ...Object.fromEntries(Object.entries(radius).map(([k, v]) => [k, px(v)])),
        card: px(radius.lg),
      },
      maxWidth: {
        prose: '68ch',
      },
    },
  },
  plugins: [],
} satisfies Config;
