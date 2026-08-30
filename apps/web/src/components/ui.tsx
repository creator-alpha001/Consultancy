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

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={`rounded-lg bg-surface-sunk p-xl ${className}`}>{children}</div>
  );
}

export function PageTitle({
  children,
  sub,
  eyebrow,
}: {
  children: React.ReactNode;
  sub?: React.ReactNode;
  eyebrow?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="mb-xxl max-w-2xl">
      {eyebrow && <p className="mb-sm text-small text-ink-muted">{eyebrow}</p>}
      <h1 className="text-display font-semibold">{children}</h1>
      {sub && <p className="mt-md text-body text-ink-muted">{sub}</p>}
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
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
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
        className="w-full min-h-[48px] rounded-md border border-rule bg-surface px-lg py-md text-base"
        {...rest}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">
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
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
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
        className="w-full min-h-[48px] rounded-md border border-rule bg-surface px-lg py-md text-base"
        {...rest}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">
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
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {text}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <select
        id={id}
        name={name}
        required={required}
        defaultValue={defaultValue}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="w-full min-h-[48px] rounded-md border border-rule bg-surface px-lg py-md text-base"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">
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
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-heading font-semibold">{title}</h2>
        {action}
      </div>
      {note && <p className="mb-3 text-sm text-ink-muted">{note}</p>}
      {children}
    </section>
  );
}

export function EmptyState({ children, action }: { children: React.ReactNode; action?: React.ReactNode }): JSX.Element {
  return (
    <div className="rounded-lg bg-surface-sunk p-xxl text-center">
      <p className="text-sm text-ink-muted">{children}</p>
      {action && <div className="mt-3">{action}</div>}
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
      className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-ink text-small font-medium text-accent-ink"
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
    <span className="rounded-pill bg-surface px-md py-xs text-caption font-medium text-ink">
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
    return <span className="text-xs text-ink-muted">No reviews yet</span>;
  }
  const rounded = Math.round(value * 10) / 10;
  return (
    <span className="text-xs text-ink-muted">
      <span aria-hidden="true">{'★'.repeat(Math.round(value))}{'☆'.repeat(5 - Math.round(value))}</span>{' '}
      <span className="tabular-nums">{rounded}</span> ({count})
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
    <ol className="flex flex-wrap gap-x-1 gap-y-2 text-xs" aria-label="Progress">
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

