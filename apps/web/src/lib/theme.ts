import { cssVariables } from './generated-tokens';
import { ResolvedDomain } from './pack';

/**
 * Turns a pack's theme tokens into inline CSS custom properties.
 *
 * CLAUDE.md #7: theme tokens are scoped to the family, and the exam
 * family's ruled-paper aesthetic is not the platform's identity. So
 * nothing in `src/components` names a colour — they use `bg-paper`,
 * `text-ink`, `border-rule`, which resolve to whatever is set here.
 *
 * The base is the PLATFORM's neutral palette, imported from the same
 * generated tokens apps/mobile uses so the two products cannot drift.
 *
 * A family may override only its ACCENT and its CORRECTION colour. It
 * may not repaint the ground: a white page is the product's, and a
 * family that could set `--color-paper` could quietly undo the whole
 * design on one of nineteen domains. That restriction is the web half of
 * the rule `applyPack()` enforces on mobile.
 */
const FAMILY_OVERRIDABLE = new Set(['--color-accent', '--color-correction']);

export function themeStyle(domain?: ResolvedDomain | null): React.CSSProperties {
  const tokens: Record<string, string> = { ...cssVariables };
  for (const [k, v] of Object.entries(domain?.theme.tokens ?? {})) {
    if (FAMILY_OVERRIDABLE.has(k)) tokens[k] = v;
  }
  return tokens as unknown as React.CSSProperties;
}

/** Families can declare a signature element; the exam family's is ruled paper. */
export function signature(domain?: ResolvedDomain | null): string {
  return domain?.theme.signature ?? 'plain';
}
