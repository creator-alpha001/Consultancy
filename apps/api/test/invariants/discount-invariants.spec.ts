import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, resetDatabase } from '../test-utils';

/**
 * Raw-SQL invariant tests for provider discounts.
 *
 * The rule these exist to hold: price on this platform is not negotiable.
 * A provider publishes a service at a price and a seeker buys it; what
 * the two negotiate is the agenda. A provider may still charge LESS — but
 * only once the work has started, because a discount available before
 * then is price negotiation wearing a different name. A seeker would ask
 * for one, and providers who refused would lose bookings to providers who
 * did not.
 *
 * All of it is enforced by a trigger rather than by the service, which is
 * why these tests go straight at the database.
 */
describe('discount invariants (raw SQL)', () => {
  const pool = createPool();

  beforeEach(async () => {
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function engagement(status = 'draft', amountPaise = 100_000): Promise<{
    id: string;
    seekerId: string;
    providerId: string;
  }> {
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const seeker = await pool.query<{ id: string }>(
      `INSERT INTO users (email, role, adult_confirmed_at, status)
       VALUES ($1, 'seeker', now(), 'active') RETURNING id`,
      [`s+${unique}@test.local`],
    );
    const provider = await pool.query<{ id: string }>(
      `INSERT INTO users (email, role, adult_confirmed_at, status)
       VALUES ($1, 'provider', now(), 'active') RETURNING id`,
      [`p+${unique}@test.local`],
    );
    // Inserted at the target status directly — the transition table only
    // guards UPDATEs, and these tests are about the discount rule.
    const row = await pool.query<{ id: string }>(
      `INSERT INTO engagements (seeker_id, provider_id, currency, status, engagement_type, amount_paise)
       VALUES ($1, $2, 'INR', $3::engagement_status, 'document_review', $4) RETURNING id`,
      [seeker.rows[0].id, provider.rows[0].id, status, amountPaise],
    );
    return { id: row.rows[0].id, seekerId: seeker.rows[0].id, providerId: provider.rows[0].id };
  }

  async function discount(
    engagementId: string,
    grantedBy: string,
    discountPaise = 25_000,
  ): Promise<unknown> {
    return pool.query(
      `INSERT INTO engagement_discounts (engagement_id, granted_by, discount_paise)
       VALUES ($1, $2, $3)`,
      [engagementId, grantedBy, discountPaise],
    );
  }

  describe('only once the work has started', () => {
    it('refuses a discount on a draft — that would be price negotiation', async () => {
      const e = await engagement('draft');
      await expect(discount(e.id, e.providerId)).rejects.toThrow(
        /may only be given once the work has started/,
      );
    });

    it('refuses one on an agreed engagement, before any work begins', async () => {
      // The most tempting moment to haggle: terms are set, money is not
      // yet in escrow, and the seeker is about to pay.
      const e = await engagement('agreed');
      await expect(discount(e.id, e.providerId)).rejects.toThrow(
        /may only be given once the work has started/,
      );
    });

    it('allows one once the engagement is working', async () => {
      const e = await engagement('working');
      await expect(discount(e.id, e.providerId)).resolves.toBeDefined();
    });

    it('allows one after the work is delivered', async () => {
      const e = await engagement('delivered');
      await expect(discount(e.id, e.providerId)).resolves.toBeDefined();
    });

    it('allows one when a live session has actually started, whatever the engagement status', async () => {
      // "Once the call is started" is the rule for live work, and a
      // session can be under way while the engagement is still `working`.
      const e = await engagement('working');
      await pool.query(
        `INSERT INTO sessions (engagement_id, scheduled_start, scheduled_end, timezone, started_at, status)
         VALUES ($1, now(), now() + interval '1 hour', 'Asia/Kolkata', now(), 'in_progress')`,
        [e.id],
      );
      await expect(discount(e.id, e.providerId)).resolves.toBeDefined();
    });
  });

  describe('who may give one', () => {
    it('refuses a seeker discounting their own engagement', async () => {
      const e = await engagement('working');
      await expect(discount(e.id, e.seekerId)).rejects.toThrow(/may discount it/);
    });

    it('refuses a stranger', async () => {
      const e = await engagement('working');
      const other = await pool.query<{ id: string }>(
        `INSERT INTO users (email, role, adult_confirmed_at, status)
         VALUES ($1, 'provider', now(), 'active') RETURNING id`,
        [`x+${Math.random().toString(36).slice(2)}@test.local`],
      );
      await expect(discount(e.id, other.rows[0].id)).rejects.toThrow(/may discount it/);
    });
  });

  describe('how much', () => {
    it('refuses a discount equal to the price — a full waiver is a refund', async () => {
      // Recorded as a discount, this would leave a completed engagement
      // that was never paid for, and "was this paid?" would have two
      // answers.
      const e = await engagement('working', 100_000);
      await expect(discount(e.id, e.providerId, 100_000)).rejects.toThrow(/a full waiver is a refund/);
    });

    it('refuses more than the price', async () => {
      const e = await engagement('working', 100_000);
      await expect(discount(e.id, e.providerId, 150_000)).rejects.toThrow(/a full waiver is a refund/);
    });

    it('refuses zero or negative', async () => {
      const e = await engagement('working');
      await expect(discount(e.id, e.providerId, 0)).rejects.toThrow(/discount_paise/);
      await expect(discount(e.id, e.providerId, -100)).rejects.toThrow(/discount_paise/);
    });
  });

  describe('after the money has moved', () => {
    it('refuses a discount on a completed engagement', async () => {
      const e = await engagement('completed');
      await expect(discount(e.id, e.providerId)).rejects.toThrow(/the money has moved/);
    });

    it('refuses one on a refunded engagement', async () => {
      const e = await engagement('refunded');
      await expect(discount(e.id, e.providerId)).rejects.toThrow(/the money has moved/);
    });
  });

  it('keeps one discount per engagement — a second replaces the first', async () => {
    const e = await engagement('working');
    await discount(e.id, e.providerId, 20_000);
    await pool.query(
      `INSERT INTO engagement_discounts (engagement_id, granted_by, discount_paise)
       VALUES ($1, $2, $3)
       ON CONFLICT (engagement_id) DO UPDATE SET discount_paise = EXCLUDED.discount_paise`,
      [e.id, e.providerId, 30_000],
    );
    const rows = await pool.query<{ discount_paise: string }>(
      `SELECT discount_paise::text FROM engagement_discounts WHERE engagement_id = $1`,
      [e.id],
    );
    // Replaced, not stacked: two discounts would compound into a number
    // neither party agreed to.
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].discount_paise).toBe('30000');
  });
});
