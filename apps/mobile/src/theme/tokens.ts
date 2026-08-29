/**
 * The design system.
 *
 * Rewritten to a clean, near-white, typographic aesthetic: white ground,
 * flat grey card fills instead of borders and shadows, one very large
 * tightly-tracked display size, and a lot of air. The previous palette
 * was the exam family's warm "ruled paper and red ink"; it read as dated
 * and busy on a phone, so the base is now neutral and the family supplies
 * only an accent (see `applyPack`). That is also the more correct shape
 * architecturally — a neutral core with a family skin, not a core wearing
 * one family's costume (CLAUDE.md #7).
 *
 * Type is Inter. Because Inter has no Devanagari coverage and this app
 * ships Hindi, Noto Sans Devanagari is loaded alongside it and selected
 * per string by `fontFor()` — a missing-glyph fallback is not something
 * to leave to chance on a screen a Hindi speaker reads first.
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
  paper: '#ffffff',
  surface: '#ffffff',
  surfaceSunk: '#f4f4f5',
  ink: '#09090b',
  inkMuted: '#71717a',
  inkFaint: '#a1a1aa',
  correction: '#dc2626',
  correctionSoft: '#fef2f2',
  rule: '#e4e4e7',
  // The primary action is black on white. High contrast, no hue to clash
  // with a family's own colour, and it is what makes the page read as
  // composed rather than decorated.
  accent: '#09090b',
  accentSoft: '#f4f4f5',
  accentInk: '#ffffff',
  good: '#15803d',
  goodSoft: '#f0fdf4',
  warn: '#a16207',
  warnSoft: '#fefce8',
};

/**
 * Font families.
 *
 * React Native has no CSS-style font stacks: `fontFamily` takes exactly
 * one name, and `fontWeight` is ignored for a custom family. So each
 * weight is its own family name, and weight is chosen by picking one.
 */
export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  // Devanagari equivalents, same weights.
  devaRegular: 'NotoSansDevanagari_400Regular',
  devaMedium: 'NotoSansDevanagari_500Medium',
  devaSemibold: 'NotoSansDevanagari_600SemiBold',
} as const;

const DEVANAGARI = /[ऀ-ॿ]/;

/**
 * Picks the family that can actually draw this string.
 *
 * Latin-only text gets Inter. Anything containing Devanagari gets Noto,
 * which also renders Latin acceptably — so a mixed string stays in one
 * face rather than switching mid-sentence.
 */
export function fontFor(text: unknown, weight: 'regular' | 'medium' | 'semibold' = 'regular'): string {
  const deva = typeof text === 'string' && DEVANAGARI.test(text);
  if (weight === 'semibold') return deva ? font.devaSemibold : font.semibold;
  if (weight === 'medium') return deva ? font.devaMedium : font.medium;
  return deva ? font.devaRegular : font.regular;
}

/** Which weight a type style is asking for, so `fontFor` can match it. */
export type Weight = 'regular' | 'medium' | 'semibold';

const WEIGHT: Record<Weight, string> = {
  regular: font.regular,
  medium: font.medium,
  semibold: font.semibold,
};

/**
 * Type scale.
 *
 * `display` is deliberately large and tightly tracked — the single
 * gesture that most separates a designed page from a form. Negative
 * letter-spacing grows with size, which is how a grotesque is meant to
 * be set.
 *
 * Each entry is a complete, valid `TextStyle` carrying the Latin family,
 * so spreading one into a bare `<Text>` is correct on its own. Text that
 * may contain Devanagari should go through the kit's components instead,
 * which swap in the bundled Noto face via `fontFor`; a bare `<Text>`
 * falls back to whatever Devanagari face the platform supplies, which
 * renders correctly but not identically.
 */
export const type = {
  display: { fontSize: 38, lineHeight: 43, letterSpacing: -1.3, fontFamily: WEIGHT.semibold },
  title: { fontSize: 27, lineHeight: 33, letterSpacing: -0.7, fontFamily: WEIGHT.semibold },
  heading: { fontSize: 19, lineHeight: 26, letterSpacing: -0.3, fontFamily: WEIGHT.semibold },
  body: { fontSize: 16, lineHeight: 25, letterSpacing: -0.1, fontFamily: WEIGHT.regular },
  bodyStrong: { fontSize: 16, lineHeight: 25, letterSpacing: -0.1, fontFamily: WEIGHT.medium },
  small: { fontSize: 14, lineHeight: 21, letterSpacing: 0, fontFamily: WEIGHT.regular },
  smallStrong: { fontSize: 14, lineHeight: 21, letterSpacing: 0, fontFamily: WEIGHT.medium },
  caption: { fontSize: 12, lineHeight: 17, letterSpacing: 0, fontFamily: WEIGHT.medium },
} as const;

/** The weight each scale step asks for, for script-aware family selection. */
export const scaleWeight: Record<keyof typeof type, Weight> = {
  display: 'semibold',
  title: 'semibold',
  heading: 'semibold',
  body: 'regular',
  bodyStrong: 'medium',
  small: 'regular',
  smallStrong: 'medium',
  caption: 'medium',
};

/** 4pt grid, with more air at the top end than before. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 40, xxxl: 64 };

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

/**
 * Minimum interactive size. 48dp is Android's guidance, and this app's
 * users are on mid-range Android — often one-handed, often outdoors.
 */
export const TOUCH = 48;

/**
 * Elevation is almost absent by design. Surfaces separate by fill and
 * whitespace; a drop shadow under every card is what made the old build
 * look like a dashboard. `raised` survives for genuinely floating things
 * (sheets, menus) and nothing else.
 */
export const shadow = {
  raised: {
    shadowColor: '#09090b',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
};

/**
 * Overlays a family's published tokens onto the base palette.
 *
 * Only the accent and the semantic correction colour are taken. The
 * ground stays white whatever the family says: a family may colour its
 * own signature, not repaint the product.
 */
export function applyPack(tokens: Record<string, string> | undefined): Palette {
  if (!tokens) return LIGHT;
  return {
    ...LIGHT,
    accent: tokens['--color-accent'] ?? LIGHT.accent,
    correction: tokens['--color-ink-correction'] ?? LIGHT.correction,
  };
}
