/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Source: packages/design/tokens.json
 * Regenerate: node scripts/sync-tokens.mjs
 *
 * Editing this file directly will be overwritten, and `dev.sh test`
 * fails while it disagrees with the source.
 */

export const color = {
  paper: "#ffffff",
  surface: "#ffffff",
  surfaceSunk: "#f4f4f5",
  ink: "#09090b",
  inkMuted: "#71717a",
  inkFaint: "#a1a1aa",
  rule: "#e4e4e7",
  accent: "#09090b",
  accentSoft: "#f4f4f5",
  accentInk: "#ffffff",
  correction: "#dc2626",
  correctionSoft: "#fef2f2",
  good: "#15803d",
  goodSoft: "#f0fdf4",
  warn: "#a16207",
  warnSoft: "#fefce8"
} as const;

export const typeScale = {
  display: {
    fontSize: 38,
    lineHeight: 43,
    letterSpacing: -1.3,
    weight: "semibold"
  },
  title: {
    fontSize: 27,
    lineHeight: 33,
    letterSpacing: -0.7,
    weight: "semibold"
  },
  heading: {
    fontSize: 19,
    lineHeight: 26,
    letterSpacing: -0.3,
    weight: "semibold"
  },
  body: {
    fontSize: 16,
    lineHeight: 25,
    letterSpacing: -0.1,
    weight: "regular"
  },
  bodyStrong: {
    fontSize: 16,
    lineHeight: 25,
    letterSpacing: -0.1,
    weight: "medium"
  },
  small: {
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: 0,
    weight: "regular"
  },
  smallStrong: {
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: 0,
    weight: "medium"
  },
  caption: {
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0,
    weight: "medium"
  }
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 40,
  xxxl: 64
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999
} as const;

export const TOUCH = 48;

export const fontName = {
  latin: "Inter",
  devanagari: "Noto Sans Devanagari",
} as const;

export const weightValue = {
  regular: 400,
  medium: 500,
  semibold: 600
} as const;

/** The platform's base custom properties, before any family override. */
export const cssVariables: Record<string, string> = {
  "--color-paper": "#ffffff",
  "--color-surface": "#ffffff",
  "--color-surface-sunk": "#f4f4f5",
  "--color-ink": "#09090b",
  "--color-ink-muted": "#71717a",
  "--color-ink-faint": "#a1a1aa",
  "--color-rule": "#e4e4e7",
  "--color-accent": "#09090b",
  "--color-accent-soft": "#f4f4f5",
  "--color-accent-ink": "#ffffff",
  "--color-correction": "#dc2626",
  "--color-correction-soft": "#fef2f2",
  "--color-good": "#15803d",
  "--color-good-soft": "#f0fdf4",
  "--color-warn": "#a16207",
  "--color-warn-soft": "#fefce8",
  "--radius-sm": "10px",
  "--radius-md": "14px",
  "--radius-lg": "20px",
  "--radius-xl": "28px",
  "--radius-pill": "999px",
  "--space-xs": "4px",
  "--space-sm": "8px",
  "--space-md": "12px",
  "--space-lg": "16px",
  "--space-xl": "24px",
  "--space-xxl": "40px",
  "--space-xxxl": "64px"
};
