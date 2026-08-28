import { ResolvedDomain } from './pack';

/**
 * Turns a pack's theme tokens into inline CSS custom properties.
 *
 * CLAUDE.md #7 and SPEC-PLATFORM.md §15's Wave 4 hook: "The ruled-paper,
 * red-ink aesthetic is the *exam family's* theme. If it is baked into
 * components, this wave requires a UI rewrite." So nothing in
 * `src/components` names a colour — they use `bg-paper`, `text-ink`,
 * `border-rule`, and those resolve to whatever the family published.
 *
 * The defaults below are the PLATFORM's neutral base, deliberately not
 * the exam family's: a family that supplies no tokens gets a plain,
 * unbranded surface rather than someone else's identity.
 */
const PLATFORM_BASE_TOKENS: Record<string, string> = {
  '--color-ink': '#1f2933',
  '--color-ink-muted': '#5c6b7a',
  '--color-ink-correction': '#b42318',
  '--color-paper': '#ffffff',
  '--color-paper-raised': '#f7f8fa',
  '--color-rule-line': '#dfe3e8',
  '--color-accent': '#2f5d8c',
  '--font-answer': 'ui-serif, Georgia, serif',
  '--radius-card': '10px',
};

export function themeStyle(domain?: ResolvedDomain | null): React.CSSProperties {
  const tokens = { ...PLATFORM_BASE_TOKENS, ...(domain?.theme.tokens ?? {}) };
  // A family may supply only some tokens; the rest stay platform-neutral.
  return tokens as unknown as React.CSSProperties;
}

/** Families can declare a signature element; the exam family's is ruled paper. */
export function signature(domain?: ResolvedDomain | null): string {
  return domain?.theme.signature ?? 'plain';
}
