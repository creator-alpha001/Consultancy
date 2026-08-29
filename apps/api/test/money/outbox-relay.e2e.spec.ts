import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { EscrowService } from '../../src/modules/money/escrow.service';
import { MoneyModule } from '../../src/modules/money/money.module';
import { PAYMENT_AGGREGATOR } from '../../src/modules/money/pa/payment-aggregator.interface';
import { NotificationsModule } from '../../src/modules/notifications/notifications.module';
import { OutboxRelayService } from '../../src/modules/notifications/outbox-relay.service';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { resetDatabase, seedEngagement, seedFeeSchedule, seedUsers } from '../test-utils';

/**
 * D28: the outbox was written to correctly and read by nothing.
 *
 * `release()` credited a provider's wallet and wrote `payout.initiated`;
 * no transfer was ever instructed, so no settlement webhook could ever
 * arrive and reconciliation reported payouts stuck at `initiated`
 * forever. These tests are mostly about what happens when the relay runs
 * more than once or dies halfway, because at-least-once delivery makes
 * both normal traffic rather than edge cases.
 */
describe('outbox relay: money actually leaves', () => {
  let app: INestApplication;
  let pool: Pool;
  let escrows: EscrowService;
  let relay: OutboxRelayService;

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([MoneyModule, NotificationsModule]);
      pool = app.get<Pool>(PG_POOL);
      escrows = app.get(EscrowService);
      relay = app.get(OutboxRelayService);
    }
    await resetDatabase(pool);
    await seedFeeSchedule(pool, 'INR', 1500);
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  async function releasedEscrow(): Promise<{ escrowId: string; providerId: string }> {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    const escrow = await escrows.hold({
      engagementId,
      seekerId,
      providerId,
      currency: 'INR',
      amountPaise: 100_000n,
      idempotencyKey: `hold:${engagementId}`,
    });
    await escrows.release({ escrowId: escrow.id, idempotencyKey: `release:${escrow.id}` });
    return { escrowId: escrow.id, providerId };
  }

  it('instructs a transfer for a released payout, and records the reference', async () => {
    const { escrowId } = await releasedEscrow();

    const before = await pool.query<{ pa_reference: string | null }>(
      `SELECT pa_reference FROM payouts WHERE escrow_id = $1`,
      [escrowId],
    );
    expect(before.rows[0].pa_reference).toBeNull();

    const result = await relay.runOnce();
    expect(result.dispatched).toBe(1);
    expect(result.failed).toBe(0);

    const after = await pool.query<{ pa_reference: string | null }>(
      `SELECT pa_reference FROM payouts WHERE escrow_id = $1`,
      [escrowId],
    );
    expect(after.rows[0].pa_reference).toBeTruthy();

    const event = await pool.query<{ dispatched_at: Date | null }>(
      `SELECT dispatched_at FROM outbox WHERE event_type = 'payout.initiated' AND aggregate_id = $1`,
      [escrowId],
    );
    expect(event.rows[0].dispatched_at).not.toBeNull();
  });

  it('does not instruct the same transfer twice', async () => {
    const { escrowId } = await releasedEscrow();
    const pa = app.get(PAYMENT_AGGREGATOR) as { transferToProvider: (i: unknown) => Promise<unknown> };
    const original = pa.transferToProvider.bind(pa);
    let calls = 0;
    pa.transferToProvider = async (input: unknown) => {
      calls += 1;
      return original(input);
    };

    try {
      await relay.runOnce();
      expect(calls).toBe(1);

      // A dispatched row is never claimed again...
      const second = await relay.runOnce();
      expect(second.claimed).toBe(0);
      expect(calls).toBe(1);

      // ...and even if the row were replayed, the handler refuses to
      // instruct a payout that already carries a reference. That is the
      // property that matters: at-least-once delivery means this WILL
      // happen after a crash between instructing and recording.
      await pool.query(
        `UPDATE outbox SET dispatched_at = NULL, next_attempt_at = now()
          WHERE event_type = 'payout.initiated' AND aggregate_id = $1`,
        [escrowId],
      );
      const replay = await relay.runOnce();
      expect(replay.claimed).toBe(1);
      expect(replay.dispatched).toBe(1);
      expect(calls).toBe(1);
    } finally {
      pa.transferToProvider = original;
    }
  });

  it('leaves an event with no handler pending rather than marking it delivered', async () => {
    // `escrow.held` has no transport yet. Marking it dispatched would
    // silently drop a message someone is meant to receive; leaving it
    // pending keeps it in reconciliation, which is the honest outcome.
    await releasedEscrow();
    await relay.runOnce();

    const held = await pool.query<{ dispatched_at: Date | null }>(
      `SELECT dispatched_at FROM outbox WHERE event_type = 'escrow.held'`,
    );
    expect(held.rows.length).toBeGreaterThan(0);
    expect(held.rows.every((r) => r.dispatched_at === null)).toBe(true);
    expect(relay.handledEventTypes()).not.toContain('escrow.held');
  });

  it('retries a failure with backoff, then dead-letters without pretending it succeeded', async () => {
    const { escrowId } = await releasedEscrow();
    const pa = app.get(PAYMENT_AGGREGATOR) as { transferToProvider: (i: unknown) => Promise<unknown> };
    const original = pa.transferToProvider.bind(pa);
    pa.transferToProvider = async () => {
      throw new Error('aggregator unreachable');
    };

    try {
      const first = await relay.runOnce();
      expect(first.failed).toBe(1);
      expect(first.dispatched).toBe(0);

      const row = await pool.query<{ attempts: number; last_error: string; next_attempt_at: Date }>(
        `SELECT attempts, last_error, next_attempt_at FROM outbox
          WHERE event_type = 'payout.initiated' AND aggregate_id = $1`,
        [escrowId],
      );
      expect(row.rows[0].attempts).toBe(1);
      expect(row.rows[0].last_error).toMatch(/unreachable/);
      // Backed off — not eligible again immediately.
      expect(row.rows[0].next_attempt_at.getTime()).toBeGreaterThan(Date.now());
      expect((await relay.runOnce()).claimed).toBe(0);

      // Exhaust it. The row must remain UNdispatched: a payout that
      // could not be instructed is not something to quietly stop trying
      // at and call done.
      for (let i = 0; i < 12; i += 1) {
        await pool.query(
          `UPDATE outbox SET next_attempt_at = now()
            WHERE event_type = 'payout.initiated' AND aggregate_id = $1 AND dead_lettered_at IS NULL`,
          [escrowId],
        );
        await relay.runOnce();
      }

      const dead = await pool.query<{ dispatched_at: Date | null; dead_lettered_at: Date | null }>(
        `SELECT dispatched_at, dead_lettered_at FROM outbox
          WHERE event_type = 'payout.initiated' AND aggregate_id = $1`,
        [escrowId],
      );
      expect(dead.rows[0].dead_lettered_at).not.toBeNull();
      expect(dead.rows[0].dispatched_at).toBeNull();

      const payout = await pool.query<{ pa_reference: string | null; status: string }>(
        `SELECT pa_reference, status FROM payouts WHERE escrow_id = $1`,
        [escrowId],
      );
      expect(payout.rows[0].pa_reference).toBeNull();
      expect(payout.rows[0].status).toBe('initiated');
    } finally {
      pa.transferToProvider = original;
    }
  });
});
