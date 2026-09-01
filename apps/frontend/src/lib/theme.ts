import type { CSSProperties } from 'react';
import type { FamilyPack } from './pack';

/**
 * A family's theme, as inline custom properties on the shell element.
 *
 * A family may colour its accent. It may not repaint the product: the
 * ground, the ink, the lines, the verification green and the danger red
 * are the platform's and are not in this object. That boundary is
 * CLAUDE.md #7 — the ruled-paper, red-ink aesthetic is one family's
 * signature, not the platform's identity, and the core does not get to
 * wear any family's costume.
 */
export function themeStyle(fam: FamilyPack): CSSProperties {
  return {
    '--brand': fam.theme.brand,
    '--brand-hover': fam.theme.brandHover,
    '--brand-soft': fam.theme.brandSoft,
    '--brand-soft-ink': fam.theme.brandSoftInk,
    '--brand-line': fam.theme.brandLine,
    '--e-focus': `0 0 0 3px ${fam.theme.brand}2e`,
  } as CSSProperties;
}
