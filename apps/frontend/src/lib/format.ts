import type { Money } from './types';

/**
 * Money never becomes a float and never becomes a JS number that is then
 * added to another one. It arrives as paise, and the only thing this
 * module does is *display* it. Arithmetic on currency belongs to the
 * money module on the server, never here.
 */
export function money(m: Money | null | undefined, opts: { compact?: boolean } = {}): string {
  if (!m) return '—';
  const rupees = m.amountPaise / 100;
  // Whole rupees show no paise; anything with paise shows both digits.
  // "₹382.5" is not a sum of money, and a column of them does not align.
  const whole = opts.compact || Number.isInteger(rupees);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: m.currency,
    maximumFractionDigits: whole ? 0 : 2,
    minimumFractionDigits: whole ? 0 : 2,
  }).format(rupees);
}

/**
 * Times are stored as instants and rendered in a named IANA zone, never
 * a fixed offset — an offset is wrong twice a year in half the world and
 * a session booked across a DST boundary is a session someone misses.
 *
 * In the connected app this comes from the viewer's profile. Pinned here
 * so the preview does not silently render in whatever zone the server
 * happens to run in, which is exactly the bug this convention exists to
 * prevent.
 */
const DISPLAY_TZ = 'Asia/Kolkata';

/**
 * Now.
 *
 * This used to return a pinned instant, so that relative times were
 * stable while the app ran on fixtures. Its own comment said to delete
 * the constant once the API was connected, and that has happened — with
 * it still pinned, every "3 days left" and "posted 2 days ago" on every
 * screen was measured against a frozen 1 September while the data
 * underneath was real.
 *
 * Still a function rather than an inline `new Date()`, because
 * `until()` and `ago()` take an explicit `from` and the tests pass one:
 * a relative-time helper that cannot be told what "now" is cannot be
 * tested without waiting.
 */
export function now(): Date {
  return new Date();
}

export function dateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: DISPLAY_TZ }).format(new Date(iso));
}

export function dateLong(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: DISPLAY_TZ }).format(new Date(iso));
}

export function timeOfDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: DISPLAY_TZ }).format(new Date(iso));
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return `${dateShort(iso)}, ${timeOfDay(iso)}`;
}

/**
 * A duration in words. Used for SLA countdowns, so it is deliberately
 * blunt at the short end — "42 minutes left" matters more than "in an
 * hour" when a queue has a two-hour target.
 */
export function until(iso: string | null | undefined, from: Date = now()): string {
  if (!iso) return '—';
  const ms = new Date(iso).getTime() - from.getTime();
  const past = ms < 0;
  const mins = Math.round(Math.abs(ms) / 60000);
  let text: string;
  if (mins < 60) text = `${mins} min`;
  else if (mins < 60 * 36) text = `${Math.round(mins / 60)} hr`;
  else text = `${Math.round(mins / 1440)} days`;
  return past ? `${text} overdue` : `${text} left`;
}

export function ago(iso: string | null | undefined, from: Date = now()): string {
  if (!iso) return '—';
  const mins = Math.round((from.getTime() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 36) return `${Math.round(mins / 60)} hr ago`;
  const days = Math.round(mins / 1440);
  if (days < 30) return `${days} days ago`;
  return dateShort(iso);
}

/** A percentage that never pretends to more precision than it has. */
export function percent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${Math.round(value * 100)}%`;
}

export function initials(name: string): string {
  return name
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
