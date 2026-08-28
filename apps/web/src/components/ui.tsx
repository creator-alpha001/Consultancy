/**
 * The shared vocabulary of the interface. None of these name a colour —
 * they use the pack-driven tokens, so the same components render an exam
 * family and a music school differently with no code change (#7).
 */

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={`rounded-card border border-rule bg-paper-raised p-4 ${className}`}>{children}</div>
  );
}

export function PageTitle({
  children,
  sub,
}: {
  children: React.ReactNode;
  sub?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="mb-6">
      <h1 className="font-answer text-2xl font-semibold tracking-tight">{children}</h1>
      {sub && <p className="mt-1 text-sm text-ink-muted">{sub}</p>}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  draft: 'border-rule text-ink-muted',
  agreed: 'border-accent text-accent',
  working: 'border-accent text-accent',
  delivered: 'border-accent text-accent',
  assessed: 'border-accent text-accent',
  completed: 'border-green-700 text-green-800',
  disputed: 'border-correction text-correction',
  refunded: 'border-correction text-correction',
  cancelled: 'border-rule text-ink-muted',
  open: 'border-accent text-accent',
  held_for_review: 'border-correction text-correction',
  published: 'border-green-700 text-green-800',
};

/** A status pill. Colour is never the only signal — the word is always present. */
export function Status({ value }: { value: string }): JSX.Element {
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        STATUS_TONE[value] ?? 'border-rule text-ink-muted'
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
        className="w-full rounded-card border border-rule bg-paper px-3 py-2 text-base"
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
    primary: 'bg-accent text-white hover:opacity-90',
    secondary: 'border border-rule bg-paper hover:bg-paper-raised',
    danger: 'border border-correction text-correction hover:bg-paper-raised',
  }[variant];
  return (
    <button
      {...rest}
      className={`rounded-card px-4 py-2 text-sm font-medium disabled:opacity-50 ${styles} ${rest.className ?? ''}`}
    >
      {children}
    </button>
  );
}

/** An inline error, rendered from the API's stable `code` + localised message. */
export function ErrorNote({ code, message }: { code?: string; message?: string }): JSX.Element | null {
  if (!message) return null;
  return (
    <div role="alert" className="mb-4 rounded-card border border-correction bg-paper-raised p-3 text-sm">
      <p className="font-medium text-correction">{message}</p>
      {code && <p className="mt-0.5 text-xs text-ink-muted">Reference: {code}</p>}
    </div>
  );
}
