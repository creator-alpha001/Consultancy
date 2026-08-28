import { Pool, PoolClient } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, resetDatabase, seedEngagement, seedUsers } from '../test-utils';

/**
 * "Any DB invariant touched has a test that attempts violation in raw
 * SQL and asserts failure" (CLAUDE.md, Definition of done).
 *
 * Migration 0030 added the settlement columns, tied each terminal status
 * to the evidence for it, made those statuses terminal, and made the
 * webhook record append-only. All four are enforced by Postgres, so all
 * four are attacked here with a raw client rather than through the
 * service that is careful not to break them.
 */
describe('settlement invariants (raw SQL)', () => {
  const pool = createPool();

  beforeEach(async () => {
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function expectRejected(fn: (client: PoolClient) => Promise<void>): Promise<Error> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      try {
        await fn(client);
        await client.query('COMMIT');
        throw new Error('__NO_ERROR_THROWN__');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        expect((err as Error).message).not.toBe('__NO_ERROR_THROWN__');
        return err as Error;
      }
    } finally {
      client.release();
    }
  }

  /** A minimal but genuine escrow + ledger transaction to hang a payout off. */
  async function seedPayoutRow(status = 'initiated'): Promise<{ payoutId: string; escrowId: string }> {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    const escrow = await pool.query<{ id: string }>(
      `INSERT INTO escrows (engagement_id, seeker_id, provider_id, currency, amount_paise, status)
       VALUES ($1, $2, $3, 'INR', 100000, 'released') RETURNING id`,
      [engagementId, seekerId, providerId],
    );
    const tx = await pool.query<{ id: string }>(
      `INSERT INTO ledger_transactions (idempotency_key, reason)
       VALUES ($1, 'escrow_release') RETURNING id`,
      [`seed-${escrow.rows[0].id}`],
    );
    const payout = await pool.query<{ id: string }>(
      `INSERT INTO payouts (escrow_id, provider_id, currency, amount_paise, release_transaction_id, pa_provider, status,
                            settled_at, failed_at, failure_reason)
       VALUES ($1, $2, 'INR', 90000, $3, 'razorpay_route', $4::payout_status,
               CASE WHEN $4::text = 'settled' THEN now() END,
               CASE WHEN $4::text = 'failed' THEN now() END,
               CASE WHEN $4::text = 'failed' THEN 'seeded' END)
       RETURNING id`,
      [escrow.rows[0].id, providerId, tx.rows[0].id, status],
    );
    return { payoutId: payout.rows[0].id, escrowId: escrow.rows[0].id };
  }

  describe('a status and the evidence for it cannot drift apart', () => {
    it('refuses a settled payout with no settled_at', async () => {
      const { payoutId } = await seedPayoutRow();
      const err = await expectRejected(async (client) => {
        await client.query(`UPDATE payouts SET status = 'settled' WHERE id = $1`, [payoutId]);
      });
      expect(err.message).toMatch(/payout_status_matches_evidence/);
    });

    it('refuses a failed payout with no stated reason', async () => {
      const { payoutId } = await seedPayoutRow();
      const err = await expectRejected(async (client) => {
        await client.query(`UPDATE payouts SET status = 'failed', failed_at = now() WHERE id = $1`, [payoutId]);
      });
      // A failure nobody can explain is the one an auditor reads first.
      expect(err.message).toMatch(/payout_status_matches_evidence/);
    });

    it('refuses a payout that is both settled and failed', async () => {
      const { payoutId } = await seedPayoutRow();
      const err = await expectRejected(async (client) => {
        await client.query(
          `UPDATE payouts SET status = 'settled', settled_at = now(), failed_at = now() WHERE id = $1`,
          [payoutId],
        );
      });
      expect(err.message).toMatch(/payout_status_matches_evidence/);
    });

    it('refuses an initiated payout that already carries a settlement timestamp', async () => {
      const { payoutId } = await seedPayoutRow();
      const err = await expectRejected(async (client) => {
        await client.query(`UPDATE payouts SET settled_at = now() WHERE id = $1`, [payoutId]);
      });
      expect(err.message).toMatch(/payout_status_matches_evidence/);
    });

    it('applies the same rule to refunds', async () => {
      const { seekerId, providerId } = await seedUsers(pool);
      const engagementId = await seedEngagement(pool, seekerId, providerId);
      const escrow = await pool.query<{ id: string }>(
        `INSERT INTO escrows (engagement_id, seeker_id, provider_id, currency, amount_paise, status)
         VALUES ($1, $2, $3, 'INR', 100000, 'refunded') RETURNING id`,
        [engagementId, seekerId, providerId],
      );
      const tx = await pool.query<{ id: string }>(
        `INSERT INTO ledger_transactions (idempotency_key, reason) VALUES ('seed-refund', 'escrow_refund') RETURNING id`,
      );
      const refund = await pool.query<{ id: string }>(
        `INSERT INTO refunds (escrow_id, seeker_id, currency, amount_paise, reason, refund_transaction_id, pa_provider)
         VALUES ($1, $2, 'INR', 100000, 'test', $3, 'razorpay_route') RETURNING id`,
        [escrow.rows[0].id, seekerId, tx.rows[0].id],
      );

      const err = await expectRejected(async (client) => {
        await client.query(`UPDATE refunds SET status = 'failed', failed_at = now() WHERE id = $1`, [refund.rows[0].id]);
      });
      expect(err.message).toMatch(/refund_status_matches_evidence/);
    });
  });

  describe('a settlement outcome is terminal', () => {
    it('refuses to flip a settled payout to failed', async () => {
      const { payoutId } = await seedPayoutRow('settled');
      const err = await expectRejected(async (client) => {
        await client.query(
          `UPDATE payouts SET status = 'failed', settled_at = NULL, failed_at = now(), failure_reason = 'late' WHERE id = $1`,
          [payoutId],
        );
      });
      // Money confirmed as delivered must not quietly become undelivered
      // because a stale webhook arrived out of order.
      expect(err.message).toMatch(/settlement outcomes are terminal/);
    });

    it('refuses to flip a failed payout to settled', async () => {
      const { payoutId } = await seedPayoutRow('failed');
      const err = await expectRejected(async (client) => {
        await client.query(
          `UPDATE payouts SET status = 'settled', failed_at = NULL, failure_reason = NULL, settled_at = now() WHERE id = $1`,
          [payoutId],
        );
      });
      expect(err.message).toMatch(/settlement outcomes are terminal/);
    });

    it('still allows an initiated payout to reach either outcome', async () => {
      const { payoutId } = await seedPayoutRow();
      await pool.query(`UPDATE payouts SET status = 'settled', settled_at = now() WHERE id = $1`, [payoutId]);
      const res = await pool.query<{ status: string }>(`SELECT status FROM payouts WHERE id = $1`, [payoutId]);
      expect(res.rows[0].status).toBe('settled');
    });
  });

  describe('a received webhook is evidence', () => {
    async function seedWebhook(): Promise<string> {
      const res = await pool.query<{ id: string }>(
        `INSERT INTO pa_webhook_events (pa_provider, pa_event_id, event_type, payload)
         VALUES ('razorpay_route', 'evt-1', 'payout.settled', '{"a":1}'::jsonb) RETURNING id`,
      );
      return res.rows[0].id;
    }

    it('cannot be deleted', async () => {
      const id = await seedWebhook();
      const err = await expectRejected(async (client) => {
        await client.query(`DELETE FROM pa_webhook_events WHERE id = $1`, [id]);
      });
      expect(err.message).toMatch(/append-only/);
    });

    it('cannot have its payload rewritten', async () => {
      const id = await seedWebhook();
      const err = await expectRejected(async (client) => {
        await client.query(`UPDATE pa_webhook_events SET payload = '{"a":2}'::jsonb WHERE id = $1`, [id]);
      });
      expect(err.message).toMatch(/only processed_at and outcome may be updated/);
    });

    it('allows exactly the two fields that record what we did with it', async () => {
      const id = await seedWebhook();
      await pool.query(`UPDATE pa_webhook_events SET processed_at = now(), outcome = 'applied' WHERE id = $1`, [id]);
      const res = await pool.query<{ outcome: string }>(`SELECT outcome FROM pa_webhook_events WHERE id = $1`, [id]);
      expect(res.rows[0].outcome).toBe('applied');
    });

    it('refuses a second row for the same aggregator event id', async () => {
      await seedWebhook();
      const err = await expectRejected(async (client) => {
        await client.query(
          `INSERT INTO pa_webhook_events (pa_provider, pa_event_id, event_type, payload)
           VALUES ('razorpay_route', 'evt-1', 'payout.settled', '{"a":1}'::jsonb)`,
        );
      });
      // This uniqueness IS the replay defence.
      expect(err.message).toMatch(/duplicate key|pa_webhook_events_pa_provider_pa_event_id_key/);
    });

    it('lets two DIFFERENT aggregators use the same event id', async () => {
      await seedWebhook();
      await pool.query(
        `INSERT INTO pa_webhook_events (pa_provider, pa_event_id, event_type, payload)
         VALUES ('cashfree_easy_split', 'evt-1', 'payout.settled', '{"a":1}'::jsonb)`,
      );
      const res = await pool.query(`SELECT count(*) FROM pa_webhook_events WHERE pa_event_id = 'evt-1'`);
      expect(Number(res.rows[0].count)).toBe(2);
    });
  });
});
