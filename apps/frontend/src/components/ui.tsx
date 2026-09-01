import Link from 'next/link';
import type { ReactNode } from 'react';
import { initials } from '@/lib/format';

/**
 * The shared vocabulary of the interface.
 *
 * Nothing in this file names a colour. Everything resolves to a token
 * role, which is what lets a family pack repaint the product without a
 * component knowing (CLAUDE.md #7). Nothing in this file names a domain
 * either — no "aspirant", no "mentor", no "paper".
 *
 * The visual system, stated once so it is not re-derived per component:
 *
 *   Ground      a cool grey canvas; every surface is white and sits on it
 *   Separation  a 1px line plus a one-step shadow, never a heavy border
 *   Radius      16px on surfaces, 12px on controls, pill on chips
 *   Emphasis    weight and size before colour; colour is the last resort
 *   Colour      brand for action, verified-green ONLY for verification,
 *               amber for time running out, red for destructive and
 *               dispute — and red is never a filled button
 */

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  className = '',
  as: As = 'div',
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'li' | 'article' | 'section';
  interactive?: boolean;
}): JSX.Element {
  return (
    <As
      className={`rounded-lg border border-line bg-surface shadow-e1 ${
        interactive ? 'transition-shadow hover:shadow-e2' : ''
      } ${className}`}
    >
      {children}
    </As>
  );
}

/** A card with the standard internal padding already applied. */
export function Panel({
  title,
  action,
  note,
  children,
  className = '',
  tone = 'plain',
}: {
  title?: ReactNode;
  action?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: 'plain' | 'brand' | 'caution' | 'danger' | 'verified';
}): JSX.Element {
  const tones = {
    plain: 'border-line bg-surface',
    brand: 'border-brand-line bg-brand-soft',
    caution: 'border-caution-line bg-caution-soft',
    danger: 'border-danger-line bg-danger-soft',
    verified: 'border-verified-line bg-verified-soft',
  }[tone];
  return (
    <section className={`rounded-lg border shadow-e1 ${tones} ${className}`}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            {title && <h2 className="text-heading font-semibold">{title}</h2>}
            {note && <p className="mt-0.5 text-small text-ink-muted">{note}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

/** A page-level heading block. */
export function PageHead({
  eyebrow,
  title,
  sub,
  action,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
}): JSX.Element {
  return (
    <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-reading">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="mt-1 text-title font-semibold">{title}</h1>
        {sub && <p className="mt-2 text-body text-ink-muted">{sub}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </header>
  );
}

/**
 * The small uppercase label that sits above a heading or a figure.
 *
 * A <span> with `block`, not a <p>. It gets used inside <p>, <dt> and
 * <legend>, and a <p> nested in a <p> is invalid HTML — the browser
 * silently closes the outer one, the server-rendered tree and the client
 * tree stop matching, and hydration fails. A span is valid in all three.
 */
export function Eyebrow({ children }: { children: ReactNode }): JSX.Element {
  return (
    <span className="block text-micro font-semibold uppercase tracking-[0.09em] text-ink-muted">{children}</span>
  );
}

export function Divider({ className = '' }: { className?: string }): JSX.Element {
  return <hr className={`border-0 border-t border-line ${className}`} />;
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

type ButtonTone = 'primary' | 'secondary' | 'quiet' | 'destructive';

const BUTTON_TONES: Record<ButtonTone, string> = {
  primary: 'bg-brand text-brand-ink border border-transparent hover:bg-brand-hover shadow-e1',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-sunk',
  quiet: 'bg-transparent text-ink-muted border border-transparent hover:bg-surface-sunk hover:text-ink',
  /*
   * Destructive is reachable, not inviting: outlined, red text, never a
   * filled red button. Raising a dispute or rejecting a credential
   * should be present without being a nudge.
   */
  destructive: 'bg-surface text-danger border border-danger-line hover:bg-danger-soft',
};

const BUTTON_SIZES = {
  sm: 'h-9 px-3 text-small gap-1.5',
  md: 'h-11 px-4 text-body gap-2',
  lg: 'h-12 px-5 text-body gap-2',
} as const;

export function Button({
  children,
  tone = 'primary',
  size = 'md',
  full = false,
  className = '',
  ...rest
}: {
  children: ReactNode;
  tone?: ButtonTone;
  size?: keyof typeof BUTTON_SIZES;
  full?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        BUTTON_TONES[tone]
      } ${BUTTON_SIZES[size]} ${full ? 'w-full' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

/** The same thing as a link. Navigation and action look identical on purpose. */
export function ButtonLink({
  children,
  href,
  tone = 'primary',
  size = 'md',
  full = false,
  className = '',
}: {
  children: ReactNode;
  href: string;
  tone?: ButtonTone;
  size?: keyof typeof BUTTON_SIZES;
  full?: boolean;
  className?: string;
}): JSX.Element {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors ${
        BUTTON_TONES[tone]
      } ${BUTTON_SIZES[size]} ${full ? 'w-full' : ''} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Field({
  label,
  name,
  hint,
  type = 'text',
  className = '',
  ...rest
}: {
  label: string;
  name: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  const id = `f-${name}`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-small font-medium">
        {label}
        {rest.required && <span className="text-danger" aria-hidden="true"> *</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        aria-describedby={hint ? `${id}-h` : undefined}
        {...rest}
        className="h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-body placeholder:text-ink-faint focus:border-brand focus:shadow-focus focus:outline-none"
      />
      {hint && (
        <p id={`${id}-h`} className="mt-1.5 text-caption text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function TextArea({
  label,
  name,
  hint,
  rows = 4,
  className = '',
  ...rest
}: {
  label: string;
  name: string;
  hint?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>): JSX.Element {
  const id = `f-${name}`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-small font-medium">
        {label}
        {rest.required && <span className="text-danger" aria-hidden="true"> *</span>}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        aria-describedby={hint ? `${id}-h` : undefined}
        {...rest}
        className="w-full rounded-md border border-line-strong bg-surface px-3 py-2.5 text-body placeholder:text-ink-faint focus:border-brand focus:shadow-focus focus:outline-none"
      />
      {hint && (
        <p id={`${id}-h`} className="mt-1.5 text-caption text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Select({
  label,
  name,
  options,
  hint,
  className = '',
  ...rest
}: {
  label: string;
  name: string;
  options: Array<{ value: string; label: string }>;
  hint?: string;
} & React.SelectHTMLAttributes<HTMLSelectElement>): JSX.Element {
  const id = `f-${name}`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-small font-medium">
        {label}
      </label>
      <select
        id={id}
        name={name}
        aria-describedby={hint ? `${id}-h` : undefined}
        {...rest}
        className="h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-body focus:border-brand focus:shadow-focus focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && (
        <p id={`${id}-h`} className="mt-1.5 text-caption text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Signals                                                             */
/* ------------------------------------------------------------------ */

type ChipTone = 'neutral' | 'brand' | 'verified' | 'caution' | 'danger' | 'info';

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: 'bg-surface-sunk text-ink-muted border-line',
  brand: 'bg-brand-soft text-brand-soft-ink border-brand-line',
  verified: 'bg-verified-soft text-verified border-verified-line',
  caution: 'bg-caution-soft text-caution border-caution-line',
  danger: 'bg-danger-soft text-danger border-danger-line',
  info: 'bg-info-soft text-info border-info-line',
};

/**
 * A chip. The word is always present — colour is never the only signal,
 * because roughly one man in twelve cannot use it.
 */
export function Chip({
  children,
  tone = 'neutral',
  icon,
  className = '',
}: {
  children: ReactNode;
  tone?: ChipTone;
  icon?: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-caption font-medium ${CHIP_TONES[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}

/**
 * Which field a person or a piece of work belongs to.
 *
 * On every card, everywhere, because discovery spans all of them: a list
 * that mixes an agronomist, a tax practitioner and an exam evaluator has
 * to say which is which, and the family's own accent colour is the
 * fastest way to carry it. The dot is never the only signal — the name
 * is always beside it.
 */
export function FieldChip({ label, colour }: { label: string; colour: string }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-2.5 py-1 text-caption font-medium text-ink-muted">
      <span aria-hidden="true" className="h-2 w-2 flex-none rounded-full" style={{ background: colour }} />
      {label}
    </span>
  );
}

/** Language, shown wherever a person or a piece of work is shown (#19). */
export function LanguageChip({ languages }: { languages: string[] }): JSX.Element {
  return (
    <Chip tone="neutral" icon={<GlyphGlobe />}>
      {languages.map((l) => l.toUpperCase()).join(' · ')}
    </Chip>
  );
}

/**
 * A verified skill at a tier. Always rendered beside the skill it belongs
 * to, never alone as a badge for the person — tier is per skill, never
 * global (CLAUDE.md #5).
 */
export function TierChip({ tierLabel }: { tierLabel: string }): JSX.Element {
  return (
    <Chip tone="verified" icon={<GlyphCheckSeal />}>
      {tierLabel}
    </Chip>
  );
}

const STATUS_TONE: Record<string, ChipTone> = {
  draft: 'neutral',
  agreed: 'brand',
  working: 'brand',
  delivered: 'brand',
  assessed: 'caution',
  completed: 'verified',
  disputed: 'danger',
  refunded: 'neutral',
  cancelled: 'neutral',
  open: 'brand',
  held_for_review: 'caution',
  scheduled: 'brand',
  live: 'danger',
  ended: 'neutral',
  missed: 'caution',
};

const STATUS_WORD: Record<string, string> = {
  assessed: 'awaiting your confirmation',
  held_for_review: 'held for review',
};

export function StatusChip({ status }: { status: string }): JSX.Element {
  return (
    <Chip tone={STATUS_TONE[status] ?? 'neutral'}>{STATUS_WORD[status] ?? status.replace(/_/g, ' ')}</Chip>
  );
}

/** A figure with its label. The unit of a dashboard. */
export function Stat({
  label,
  value,
  sub,
  tone = 'plain',
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'plain' | 'brand' | 'caution';
}): JSX.Element {
  const valueTone = { plain: 'text-ink', brand: 'text-brand', caution: 'text-caution' }[tone];
  return (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-e1">
      <Eyebrow>{label}</Eyebrow>
      <p className={`figure mt-1.5 text-display font-semibold leading-none ${valueTone}`}>{value}</p>
      {sub && <p className="mt-2 text-small text-ink-muted">{sub}</p>}
    </div>
  );
}

/** Initials only. We hold no uploaded avatars. */
export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }): JSX.Element {
  const dims = { sm: 'h-8 w-8 text-caption', md: 'h-11 w-11 text-small', lg: 'h-16 w-16 text-heading' }[size];
  return (
    <span
      aria-hidden="true"
      className={`flex flex-none items-center justify-center rounded-full bg-brand-soft font-semibold text-brand-soft-ink ${dims}`}
    >
      {initials(name)}
    </span>
  );
}

/**
 * A rating. The number is always shown, and so is the count — stars
 * alone let one five-star review look like a track record.
 */
export function Rating({ value, count }: { value: number | null; count: number }): JSX.Element {
  if (value === null || count === 0) {
    return <span className="text-small text-ink-muted">No reviews yet</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-small">
      <GlyphStar />
      <span className="figure font-semibold">{value.toFixed(1)}</span>
      <span className="text-ink-muted">({count})</span>
    </span>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-surface p-10 text-center">
      <p className="text-lead font-medium">{title}</p>
      {children && <p className="mx-auto mt-1.5 max-w-reading text-body text-ink-muted">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** A time-remaining figure that turns amber, then red, as it runs out. */
export function SlaClock({ text: label }: { text: string }): JSX.Element {
  const overdue = label.includes('overdue');
  const tight = /^\d+ min/.test(label);
  const tone = overdue ? 'danger' : tight ? 'caution' : 'neutral';
  return (
    <Chip tone={tone} icon={<GlyphClock />}>
      <span className="figure">{label}</span>
    </Chip>
  );
}

/* ------------------------------------------------------------------ */
/* Glyphs — inline so there is no icon-font download on a 3G connection */
/* ------------------------------------------------------------------ */

const S = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true } as const;

export function GlyphCheckSeal(): JSX.Element {
  return (
    <svg {...S}>
      <path d="M8 1.5 9.7 3l2.2-.2.3 2.2 1.8 1.3-1.1 1.9 1.1 1.9-1.8 1.3-.3 2.2-2.2-.2L8 14.5 6.3 13l-2.2.2-.3-2.2L2 9.7l1.1-1.9L2 5.9l1.8-1.3.3-2.2L6.3 3 8 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="m5.8 8.1 1.5 1.5 3-3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GlyphStar(): JSX.Element {
  return (
    <svg {...S}>
      <path d="M8 2.2l1.7 3.5 3.8.5-2.8 2.7.7 3.8L8 10.9l-3.4 1.8.7-3.8L2.5 6.2l3.8-.5L8 2.2Z" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

export function GlyphGlobe(): JSX.Element {
  return (
    <svg {...S}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.4 6.4h11.2M2.4 9.6h11.2M8 2a10 10 0 0 0 0 12A10 10 0 0 0 8 2Z" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function GlyphClock(): JSX.Element {
  return (
    <svg {...S}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 4.6V8l2.2 1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function GlyphLock(): JSX.Element {
  return (
    <svg {...S}>
      <rect x="3" y="7" width="10" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function GlyphShield(): JSX.Element {
  return (
    <svg {...S}>
      <path d="M8 1.8 13 3.6v4.1c0 3.1-2 5.4-5 6.5-3-1.1-5-3.4-5-6.5V3.6L8 1.8Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

export function GlyphArrow(): JSX.Element {
  return (
    <svg {...S}>
      <path d="M3.5 8h9m0 0L9 4.5M12.5 8 9 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
