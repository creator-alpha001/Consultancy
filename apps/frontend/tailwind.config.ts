import type { Config } from 'tailwindcss';

/**
 * Tailwind is configured to name *roles*, never colours. There is no
 * `indigo-600` in this app and no hex value in any component — every
 * utility resolves to a custom property from src/styles/globals.css, so
 * a family pack that overrides `--brand` at runtime restyles every
 * button, chip and chart in the product without a rebuild.
 *
 * If you find yourself reaching for a Tailwind default palette class,
 * the token layer is missing a role. Add the role.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    // Replaced, not extended: the default palette is removed on purpose.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      canvas: 'var(--canvas)',
      surface: 'var(--surface)',
      'surface-sunk': 'var(--surface-sunk)',
      'surface-raised': 'var(--surface-raised)',
      ink: 'var(--ink)',
      'ink-muted': 'var(--ink-muted)',
      'ink-faint': 'var(--ink-faint)',
      'ink-inverse': 'var(--ink-inverse)',
      line: 'var(--line)',
      'line-strong': 'var(--line-strong)',
      brand: 'var(--brand)',
      'brand-hover': 'var(--brand-hover)',
      'brand-ink': 'var(--brand-ink)',
      'brand-soft': 'var(--brand-soft)',
      'brand-soft-ink': 'var(--brand-soft-ink)',
      'brand-line': 'var(--brand-line)',
      verified: 'var(--verified)',
      'verified-soft': 'var(--verified-soft)',
      'verified-line': 'var(--verified-line)',
      caution: 'var(--caution)',
      'caution-soft': 'var(--caution-soft)',
      'caution-line': 'var(--caution-line)',
      danger: 'var(--danger)',
      'danger-soft': 'var(--danger-soft)',
      'danger-line': 'var(--danger-line)',
      info: 'var(--info)',
      'info-soft': 'var(--info-soft)',
      'info-line': 'var(--info-line)',
    },
    borderRadius: {
      none: '0',
      xs: 'var(--r-xs)',
      sm: 'var(--r-sm)',
      md: 'var(--r-md)',
      lg: 'var(--r-lg)',
      xl: 'var(--r-xl)',
      pill: 'var(--r-pill)',
      full: '9999px',
    },
    boxShadow: {
      none: 'none',
      e1: 'var(--e-1)',
      e2: 'var(--e-2)',
      e3: 'var(--e-3)',
      focus: 'var(--e-focus)',
    },
    extend: {
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'Noto Sans Devanagari', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // A 15px body. Small enough to be dense, large enough to read on
        // a mid-range Android at arm's length.
        micro: ['11px', { lineHeight: '15px', letterSpacing: '0.06em' }],
        caption: ['12px', { lineHeight: '17px', letterSpacing: '0' }],
        small: ['13px', { lineHeight: '19px', letterSpacing: '0' }],
        body: ['15px', { lineHeight: '24px', letterSpacing: '-0.005em' }],
        lead: ['17px', { lineHeight: '27px', letterSpacing: '-0.01em' }],
        heading: ['20px', { lineHeight: '27px', letterSpacing: '-0.018em' }],
        title: ['26px', { lineHeight: '33px', letterSpacing: '-0.024em' }],
        display: ['34px', { lineHeight: '40px', letterSpacing: '-0.03em' }],
        hero: ['44px', { lineHeight: '50px', letterSpacing: '-0.034em' }],
      },
      maxWidth: { shell: '1180px', reading: '68ch' },
      // The 48px touch target is a hard floor, not a suggestion.
      minHeight: { touch: '48px' },
      minWidth: { touch: '48px' },
    },
  },
  plugins: [],
};

export default config;
