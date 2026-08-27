import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { EscrowService } from '../../src/modules/money/escrow.service';
import { closeTestApp, createTestApp } from '../nest-test-app';
import {
  accountBalance,
  findAccountId,
  resetDatabase,
  seedEngagement,
  seedFeeSchedule,
  seedUsers,
} from '../test-utils';

describe('award -> escrow hold -> release (end to end)', () => {
  let app: INestApplication;
  let pool: Pool;
  let escrows: EscrowService;

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp();
      pool = app.get<Pool>(PG_POOL);
      escrows = app.get(EscrowService);
    }
    await resetDatabase(pool);
    await seedFeeSchedule(pool, 'INR', 1500); // 15%
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  it('holds funds in escrow with correct ledger postings', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);

    const escrow = await escrows.hold({
      engagementId,
      seekerId,
      providerId,
      currency: 'INR',
      amountPaise: 100_000n, // ₹1,000
      idempotencyKey: `hold:${engagementId}`,
    });

    expect(escrow.status).toBe('held');
    expect(escrow.amountPaise).toBe(100_000n);
    expect(escrow.platformFeePaise).toBe(15_000n); // 15% of 100,000

    const paAccountId = await findAccountId(pool, 'payment_aggregator', null, 'INR');
    const escrowAccountId = await findAccountId(pool, 'escrow', null, 'INR');
    expect(await accountBalance(pool, paAccountId!, 'INR')).toBe(-100_000n);
    expect(await accountBalance(pool, escrowAccountId!, 'INR')).toBe(100_000n);
  });

  it('is idempotent: holding twice with the same key does not double-post', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    const input = {
      engagementId,
      seekerId,
      providerId,
      currency: 'INR',
      amountPaise: 50_000n,
      idempotencyKey: `hold:${engagementId}`,
    };

    const first = await escrows.hold(input);
    const second = await escrows.hold(input);
    expect(second.id).toBe(first.id);
    expect(second.status).toBe('held');

    const escrowAccountId = await findAccountId(pool, 'escrow', null, 'INR');
    expect(await accountBalance(pool, escrowAccountId!, 'INR')).toBe(50_000n); // not 100,000

    const txCount = await pool.query(`SELECT count(*) FROM ledger_transactions WHERE reason = 'escrow_hold'`);
    expect(Number(txCount.rows[0].count)).toBe(1);
  });

  it('releases held funds to the provider, net of the platform fee, and closes the escrow account out', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);

    const held = await escrows.hold({
      engagementId,
      seekerId,
      providerId,
      currency: 'INR',
      amountPaise: 100_000n,
      idempotencyKey: `hold:${engagementId}`,
    });

    const released = await escrows.release({
      escrowId: held.id,
      idempotencyKey: `release:${held.id}`,
    });

    expect(released.status).toBe('released');

    const escrowAccountId = await findAccountId(pool, 'escrow', null, 'INR');
    const providerAccountId = await findAccountId(pool, 'provider_wallet', providerId, 'INR');
    const feeAccountId = await findAccountId(pool, 'platform_fee_revenue', null, 'INR');

    expect(await accountBalance(pool, escrowAccountId!, 'INR')).toBe(0n); // fully closed out
    expect(await accountBalance(pool, providerAccountId!, 'INR')).toBe(85_000n); // 100,000 - 15% fee
    expect(await accountBalance(pool, feeAccountId!, 'INR')).toBe(15_000n);

    const payout = await pool.query(`SELECT amount_paise, status FROM payouts WHERE escrow_id = $1`, [held.id]);
    expect(payout.rows[0].amount_paise).toBe(85_000n);
    expect(payout.rows[0].status).toBe('initiated');

    const outboxEvent = await pool.query(
      `SELECT event_type FROM outbox WHERE aggregate_id = $1 AND event_type = 'payout.initiated'`,
      [held.id],
    );
    expect(outboxEvent.rows).toHaveLength(1);
  });

  it('releasing twice is a no-op the second time', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    const held = await escrows.hold({
      engagementId,
      seekerId,
      providerId,
      currency: 'INR',
      amountPaise: 40_000n,
      idempotencyKey: `hold:${engagementId}`,
    });

    await escrows.release({ escrowId: held.id, idempotencyKey: `release:${held.id}` });
    const secondRelease = await escrows.release({ escrowId: held.id, idempotencyKey: `release:${held.id}-retry` });
    expect(secondRelease.status).toBe('released');

    const providerAccountId = await findAccountId(pool, 'provider_wallet', providerId, 'INR');
    expect(await accountBalance(pool, providerAccountId!, 'INR')).toBe(34_000n); // not paid twice
  });

  it('refunds held funds back out through the aggregator, never touching the provider', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    const held = await escrows.hold({
      engagementId,
      seekerId,
      providerId,
      currency: 'INR',
      amountPaise: 60_000n,
      idempotencyKey: `hold:${engagementId}`,
    });

    const refunded = await escrows.refund({
      escrowId: held.id,
      idempotencyKey: `refund:${held.id}`,
      reason: 'platform_failure',
    });

    expect(refunded.status).toBe('refunded');

    const escrowAccountId = await findAccountId(pool, 'escrow', null, 'INR');
    const paAccountId = await findAccountId(pool, 'payment_aggregator', null, 'INR');
    const providerAccountId = await findAccountId(pool, 'provider_wallet', providerId, 'INR');

    expect(await accountBalance(pool, escrowAccountId!, 'INR')).toBe(0n);
    expect(await accountBalance(pool, paAccountId!, 'INR')).toBe(0n); // captured then refunded — net zero
    expect(providerAccountId).toBeNull(); // provider account never created — provider was never paid

    const refund = await pool.query(`SELECT reason, amount_paise FROM refunds WHERE escrow_id = $1`, [held.id]);
    expect(refund.rows[0].reason).toBe('platform_failure');
    expect(refund.rows[0].amount_paise).toBe(60_000n);
  });

  it('rejects releasing an escrow that was already refunded', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    const held = await escrows.hold({
      engagementId,
      seekerId,
      providerId,
      currency: 'INR',
      amountPaise: 20_000n,
      idempotencyKey: `hold:${engagementId}`,
    });
    await escrows.refund({ escrowId: held.id, idempotencyKey: `refund:${held.id}`, reason: 'mutual_cancellation' });

    await expect(
      escrows.release({ escrowId: held.id, idempotencyKey: `release:${held.id}` }),
    ).rejects.toThrow(/cannot release escrow/);
  });
});
