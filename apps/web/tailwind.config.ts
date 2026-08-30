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
 */
const px = (n: number): string => `${n}px`;

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
        Object.entries(typeScale).map(([k, v]) => [
          k,
          [px(v.fontSize), { lineHeight: px(v.lineHeight), letterSpacing: `${v.letterSpacing}px` }],
        ]),
      ) as Record<string, [string, { lineHeight: string; letterSpacing: string }]>,
      spacing: Object.fromEntries(Object.entries(space).map(([k, v]) => [k, px(v)])),
      borderRadius: {
        ...Object.fromEntries(Object.entries(radius).map(([k, v]) => [k, px(v)])),
        card: px(radius.lg),
      },
    },
  },
  plugins: [],
} satisfies Config;
