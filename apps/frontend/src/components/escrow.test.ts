import { describe, expect, it } from 'vitest';
import { railFor, escrowLine } from './escrow';
import { escrowOutcome } from '@/lib/data/adapt';
import type { EscrowState, EscrowStage, EscrowOutcome } from '@/lib/types';

/**
 * Where the money is, in words.
 *
 * The rail is the one picture both parties and an admin look at during
 * a dispute, so what it SAYS is the thing worth testing — not that it
 * renders. The mapping is pure and exported for exactly that reason.
 */

function escrow(stage: EscrowStage, outcome: EscrowOutcome | null = null): EscrowState {
  return {
    stage,
    held: { amountPaise: 70000, currency: 'INR' },
    providerNet: { amountPaise: 59500, currency: 'INR' },
    platformFee: { amountPaise: 10500, currency: 'INR' },
    releasesOn: null,
    releasedOn: '2026-08-11T10:00:00+05:30',
    outcome,
  };
}

const last = (e: EscrowState, audience?: 'seeker' | 'provider' | 'admin') =>
  railFor(e, audience)[railFor(e, audience).length - 1]!;

describe('the rail while the escrow is open', () => {
  it('has five stops, always, so the picture does not move under the reader', () => {
    for (const stage of ['posted', 'awarded', 'in_progress', 'review', 'released'] as const) {
      expect(railFor(escrow(stage))).toHaveLength(5);
    }
  });

  it('names the hold as being out of both parties’ reach', () => {
    // The whole reason a seeker parts with the money before the work.
    expect(railFor(escrow('awarded'))[1]!.meaning).toContain('out of both parties');
  });

  it('promises a date, or a condition — never a bare "processing"', () => {
    expect(escrowLine({ ...escrow('awarded'), releasesOn: '2026-09-04T18:00:00+05:30' })).toContain(
      'Releases',
    );
    expect(escrowLine({ ...escrow('awarded'), releasesOn: null })).toBe(
      'Held until the goals are confirmed',
    );
  });
});

describe('the rail once the escrow has closed', () => {
  it('says the provider was paid, when they were', () => {
    expect(last(escrow('released', 'released')).label).toBe('Released');
    expect(last(escrow('released', 'released')).meaning).toContain('Paid out to the provider');
  });

  /*
   * The defect this file exists for.
   *
   * A refund and a payout both END the escrow, so they occupy the same
   * final position on the rail. The stage alone therefore cannot say
   * which happened — and the rail used to read "Released. Paid out to
   * the provider." to a seeker whose money had just been returned to
   * them. On the screen a dispute is argued from, that is the worst
   * available sentence.
   */
  it('does not tell a refunded seeker their money was paid to the provider', () => {
    const refunded = last(escrow('released', 'refunded'), 'seeker');
    expect(refunded.label).toBe('Refunded');
    expect(refunded.meaning).toContain('Returned to you');
    expect(refunded.meaning).not.toContain('Paid out');
    expect(escrowLine(escrow('released', 'refunded'))).toContain('Refunded');
  });

  it('tells the provider the same fact from their side', () => {
    // Same event, same rail, no contradiction between the two screens.
    expect(last(escrow('released', 'refunded'), 'provider').meaning).toContain('Returned to the seeker');
  });

  it('describes a split ruling as a split, not as a payout', () => {
    const split = last(escrow('released', 'split'), 'seeker');
    expect(split.label).toBe('Settled');
    expect(split.meaning).toContain('part paid out');
    expect(split.meaning).toContain('returned to you');
  });

  /*
   * An escrow can sit at the final stage before its settlement status
   * is known. Saying "Released" there is the honest default: it is what
   * the stage claims, and no direction is asserted that might be wrong.
   */
  it('falls back to the neutral wording when the outcome is not yet known', () => {
    expect(last(escrow('released', null)).label).toBe('Released');
  });

  it('omits the date rather than printing an empty one', () => {
    expect(escrowLine({ ...escrow('released', 'refunded'), releasedOn: null })).toBe('Refunded');
  });
});

describe('escrowOutcome — reading the API’s status', () => {
  it.each([
    ['released', 'released'],
    ['refunded', 'refunded'],
    ['settled_split', 'split'],
  ])('reads %s as %s', (status, expected) => {
    expect(escrowOutcome(status)).toBe(expected);
  });

  /*
   * An open escrow, and anything this build has not heard of, are both
   * reported as "no outcome yet". Guessing a direction from an unknown
   * status is how the original bug would come back.
   */
  it.each(['pending', 'held', 'disputed_hold', 'some_future_status', null])(
    'reports %s as no outcome yet',
    (status) => {
      expect(escrowOutcome(status)).toBeNull();
    },
  );
});
