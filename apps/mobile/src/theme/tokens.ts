/**
 * The design system.
 *
 * The colours are the exam family's own pack tokens (apps/api/seed/family.ts
 * → theme.tokens) — the warm paper, the fountain-pen ink, the examiner's
 * red. Nothing here was invented for the sake of a look.
 *
 * What IS new is everything around them: a type scale, a spacing scale,
 * elevation, and touch targets sized for a thumb rather than a mouse.
 * The web app inherited none of that, which is most of why it read as an
 * admin tool rather than a product.
 *
 * `applyPack()` swaps the palette at runtime from a resolved domain, so a
 * different family still re-skins the app with no code change (#7).
 */

export interface Palette {
  paper: string;
  surface: string;
  surfaceSunk: string;
  ink: string;
  inkMuted: string;
  inkFaint: string;
  correction: string;
  correctionSoft: string;
  rule: string;
  accent: string;
  accentSoft: string;
  accentInk: string;
  /** Semantic, deliberately separate from the accent. */
  good: string;
  goodSoft: string;
  warn: string;
  warnSoft: string;
}

export const LIGHT: Palette = {
  paper: '#fdfcf7',
  surface: '#ffffff',
  surfaceSunk: '#f4f2ea',
  ink: '#1a1a2e',
  inkMuted: '#5b6472',
  inkFaint: '#8d95a1',
  correction: '#c1121f',
  correctionSoft: '#fbeaea',
  rule: '#e6e2d6',
  accent: '#2f5d8c',
  accentSoft: '#e7eef6',
  accentInk: '#ffffff',
  good: '#1d6b47',
  goodSoft: '#dcefe4',
  warn: '#8a5a00',
  warnSoft: '#f8eed4',
};

/** Type scale. One place, so nothing drifts. */
export const type = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '700' as const, letterSpacing: -0.4 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.2 },
  heading: { fontSize: 17, lineHeight: 23, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' as const },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  smallStrong: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const },
  caption: { fontSize: 11, lineHeight: 15, fontWeight: '600' as const, letterSpacing: 0.5 },
};

/** 4pt grid. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

/**
 * Minimum interactive size. 48dp is Android's guidance, and this app's
 * users are on mid-range Android — often one-handed, often outdoors.
 */
export const TOUCH = 48;

export const shadow = {
  card: {
    shadowColor: '#1a1a2e',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#1a1a2e',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
};

/**
 * Overlays a family's published tokens onto the base palette.
 * A family that supplies only some keeps the rest.
 */
export function applyPack(tokens: Record<string, string> | undefined): Palette {
  if (!tokens) return LIGHT;
  return {
    ...LIGHT,
    paper: tokens['--color-paper'] ?? LIGHT.paper,
    ink: tokens['--color-ink'] ?? LIGHT.ink,
    inkMuted: tokens['--color-ink-muted'] ?? LIGHT.inkMuted,
    correction: tokens['--color-ink-correction'] ?? LIGHT.correction,
    rule: tokens['--color-rule-line'] ?? LIGHT.rule,
    accent: tokens['--color-accent'] ?? LIGHT.accent,
  };
}
