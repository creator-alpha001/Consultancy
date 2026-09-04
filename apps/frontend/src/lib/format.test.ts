import { describe, expect, it } from 'vitest';
import { ago, initials, money, percent, until } from './format';

/**
 * Display rules, not arithmetic.
 *
 * Currency arithmetic belongs to the server's money module; everything
 * here only renders. What is worth pinning is the shape of the output,
 * because two of these rules exist for reasons a later "tidy-up" would
 * undo without noticing.
 */

describe('money', () => {
  it('shows whole rupees without paise', () => {
    expect(money({ amountPaise: 95000, currency: 'INR' })).toBe('₹950');
  });

  /*
   * "₹382.5" is not a sum of money and a column of them does not align.
   * A part-rupee amount shows BOTH digits or none.
   */
  it('shows both paise digits when there are any, never one', () => {
    expect(money({ amountPaise: 38250, currency: 'INR' })).toBe('₹382.50');
    expect(money({ amountPaise: 1, currency: 'INR' })).toBe('₹0.01');
  });

  it('renders absent money as absent rather than as zero', () => {
    // ₹0 and "we do not know" are different claims. A screen that shows
    // the first for the second is stating a fee that was never set.
    expect(money(null)).toBe('—');
    expect(money(undefined)).toBe('—');
  });

  it('carries the currency it was given', () => {
    expect(money({ amountPaise: 100000, currency: 'USD' })).toContain('$');
  });

  it('does not lose precision on a large amount', () => {
    // Ninety-nine lakh, in paise. Rendering must not drift.
    expect(money({ amountPaise: 990000000, currency: 'INR' })).toBe('₹99,00,000');
  });
});

describe('until / ago', () => {
  const from = new Date('2026-09-01T12:00:00Z');

  it('counts down, and says so when it has run out', () => {
    expect(until('2026-09-01T12:30:00Z', from)).toBe('30 min left');
    expect(until('2026-09-01T11:30:00Z', from)).toBe('30 min overdue');
  });

  it('switches units as the distance grows', () => {
    expect(until('2026-09-01T18:00:00Z', from)).toBe('6 hr left');
    expect(until('2026-09-05T12:00:00Z', from)).toBe('4 days left');
  });

  it('renders an absent time as absent, not as "now"', () => {
    expect(until(null, from)).toBe('—');
    expect(ago(undefined, from)).toBe('—');
  });

  it('reads an elapsed time backwards', () => {
    expect(ago('2026-09-01T09:00:00Z', from)).toContain('3 hr');
  });
});

describe('percent', () => {
  it('rounds to a whole percent and handles absence', () => {
    expect(percent(0.97)).toBe('97%');
    expect(percent(null)).toBe('—');
  });
});

describe('initials', () => {
  it('takes the first letter of the first and last parts', () => {
    expect(initials('Asha Rathore')).toBe('AR');
  });

  it('survives a single name', () => {
    expect(initials('Rathore')).toBeTruthy();
  });
});
