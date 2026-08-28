import type { Config } from 'tailwindcss';

/**
 * Tailwind is configured to read COLOURS FROM CSS CUSTOM PROPERTIES, not
 * to hardcode them. CLAUDE.md #7: theme tokens are scoped to the family,
 * and the exam family's ruled-paper aesthetic is not the platform's
 * identity. The values behind these variables come from the domain
 * pack at runtime (see src/lib/theme.ts) — swapping family swaps the
 * look with no rebuild.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--color-ink)',
        'ink-muted': 'var(--color-ink-muted)',
        correction: 'var(--color-ink-correction)',
        paper: 'var(--color-paper)',
        'paper-raised': 'var(--color-paper-raised)',
        rule: 'var(--color-rule-line)',
        accent: 'var(--color-accent)',
      },
      fontFamily: {
        answer: 'var(--font-answer)',
      },
      borderRadius: { card: 'var(--radius-card)' },
    },
  },
  plugins: [],
} satisfies Config;
