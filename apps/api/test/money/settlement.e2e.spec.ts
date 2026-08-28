import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { EscrowService } from '../../src/modules/money/escrow.service';
import { MoneyModule } from '../../src/modules/money/money.module';
import { signWebhookBody } from '../../src/modules/money/pa/webhook-signature';
import { SettlementService } from '../../src/modules/money/settlement.service';
import { closeTestApp, createTestApp } from '../nest-test-app';
import {
  accountBalance,
  findAccountId,
  resetDatabase,
  seedEngagement,
  seedFeeSchedule,
  seedUsers,
} from '../test-utils';

const SECRET = 'sandbox-webhook-secret-for-tests';

/**
 * TRACKER.md D4: `payout_status`/`refund_status` carried 'settled' and
 * 'failed' and nothing ever transitioned off 'initiated'. Our database
 * said a provider had been paid when nothing had confirmed it.
 *
 * These tests drive the real webhook route end to end — signature
 * included — because the signature IS the authentication on this
 * endpoint and a test that called the service directly would skip the
 * only thing protecting it.
 */
describe('M1/D4: payment-aggregator settlement webhooks', () => {
  let app: INestApplication;
  let pool: Pool;
  let escrows: EscrowService;
  let settlement: SettlementService;

  beforeAll(() => {
    // The sandbox aggregator reads this; with no secret it refuses
    // everything, which is its own test below.
    process.env.MONEY_PA_WEBHOOK_SECRET_RAZORPAY = SECRET;
  });

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([MoneyModule]);
      pool = app.get<Pool>(PG_POOL);
      escrows = app.get(EscrowService);
      settlement = app.get(SettlementService);
    }
    await resetDatabase(pool);
    await seedFeeSchedule(pool, 'INR', 1000); // 10%
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
    delete process.env.MONEY_PA_WEBHOOK_SECRET_RAZORPAY;
  });

  /** A real released escrow, so the payout row is the one release() wrote. */
  async function releasedPayout(amountPaise = 100_000n): Promise<{
    payoutId: string;
    providerId: string;
    seekerId: string;
    netPaise: bigint;
  }> {
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
    await escrows.release({ escrowId: escrow.id, idempotencyKey: `release:${escrow.id}` });
    const res = await pool.query<{ id: string; amount_paise: string }>(
      `SELECT id, amount_paise FROM payouts WHERE escrow_id = $1`,
      [escrow.id],
    );
    return {
      payoutId: res.rows[0].id,
      providerId,
      seekerId,
      netPaise: BigInt(res.rows[0].amount_paise),
    };
  }

  async function refundedRefund(amountPaise = 100_000n): Promise<{ refundId: string; seekerId: string }> {
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
    await escrows.refund({ escrowId: escrow.id, idempotencyKey: `refund:${escrow.id}`, reason: 'test' });
    const res = await pool.query<{ id: string }>(`SELECT id FROM refunds WHERE escrow_id = $1`, [escrow.id]);
    return { refundId: res.rows[0].id, seekerId };
  }

  function post(body: unknown, opts: { secret?: string; signature?: string } = {}) {
    const raw = Buffer.from(JSON.stringify(body), 'utf8');
    const signature = opts.signature ?? signWebhookBody(raw, opts.secret ?? SECRET);
    return request(app.getHttpServer())
      .post('/webhooks/payment-aggregator')
      .set('content-type', 'application/json')
      .set('x-pa-signature', signature)
      .send(raw.toString('utf8'));
  }

  describe('authentication — the signature is the only thing guarding this route', () => {
    it('refuses an unsigned webhook', async () => {
      const { payoutId } = await releasedPayout();
      const res = await request(app.getHttpServer())
        .post('/webhooks/payment-aggregator')
        .set('content-type', 'application/json')
        .send({ eventId: 'evt-unsigned', targetType: 'payout', targetId: payoutId, outcome: 'settled' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('PA_WEBHOOK_SIGNATURE_INVALID');
      const payout = await pool.query(`SELECT status FROM payouts WHERE id = $1`, [payoutId]);
      expect(payout.rows[0].status).toBe('initiated'); // untouched
    });

    it('refuses a webhook signed with the wrong secret', async () => {
      const { payoutId } = await releasedPayout();
      const res = await post(
        { eventId: 'evt-wrong-secret', targetType: 'payout', targetId: payoutId, outcome: 'settled' },
        { secret: 'not-the-secret' },
      );
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('PA_WEBHOOK_SIGNATURE_INVALID');
    });

    it('refuses a valid signature over a DIFFERENT body', async () => {
      // The whole point of signing raw bytes: swapping the target after
      // signing must not verify.
      const { payoutId } = await releasedPayout();
      const signedFor = Buffer.from(
        JSON.stringify({ eventId: 'evt-a', targetType: 'payout', targetId: payoutId, outcome: 'failed' }),
        'utf8',
      );
      const res = await post(
        { eventId: 'evt-a', targetType: 'payout', targetId: payoutId, outcome: 'settled' },
        { signature: signWebhookBody(signedFor, SECRET) },
      );
      expect(res.status).toBe(401);
    });

    it('fails closed when no secret is configured at all', async () => {
      const saved = process.env.MONEY_PA_WEBHOOK_SECRET_RAZORPAY;
      delete process.env.MONEY_PA_WEBHOOK_SECRET_RAZORPAY;
      try {
        const { payoutId } = await releasedPayout();
        const res = await post({
          eventId: 'evt-no-secret',
          targetType: 'payout',
          targetId: payoutId,
          outcome: 'settled',
        });
        expect(res.status).toBe(401);
      } finally {
        process.env.MONEY_PA_WEBHOOK_SECRET_RAZORPAY = saved;
      }
    });

    it('needs no session — the caller is a machine, not a user', async () => {
      // No Authorization header anywhere in this suite. The global
      // AuthGuard is default-deny, so this proves @Public() is in place
      // AND that the signature check still ran.
      const { payoutId } = await releasedPayout();
      const res = await post({
        eventId: 'evt-no-session',
        targetType: 'payout',
        targetId: payoutId,
        outcome: 'settled',
      });
      expect(res.status).toBe(201);
    });
  });

  describe('payout settlement', () => {
    it('settles a payout and moves the money off the provider wallet', async () => {
      const { payoutId, providerId, netPaise } = await releasedPayout();

      const providerAccountId = await findAccountId(pool, 'provider_wallet', providerId, 'INR');
      expect(await accountBalance(pool, providerAccountId!, 'INR')).toBe(netPaise); // owed

      const res = await post({
        eventId: 'evt-settle-1',
        targetType: 'payout',
        targetId: payoutId,
        outcome: 'settled',
        paReference: 'rzp_transfer_abc',
      });
      expect(res.status).toBe(201);
      expect(res.body.applied).toBe(true);

      const payout = await pool.query<{
        status: string;
        settled_at: Date;
        settlement_transaction_id: string;
        pa_reference: string;
      }>(`SELECT * FROM payouts WHERE id = $1`, [payoutId]);
      expect(payout.rows[0].status).toBe('settled');
      expect(payout.rows[0].settled_at).not.toBeNull();
      expect(payout.rows[0].settlement_transaction_id).not.toBeNull();
      expect(payout.rows[0].pa_reference).toBe('rzp_transfer_abc');

      // The liability is discharged: money left our books via the PA.
      expect(await accountBalance(pool, providerAccountId!, 'INR')).toBe(0n);
    });

    it('records a failed payout WITHOUT posting to the ledger', async () => {
      const { payoutId, providerId, netPaise } = await releasedPayout();
      const providerAccountId = await findAccountId(pool, 'provider_wallet', providerId, 'INR');
      const entriesBefore = await pool.query(`SELECT count(*) FROM ledger_entries`);

      const res = await post({
        eventId: 'evt-fail-1',
        targetType: 'payout',
        targetId: payoutId,
        outcome: 'failed',
        failureReason: 'bank account closed',
      });
      expect(res.status).toBe(201);

      const payout = await pool.query<{ status: string; failure_reason: string }>(
        `SELECT * FROM payouts WHERE id = $1`,
        [payoutId],
      );
      expect(payout.rows[0].status).toBe('failed');
      expect(payout.rows[0].failure_reason).toBe('bank account closed');

      // The money never left provider_wallet, so it is still owed and
      // the ledger already says so. Inventing a reversal here would
      // record a movement that did not happen.
      const entriesAfter = await pool.query(`SELECT count(*) FROM ledger_entries`);
      expect(entriesAfter.rows[0].count).toBe(entriesBefore.rows[0].count);
      expect(await accountBalance(pool, providerAccountId!, 'INR')).toBe(netPaise);
    });

    it('refuses a webhook naming a payout that does not exist', async () => {
      const res = await post({
        eventId: 'evt-missing',
        targetType: 'payout',
        targetId: '00000000-0000-0000-0000-000000000000',
        outcome: 'settled',
      });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('SETTLEMENT_TARGET_NOT_FOUND');
    });
  });

  describe('refund settlement', () => {
    it('settles a refund without a further ledger posting', async () => {
      const { refundId } = await refundedRefund();
      const entriesBefore = await pool.query(`SELECT count(*) FROM ledger_entries`);

      const res = await post({
        eventId: 'evt-refund-ok',
        targetType: 'refund',
        targetId: refundId,
        outcome: 'settled',
      });
      expect(res.status).toBe(201);

      const refund = await pool.query<{ status: string; settlement_transaction_id: string | null }>(
        `SELECT * FROM refunds WHERE id = $1`,
        [refundId],
      );
      expect(refund.rows[0].status).toBe('settled');
      // refund() already posted escrow -> payment_aggregator at initiation.
      expect(refund.rows[0].settlement_transaction_id).toBeNull();
      const entriesAfter = await pool.query(`SELECT count(*) FROM ledger_entries`);
      expect(entriesAfter.rows[0].count).toBe(entriesBefore.rows[0].count);
    });

    it('moves a FAILED refund to the seeker wallet — the debt is to a person, not a clearing account', async () => {
      const { refundId, seekerId } = await refundedRefund(100_000n);

      const res = await post({
        eventId: 'evt-refund-fail',
        targetType: 'refund',
        targetId: refundId,
        outcome: 'failed',
        failureReason: 'card expired',
      });
      expect(res.status).toBe(201);

      const seekerAccountId = await findAccountId(pool, 'seeker_wallet', seekerId, 'INR');
      expect(seekerAccountId).not.toBeNull();
      expect(await accountBalance(pool, seekerAccountId!, 'INR')).toBe(100_000n);

      const refund = await pool.query<{ status: string; settlement_transaction_id: string }>(
        `SELECT * FROM refunds WHERE id = $1`,
        [refundId],
      );
      expect(refund.rows[0].status).toBe('failed');
      expect(refund.rows[0].settlement_transaction_id).not.toBeNull();
    });
  });

  describe('replay and ordering — at-least-once is normal traffic, not an anomaly', () => {
    it('applies a redelivered webhook exactly once', async () => {
      const { payoutId, providerId, netPaise } = await releasedPayout();
      const body = {
        eventId: 'evt-replay',
        targetType: 'payout',
        targetId: payoutId,
        outcome: 'settled',
      };

      const first = await post(body);
      expect(first.body.applied).toBe(true);
      const second = await post(body);
      expect(second.status).toBe(201);
      expect(second.body.applied).toBe(false); // recognised, not re-applied

      const providerAccountId = await findAccountId(pool, 'provider_wallet', providerId, 'INR');
      expect(await accountBalance(pool, providerAccountId!, 'INR')).toBe(0n); // not -netPaise
      const txs = await pool.query(`SELECT count(*) FROM ledger_transactions WHERE reason = 'payout_settled'`);
      expect(Number(txs.rows[0].count)).toBe(1);
      const events = await pool.query(`SELECT count(*) FROM pa_webhook_events`);
      expect(Number(events.rows[0].count)).toBe(1);
      expect(netPaise).toBeGreaterThan(0n);
    });

    it('refuses to overturn a settled payout with a later failure event', async () => {
      const { payoutId } = await releasedPayout();
      await post({ eventId: 'evt-s', targetType: 'payout', targetId: payoutId, outcome: 'settled' });

      // A different event id, so this is not a redelivery — it is a
      // contradiction, and it needs a human rather than silent handling.
      const res = await post({
        eventId: 'evt-f',
        targetType: 'payout',
        targetId: payoutId,
        outcome: 'failed',
        failureReason: 'late reversal',
      });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SETTLEMENT_ALREADY_TERMINAL');

      const payout = await pool.query<{ status: string }>(`SELECT status FROM payouts WHERE id = $1`, [payoutId]);
      expect(payout.rows[0].status).toBe('settled');
    });

    it('rolls the whole webhook back when applying it fails', async () => {
      // The event row is written before it is applied; if applying
      // throws, neither must survive — otherwise a retry would be
      // treated as a duplicate of something that never happened.
      const res = await post({
        eventId: 'evt-rollback',
        targetType: 'payout',
        targetId: '00000000-0000-0000-0000-000000000000',
        outcome: 'settled',
      });
      expect(res.status).toBe(404);

      const events = await pool.query(`SELECT count(*) FROM pa_webhook_events WHERE pa_event_id = 'evt-rollback'`);
      expect(Number(events.rows[0].count)).toBe(0);
    });
  });

  describe('malformed bodies', () => {
    it.each([
      ['not a settlement event', { eventId: 'x', targetType: 'invoice', targetId: 'y', outcome: 'settled' }],
      ['no event id', { targetType: 'payout', targetId: 'y', outcome: 'settled' }],
      ['unknown outcome', { eventId: 'x', targetType: 'payout', targetId: 'y', outcome: 'pending' }],
      ['a failure with no reason', { eventId: 'x', targetType: 'payout', targetId: 'y', outcome: 'failed' }],
    ])('rejects %s', async (_label, body) => {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PA_WEBHOOK_MALFORMED');
    });
  });

  it('is reachable through the service directly, for the relay to call later', async () => {
    // The outbox relay (still unbuilt) will need this seam too.
    const { payoutId } = await releasedPayout();
    const raw = Buffer.from(
      JSON.stringify({ eventId: 'evt-direct', targetType: 'payout', targetId: payoutId, outcome: 'settled' }),
      'utf8',
    );
    const result = await settlement.handleWebhook({
      rawBody: raw,
      signature: signWebhookBody(raw, SECRET),
    });
    expect(result).toMatchObject({ applied: true, targetType: 'payout', outcome: 'settled' });
  });
});
