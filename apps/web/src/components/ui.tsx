/**
 * The shared vocabulary of the interface. None of these name a colour —
 * they use the pack-driven tokens, so the same components render an exam
 * family and a music school differently with no code change (#7).
 *
 * Restyled to match apps/mobile, from the same design tokens: white
 * ground, flat grey panels with no border and no shadow, pill-shaped
 * black primary buttons, and a much larger, tighter display size.
 * Separation comes from fill and whitespace rather than from lines.
 */
import Link from 'next/link';

export function Card({
  children,
  className = '',
  tone = 'sunk',
}: {
  children: React.ReactNode;
  className?: string;
  /**
   * `sunk` is the default grey panel. `outline` is a lighter weight for
   * dense grids where a wall of filled boxes reads as noise, and `lead`
   * is the one card on a page that should carry more weight than the
   * rest. Having three is the point: with a single card style nothing on
   * a page can be more important than anything else.
   */
  tone?: 'sunk' | 'outline' | 'lead';
}): JSX.Element {
  const tones = {
    sunk: 'bg-surface-sunk',
    outline: 'border border-rule bg-surface',
    lead: 'bg-ink text-accent-ink',
  }[tone];
  return <div className={`rounded-lg p-xl ${tones} ${className}`}>{children}</div>;
}

export function PageTitle({
  children,
  sub,
  eyebrow,
  action,
}: {
  children: React.ReactNode;
  sub?: React.ReactNode;
  eyebrow?: React.ReactNode;
  /** A primary button beside the heading — "Find someone here" on a domain page,
      the thing this screen exists for. Wraps under the title on a narrow screen. */
  action?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="mb-xxl max-w-3xl">
      {eyebrow && (
        <p className="mb-md text-caption font-medium uppercase tracking-[0.12em] text-ink-muted">
          {eyebrow}
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-lg">
        <h1 className="text-display font-semibold text-balance">{children}</h1>
        {action && <div className="flex-none">{action}</div>}
      </div>
      {sub && <p className="mt-lg max-w-prose text-body text-ink-muted">{sub}</p>}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-surface-sunk text-ink-muted',
  agreed: 'bg-ink text-accent-ink',
  working: 'bg-ink text-accent-ink',
  delivered: 'bg-ink text-accent-ink',
  assessed: 'bg-ink text-accent-ink',
  completed: 'bg-good-soft text-good',
  disputed: 'bg-correction-soft text-correction',
  refunded: 'bg-correction-soft text-correction',
  cancelled: 'bg-surface-sunk text-ink-muted',
  open: 'bg-ink text-accent-ink',
  held_for_review: 'bg-correction-soft text-correction',
  published: 'bg-good-soft text-good',
};

/** A status pill. Colour is never the only signal — the word is always present. */
export function Status({ value }: { value: string }): JSX.Element {
  return (
    <span
      className={`inline-block rounded-pill px-md py-xs text-caption font-medium ${
        STATUS_TONE[value] ?? 'bg-surface-sunk text-ink-muted'
      }`}
    >
      {value.replace(/_/g, ' ')}
    </span>
  );
}

/** Money, formatted from paise. Always paired with its currency. */
export function Money({ paise, currency }: { paise: string | number | null; currency: string }): JSX.Element {
  if (paise === null) return <span className="text-ink-muted">—</span>;
  const rupees = Number(BigInt(paise)) / 100;
  return (
    <span className="tabular-nums">
      {new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(rupees)}
    </span>
  );
}

export function Field({
  label: text,
  name,
  type = 'text',
  required,
  defaultValue,
  hint,
  ...rest
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  const id = `f-${name}`;
  return (
    <div className="mb-lg">
      <label htmlFor={id} className="mb-sm block text-small font-medium">
        {text}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="w-full min-h-[48px] rounded-md border border-rule bg-surface px-lg py-md text-body transition-colors placeholder:text-ink-faint hover:border-ink-faint focus:border-ink"
        {...rest}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-sm text-caption text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Button({
  children,
  variant = 'primary',
  ...rest
}: { variant?: 'primary' | 'secondary' | 'danger' } & React.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  const styles = {
    primary: 'bg-accent text-accent-ink border border-transparent hover:opacity-90',
    secondary: 'border border-rule bg-surface text-ink hover:bg-surface-sunk',
    danger: 'border border-rule bg-surface text-correction hover:bg-correction-soft',
  }[variant];
  return (
    <button
      {...rest}
      className={`inline-flex min-h-[48px] items-center justify-center rounded-pill px-xl text-bodyStrong font-medium disabled:opacity-40 ${styles} ${rest.className ?? ''}`}
    >
      {children}
    </button>
  );
}

/** An inline error, rendered from the API's stable `code` + localised message. */
export function ErrorNote({ code, message }: { code?: string; message?: string }): JSX.Element | null {
  if (!message) return null;
  return (
    <div role="alert" className="mb-lg rounded-md bg-correction-soft p-lg text-small">
      <p className="font-medium text-correction">{message}</p>
      {code && <p className="mt-xs text-caption text-ink-muted">Reference: {code}</p>}
    </div>
  );
}

export function Textarea({
  label: text,
  name,
  rows = 4,
  required,
  defaultValue,
  hint,
  ...rest
}: {
  label: string;
  name: string;
  rows?: number;
  required?: boolean;
  defaultValue?: string;
  hint?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>): JSX.Element {
  const id = `f-${name}`;
  return (
    <div className="mb-lg">
      <label htmlFor={id} className="mb-sm block text-small font-medium">
        {text}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        required={required}
        defaultValue={defaultValue}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="w-full min-h-[48px] rounded-md border border-rule bg-surface px-lg py-md text-body transition-colors placeholder:text-ink-faint hover:border-ink-faint focus:border-ink"
        {...rest}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-sm text-caption text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Select({
  label: text,
  name,
  options,
  required,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
  defaultValue?: string;
  hint?: string;
}): JSX.Element {
  const id = `f-${name}`;
  return (
    <div className="mb-lg">
      <label htmlFor={id} className="mb-sm block text-small font-medium">
        {text}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <select
        id={id}
        name={name}
        required={required}
        defaultValue={defaultValue}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="w-full min-h-[48px] rounded-md border border-rule bg-surface px-lg py-md text-body transition-colors placeholder:text-ink-faint hover:border-ink-faint focus:border-ink"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && (
        <p id={`${id}-hint`} className="mt-sm text-caption text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/** A labelled section within a page. */
export function Section({
  title,
  action,
  children,
  note,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  note?: string;
}): JSX.Element {
  return (
    <section className="mb-xxl">
      <div className="mb-lg flex flex-wrap items-baseline justify-between gap-md">
        <h2 className="text-heading font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {note && <p className="-mt-sm mb-lg max-w-prose text-small text-ink-muted">{note}</p>}
      {children}
    </section>
  );
}

export function EmptyState({ children, action }: { children: React.ReactNode; action?: React.ReactNode }): JSX.Element {
  return (
    <div className="rounded-lg border border-dashed border-rule px-xl py-xxxl text-center">
      <p className="mx-auto max-w-prose text-body text-ink-muted">{children}</p>
      {action && <div className="mt-xl">{action}</div>}
    </div>
  );
}

/** Initials, derived from a display name. Never an uploaded image — we hold no avatars. */
export function Avatar({ name }: { name: string }): JSX.Element {
  const initials = name
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span
      aria-hidden="true"
      className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-ink text-small font-medium tracking-tight text-accent-ink"
    >
      {initials}
    </span>
  );
}

/**
 * A verified skill at a tier. The tier is per skill, never global
 * (CLAUDE.md #5), so this is always rendered next to the skill it
 * belongs to — never on its own as a badge for the person.
 */
export function TierChip({ tier }: { tier: string }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-xs rounded-pill border border-rule bg-surface px-md py-xs text-caption font-medium text-ink">
      <svg viewBox="0 0 16 16" className="h-[11px] w-[11px] text-good" fill="currentColor" aria-hidden="true">
        <path d="M6.2 11.6L3 8.4l1.1-1.1 2.1 2.1L11.9 3.6 13 4.7z" />
      </svg>
      {tier.toUpperCase()} verified
    </span>
  );
}

/**
 * A rating out of five. Shows the number as well as the stars — colour
 * and shape are never the only signal.
 */
export function Rating({ value, count }: { value: number | null; count: number }): JSX.Element {
  if (value === null || count === 0) {
    return <span className="text-caption text-ink-muted">No reviews yet</span>;
  }
  const rounded = Math.round(value * 10) / 10;
  const filled = Math.round(value);
  return (
    <span className="inline-flex items-center gap-sm text-caption text-ink-muted">
      <span aria-hidden="true" className="inline-flex gap-[2px]">
        {[0, 1, 2, 3, 4].map((i) => (
          <svg key={i} viewBox="0 0 20 20" className="h-[13px] w-[13px]" fill="currentColor">
            <path
              className={i < filled ? 'text-ink' : 'text-rule'}
              fill="currentColor"
              d="M10 1.6l2.47 5.2 5.53.78-4 4.03.95 5.79L10 14.67l-4.95 2.73.95-5.79-4-4.03 5.53-.78z"
            />
          </svg>
        ))}
      </span>
      <span className="tabular-nums text-ink">{rounded}</span>
      <span>({count})</span>
    </span>
  );
}

const LIFECYCLE = ['draft', 'agreed', 'working', 'delivered', 'assessed', 'completed'] as const;

/**
 * Where an engagement is in its lifecycle. Reads the real transition
 * table's order — a disputed or cancelled engagement is shown as a
 * departure from it rather than being forced onto the line.
 */
export function Lifecycle({ status }: { status: string }): JSX.Element {
  const index = LIFECYCLE.indexOf(status as (typeof LIFECYCLE)[number]);
  if (index === -1) {
    return (
      <div className="rounded-md bg-correction-soft p-lg text-small">
        This engagement is <strong>{status.replace(/_/g, ' ')}</strong> — outside the ordinary flow.
      </div>
    );
  }
  return (
    <ol className="flex flex-wrap items-center gap-x-sm gap-y-sm text-caption" aria-label="Progress">
      {LIFECYCLE.map((step, i) => (
        <li key={step} className="flex items-center gap-1">
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] tabular-nums ${
              i < index
                ? 'border-accent bg-accent text-white'
                : i === index
                  ? 'border-correction text-correction font-semibold'
                  : 'border-rule text-ink-muted'
            }`}
          >
            {i < index ? '✓' : i + 1}
          </span>
          <span className={i === index ? 'font-medium' : 'text-ink-muted'}>{step}</span>
          {i < LIFECYCLE.length - 1 && <span aria-hidden="true" className="mx-1 text-rule">→</span>}
        </li>
      ))}
    </ol>
  );
}


/**
 * The way back out of a detail screen.
 *
 * It exists as a component because it appeared three times as a bare
 * `text-sm underline` — which is a 20px-tall target on a phone. A thumb
 * needs 44px, and the definition of done says so. Written once so the
 * next detail screen inherits it rather than repeating the mistake.
 *
 * The arrow is decorative; the words carry the meaning.
 */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }): JSX.Element {
  return (
    <Link
      href={href}
      className="-ml-sm inline-flex min-h-[44px] items-center gap-xs rounded-pill px-sm text-small text-ink-muted underline-offset-4 hover:text-ink hover:underline"
    >
      <span aria-hidden="true">&larr;</span>
      {children}
    </Link>
  );
}

/**
 * "Go here" — a section's action, a row's open link, an empty state's way out.
 *
 * The same eight-word link was written eight times as `text-sm text-accent
 * underline`, which lands as a 20px-tall target. Only the two on screens
 * that happened to have rows were caught; the rest were waiting. One
 * component so the ninth is right by default.
 */
export function ActionLink({ href, children }: { href: string; children: React.ReactNode }): JSX.Element {
  return (
    <Link
      href={href}
      className="inline-flex min-h-[44px] items-center text-small font-medium text-accent underline underline-offset-4 hover:opacity-80"
    >
      {children}
    </Link>
  );
}

/**
 * A wide table that scrolls inside itself instead of dragging the page sideways.
 *
 * `overflow-x-auto` alone is not enough. A `<table>` with a `min-width`
 * inside a scroll container still propagates its overflow to the viewport
 * in Chrome — the container clips the paint, but the whole page becomes
 * horizontally scrollable anyway. At 360px that means every row's right
 * half is off-screen with no indication it exists.
 *
 * `contain: paint` is what actually stops it; neither `overflow-x: clip`
 * on the wrapper nor on `<main>` does. Measured, not guessed — see
 * `test/mobile-fit.mjs`, which is what caught it.
 *
 * The wrapper is a component rather than a copied class string because
 * the same three-class incantation appeared in three files and was
 * subtly wrong in all of them.
 */
export function TableScroll({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="overflow-x-auto rounded-lg border border-rule [contain:paint]" tabIndex={0}>
      {children}
    </div>
  );
}
