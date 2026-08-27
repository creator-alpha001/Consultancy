import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { EscrowService } from '../../src/modules/money/escrow.service';
import { LedgerService } from '../../src/modules/money/ledger.service';
import { MoneyModule } from '../../src/modules/money/money.module';
import { PAYMENT_AGGREGATOR, PaymentAggregator } from '../../src/modules/money/pa/payment-aggregator.interface';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { resetDatabase, seedEngagement, seedFeeSchedule, seedUsers } from '../test-utils';

/**
 * CLAUDE.md's Definition of Done requires an API test for every
 * documented error code. These assert the *envelope and the code*, not
 * the message — `code` is the contract clients switch on, `message` is
 * localised and never parsed.
 *
 * The thing being prevented: a money client that cannot tell "already
 * refunded, stop" from "server crashed, retry" will retry a payment it
 * should not.
 */
describe('money error codes', () => {
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
    await seedFeeSchedule(pool, 'INR', 1500);
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  async function heldEscrowId(): Promise<{ escrowId: string; seekerId: string }> {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    const escrow = await escrows.hold({
      engagementId,
      seekerId,
      providerId,
      currency: 'INR',
      amountPaise: 50_000n,
      idempotencyKey: `hold:${engagementId}`,
    });
    return { escrowId: escrow.id, seekerId };
  }

  it('ESCROW_NOT_FOUND — 404 with the envelope', async () => {
    const { seekerId } = await seedUsers(pool);
    const missingId = '00000000-0000-0000-0000-000000000000';

    const res = await request(app.getHttpServer())
      .post(`/internal/escrows/${missingId}/release`)
      .set('x-actor-id', seekerId)
      .set('idempotency-key', 'missing-escrow')
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ESCROW_NOT_FOUND');
    expect(res.body.error.detail.escrowId).toBe(missingId);
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('ESCROW_NOT_RELEASABLE — 409, and says which status blocked it', async () => {
    const { escrowId, seekerId } = await heldEscrowId();
    await escrows.refund({ escrowId, idempotencyKey: `refund:${escrowId}`, reason: 'mutual_cancellation' });

    const res = await request(app.getHttpServer())
      .post(`/internal/escrows/${escrowId}/release`)
      .set('x-actor-id', seekerId)
      .set('idempotency-key', `release-after-refund:${escrowId}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ESCROW_NOT_RELEASABLE');
    expect(res.body.error.detail.escrowStatus).toBe('refunded');
  });

  it('ESCROW_NOT_REFUNDABLE — 409 once the money has gone to the provider', async () => {
    const { escrowId, seekerId } = await heldEscrowId();
    await escrows.release({ escrowId, idempotencyKey: `release:${escrowId}` });

    const res = await request(app.getHttpServer())
      .post(`/internal/escrows/${escrowId}/refund`)
      .set('x-actor-id', seekerId)
      .set('idempotency-key', `refund-after-release:${escrowId}`)
      .send({ reason: 'dispute_ruling' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ESCROW_NOT_REFUNDABLE');
    expect(res.body.error.detail.escrowStatus).toBe('released');
  });

  it('NO_FEE_SCHEDULE — a config gap surfaces as its own code, not a generic 500', async () => {
    await pool.query(`DELETE FROM fee_schedules`); // no schedule covers now
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);

    const res = await request(app.getHttpServer())
      .post(`/internal/escrows/${engagementId}/hold`)
      .set('x-actor-id', seekerId)
      .set('idempotency-key', `hold-no-fees:${engagementId}`)
      .send({ seekerId, providerId, currency: 'INR', amountPaise: 10_000 });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('NO_FEE_SCHEDULE');
    expect(res.body.error.detail.currency).toBe('INR');
  });

  it('LEDGER_TRANSACTION_INVALID — a one-sided transaction is refused before it reaches the DB', async () => {
    const ledger = app.get(LedgerService);
    const client = await pool.connect();
    try {
      await expect(
        ledger.postTransaction(client, {
          idempotencyKey: 'one-sided',
          reason: 'test',
          entries: [{ accountId: '00000000-0000-0000-0000-000000000000', currency: 'INR', amountPaise: 1n }],
        }),
      ).rejects.toMatchObject({ code: 'LEDGER_TRANSACTION_INVALID' });
    } finally {
      client.release();
    }
  });
});

describe('money error codes — payment aggregator failure', () => {
  let app: INestApplication;
  let pool: Pool;

  /** Stands in for a declined capture: the one PA outcome the sandbox adapters never produce. */
  const decliningAggregator: PaymentAggregator = {
    code: 'razorpay_route',
    async captureOrder() {
      return { paReference: 'declined', status: 'failed' };
    },
    async transferToProvider() {
      return { paReference: 'x', status: 'succeeded' };
    },
    async refundToSeeker() {
      return { paReference: 'x', status: 'succeeded' };
    },
  };

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([MoneyModule], [{ token: PAYMENT_AGGREGATOR, useValue: decliningAggregator }]);
      pool = app.get<Pool>(PG_POOL);
    }
    await resetDatabase(pool);
    await seedFeeSchedule(pool, 'INR', 1500);
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  it('PAYMENT_CAPTURE_FAILED — 502, and nothing is posted to the ledger', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);

    const res = await request(app.getHttpServer())
      .post(`/internal/escrows/${engagementId}/hold`)
      .set('x-actor-id', seekerId)
      .set('idempotency-key', `hold-declined:${engagementId}`)
      .send({ seekerId, providerId, currency: 'INR', amountPaise: 10_000 });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('PAYMENT_CAPTURE_FAILED');

    // A failed capture must leave no money trail, and the escrow must not
    // claim to be holding funds it never received.
    const entries = await pool.query(`SELECT count(*) AS n FROM ledger_entries`);
    expect(Number(entries.rows[0].n)).toBe(0);
    const escrow = await pool.query<{ status: string }>(`SELECT status FROM escrows WHERE engagement_id = $1`, [engagementId]);
    expect(escrow.rows[0]?.status).toBe('pending');
  });
});
