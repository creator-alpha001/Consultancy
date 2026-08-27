import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { EscrowService } from '../../src/modules/money/escrow.service';
import { MoneyModule } from '../../src/modules/money/money.module';
import { closeTestApp, createTestApp } from '../nest-test-app';
import {
  accountBalance,
  findAccountId,
  resetDatabase,
  seedEngagement,
  seedFeeSchedule,
  seedUsers,
} from '../test-utils';

/**
 * CLAUDE.md #23 — "Never penalise a provider for a platform-side
 * failure. Refund the seeker and pay the provider from reserve."
 *
 * The failure mode this guards against is quiet: an ops person reaches
 * for the ordinary refund path after an outage, the seeker is made
 * whole, and the provider — who did the work — is simply not paid, with
 * nothing in the ledger to show anything went wrong.
 */
describe('platform-failure resolution (reserve-funded)', () => {
  let app: INestApplication;
  let pool: Pool;
  let escrows: EscrowService;

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([MoneyModule]);
      pool = app.get<Pool>(PG_POOL);
      escrows = app.get(EscrowService);
    }
    await resetDatabase(pool);
    await seedFeeSchedule(pool, 'INR', 1500); // 15%
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  async function heldEscrow(amountPaise: bigint) {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    const escrow = await escrows.hold({
      engagementId,
      seekerId,
      providerId,
      currency: 'INR',
      amountPaise,
      idempotencyKey: `hold:${engagementId}`,
    });
    return { escrow, seekerId, providerId };
  }

  it('refunds the seeker in full AND pays the provider from reserve, taking no fee', async () => {
    const { escrow, providerId } = await heldEscrow(100_000n); // ₹1,000, fee would be ₹150

    const resolved = await escrows.resolvePlatformFailure({
      escrowId: escrow.id,
      idempotencyKey: `platform-failure:${escrow.id}`,
      failureDetail: 'SFU outage — session never connected',
    });
    expect(resolved.status).toBe('refunded');

    const escrowAccountId = await findAccountId(pool, 'escrow', null, 'INR');
    const paAccountId = await findAccountId(pool, 'payment_aggregator', null, 'INR');
    const providerAccountId = await findAccountId(pool, 'provider_wallet', providerId, 'INR');
    const reserveAccountId = await findAccountId(pool, 'reserve', null, 'INR');
    const feeAccountId = await findAccountId(pool, 'platform_fee_revenue', null, 'INR');

    // Seeker made whole: everything held went back out through the aggregator.
    expect(await accountBalance(pool, escrowAccountId!, 'INR')).toBe(0n);
    expect(await accountBalance(pool, paAccountId!, 'INR')).toBe(0n);

    // Provider paid what they would have earned — 100,000 less the 15% fee.
    expect(await accountBalance(pool, providerAccountId!, 'INR')).toBe(85_000n);

    // ...funded by the platform, not by the seeker's money.
    expect(await accountBalance(pool, reserveAccountId!, 'INR')).toBe(-85_000n);

    // We failed, so we do not bill for it. The fee account is untouched.
    expect(feeAccountId === null ? 0n : await accountBalance(pool, feeAccountId, 'INR')).toBe(0n);
  });

  it('books the whole resolution as ONE balanced transaction, so a crash cannot pay only one party', async () => {
    const { escrow } = await heldEscrow(60_000n);
    await escrows.resolvePlatformFailure({
      escrowId: escrow.id,
      idempotencyKey: `platform-failure:${escrow.id}`,
      failureDetail: 'recording lost',
    });

    const txs = await pool.query<{ id: string }>(
      `SELECT id FROM ledger_transactions WHERE reason = 'platform_failure_resolution' AND reference_id = $1`,
      [escrow.id],
    );
    expect(txs.rows).toHaveLength(1);

    const entries = await pool.query<{ n: string; total: string }>(
      `SELECT count(*) AS n, sum(amount_paise)::text AS total FROM ledger_entries WHERE transaction_id = $1`,
      [txs.rows[0].id],
    );
    expect(Number(entries.rows[0].n)).toBe(4); // escrow -> PA, reserve -> provider
    expect(entries.rows[0].total).toBe('0');
  });

  it('records both a refund and a payout against the same escrow', async () => {
    const { escrow, providerId, } = await heldEscrow(40_000n);
    await escrows.resolvePlatformFailure({
      escrowId: escrow.id,
      idempotencyKey: `platform-failure:${escrow.id}`,
      failureDetail: 'transcript pipeline failure',
    });

    const refund = await pool.query(`SELECT reason, amount_paise FROM refunds WHERE escrow_id = $1`, [escrow.id]);
    expect(refund.rows[0].reason).toBe('platform_failure');
    expect(refund.rows[0].amount_paise).toBe(40_000n); // seeker refunded in full

    const payout = await pool.query(`SELECT provider_id, amount_paise FROM payouts WHERE escrow_id = $1`, [escrow.id]);
    expect(payout.rows[0].provider_id).toBe(providerId);
    expect(payout.rows[0].amount_paise).toBe(34_000n); // 40,000 less 15%

    const events = await pool.query<{ event_type: string }>(
      `SELECT event_type FROM outbox WHERE aggregate_id = $1 ORDER BY event_type`,
      [escrow.id],
    );
    expect(events.rows.map((r) => r.event_type)).toEqual(['escrow.held', 'payout.initiated', 'refund.initiated']);
  });

  it('is idempotent: resolving twice pays the provider once', async () => {
    const { escrow, providerId } = await heldEscrow(20_000n);
    const input = {
      escrowId: escrow.id,
      idempotencyKey: `platform-failure:${escrow.id}`,
      failureDetail: 'outage',
    };

    await escrows.resolvePlatformFailure(input);
    const second = await escrows.resolvePlatformFailure({ ...input, idempotencyKey: `${input.idempotencyKey}-retry` });
    expect(second.status).toBe('refunded');

    const providerAccountId = await findAccountId(pool, 'provider_wallet', providerId, 'INR');
    const reserveAccountId = await findAccountId(pool, 'reserve', null, 'INR');
    expect(await accountBalance(pool, providerAccountId!, 'INR')).toBe(17_000n); // not 34,000
    expect(await accountBalance(pool, reserveAccountId!, 'INR')).toBe(-17_000n);
  });

  it('refuses to resolve an escrow that was already released to the provider', async () => {
    const { escrow } = await heldEscrow(20_000n);
    await escrows.release({ escrowId: escrow.id, idempotencyKey: `release:${escrow.id}` });

    await expect(
      escrows.resolvePlatformFailure({
        escrowId: escrow.id,
        idempotencyKey: `platform-failure:${escrow.id}`,
        failureDetail: 'too late',
      }),
    ).rejects.toMatchObject({ code: 'ESCROW_NOT_REFUNDABLE' });
  });

  it('is reachable over HTTP as its own route, distinct from an ordinary refund', async () => {
    const { escrow, providerId } = await heldEscrow(50_000n);

    const res = await request(app.getHttpServer())
      .post(`/internal/escrows/${escrow.id}/platform-failure`)
      .set('x-actor-id', escrow.seekerId)
      .set('idempotency-key', `pf:${escrow.id}`)
      .send({ failureDetail: 'SFU outage' })
      .expect(201);

    expect(res.body.status).toBe('refunded');
    const providerAccountId = await findAccountId(pool, 'provider_wallet', providerId, 'INR');
    expect(await accountBalance(pool, providerAccountId!, 'INR')).toBe(42_500n);
  });

  it('requires failureDetail — an unexplained reserve draw is not acceptable', async () => {
    const { escrow } = await heldEscrow(10_000n);
    const res = await request(app.getHttpServer())
      .post(`/internal/escrows/${escrow.id}/platform-failure`)
      .set('x-actor-id', escrow.seekerId)
      .set('idempotency-key', `pf-nodetail:${escrow.id}`)
      .send({});
    expect(res.status).toBe(400);
  });
});
