import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { AdminModule } from '../../src/modules/admin/admin.module';
import { ReconciliationService } from '../../src/modules/admin/reconciliation.service';
import { EngagementsModule } from '../../src/modules/engagements/engagements.module';
import { EscrowService } from '../../src/modules/money/escrow.service';
import { MoneyModule } from '../../src/modules/money/money.module';
import { authenticate } from '../auth-helpers';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { resetDatabase, seedEngagement, seedFeeSchedule, seedUsers } from '../test-utils';

/**
 * SPEC-PLATFORM.md §18, M9: "reconciliation."
 *
 * A reconciliation suite that only ever proves "clean database reports
 * clean" is worthless — it would pass just as happily if every check
 * were `return null`. So each test here *manufactures* the exact
 * corruption its check exists to catch, and asserts the check finds it.
 */
describe('M9: reconciliation', () => {
  let app: INestApplication;
  let pool: Pool;
  let reconciliation: ReconciliationService;
  let escrows: EscrowService;

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([AdminModule, MoneyModule, EngagementsModule]);
      pool = app.get<Pool>(PG_POOL);
      reconciliation = app.get(ReconciliationService);
      escrows = app.get(EscrowService);
    }
    await resetDatabase(pool);
    await seedFeeSchedule(pool, 'INR', 1500);
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  /** A genuinely healthy engagement with money held, via the real services. */
  async function seedHeldEscrow(amountPaise = 100_000n): Promise<{
    engagementId: string;
    escrowId: string;
    seekerId: string;
    providerId: string;
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
    return { engagementId, escrowId: escrow.id, seekerId, providerId };
  }

  /** Payouts require a real release transaction; reuse the escrow's hold. */
  async function seedPayout(escrowId: string, providerId: string, opts: { ageDays?: number; amountPaise?: number } = {}): Promise<void> {
    const txn = await pool.query<{ hold_transaction_id: string }>(
      `SELECT hold_transaction_id FROM escrows WHERE id = $1`,
      [escrowId],
    );
    await pool.query(
      `INSERT INTO payouts (escrow_id, provider_id, currency, amount_paise, release_transaction_id, pa_provider, created_at)
       VALUES ($1, $2, 'INR', $3, $4, 'razorpay_route', now() - ($5 || ' days')::interval)`,
      [escrowId, providerId, opts.amountPaise ?? 85_000, txn.rows[0].hold_transaction_id, String(opts.ageDays ?? 0)],
    );
  }

  function codes(report: { findings: { code: string }[] }): string[] {
    return report.findings.map((f) => f.code);
  }

  it('reports a clean bill of health on a healthy database', async () => {
    await seedHeldEscrow();
    const report = await reconciliation.run();
    expect(report.ok).toBe(true);
    expect(report.criticalCount).toBe(0);
    expect(codes(report)).not.toContain('LEDGER_DOES_NOT_SUM_TO_ZERO');
  });

  it('catches a ledger that no longer sums to zero — money created from nothing', async () => {
    const { escrowId } = await seedHeldEscrow();
    const account = await pool.query<{ id: string }>(
      `SELECT id FROM ledger_accounts WHERE type = 'escrow' LIMIT 1`,
    );

    // The ledger's own constraint trigger makes this corruption
    // impossible through ordinary SQL — which is exactly why it has to
    // be disabled to test the check. This simulates the real scenario
    // reconciliation exists for: a bug, a bad migration, or a manual
    // fix that bypassed the guard and left the books unbalanced.
    await pool.query(`ALTER TABLE ledger_entries DISABLE TRIGGER USER`);
    try {
      const txn = await pool.query<{ id: string }>(
        `INSERT INTO ledger_transactions (reason, reference_type, reference_id, idempotency_key)
         VALUES ('forged', 'escrow', $1, 'forged-key') RETURNING id`,
        [escrowId],
      );
      await pool.query(
        `INSERT INTO ledger_entries (transaction_id, account_id, currency, amount_paise)
         VALUES ($1, $2, 'INR', 5000)`,
        [txn.rows[0].id, account.rows[0].id],
      );
    } finally {
      await pool.query(`ALTER TABLE ledger_entries ENABLE TRIGGER USER`);
    }

    const report = await reconciliation.run();
    expect(codes(report)).toContain('LEDGER_DOES_NOT_SUM_TO_ZERO');
    expect(codes(report)).toContain('TRANSACTION_DOES_NOT_BALANCE');
    expect(report.ok).toBe(false);
    expect(report.criticalCount).toBeGreaterThan(0);
  });

  it('catches an escrow whose status contradicts its ledger transactions', async () => {
    const { escrowId } = await seedHeldEscrow();
    // Strip the hold transaction: the escrow now claims money it cannot
    // point at.
    await pool.query(`UPDATE escrows SET hold_transaction_id = NULL WHERE id = $1`, [escrowId]);

    const report = await reconciliation.run();
    expect(codes(report)).toContain('ESCROW_LEDGER_MISMATCH');
    const finding = report.findings.find((f) => f.code === 'ESCROW_LEDGER_MISMATCH')!;
    expect(finding.severity).toBe('critical');
    expect(report.ok).toBe(false);
  });

  it('catches money still held for an engagement that already ended', async () => {
    const { engagementId } = await seedHeldEscrow();
    // Drive the engagement to cancelled without resolving the escrow —
    // the shape a crash between the two writes would leave.
    await pool.query(`UPDATE engagements SET status = 'cancelled' WHERE id = $1`, [engagementId]);

    const report = await reconciliation.run();
    expect(codes(report)).toContain('ESCROW_HELD_ON_ENDED_ENGAGEMENT');
    expect(report.ok).toBe(false);
  });

  it('catches an engagement and its escrow disagreeing about completion', async () => {
    const { engagementId } = await seedHeldEscrow();

    // The lifecycle triggers refuse to CREATE this contradiction (they
    // are doing their job), so it has to be forced — which is exactly
    // the scenario reconciliation is for: state that got past the
    // guards, whether through a bug, a bad migration, or a manual fix.
    await pool.query(`ALTER TABLE engagements DISABLE TRIGGER USER`);
    try {
      await pool.query(`UPDATE engagements SET status = 'completed' WHERE id = $1`, [engagementId]);
    } finally {
      await pool.query(`ALTER TABLE engagements ENABLE TRIGGER USER`);
    }
    // 'completed' while the escrow still holds the money is contradictory.
    const report = await reconciliation.run();
    expect(codes(report)).toContain('ESCROW_ENGAGEMENT_STATUS_DIVERGED');
    expect(report.ok).toBe(false);
  });

  it('surfaces payouts stuck at initiated — no settlement webhook ever arrived', async () => {
    const { engagementId, escrowId, providerId } = await seedHeldEscrow();
    await pool.query(`UPDATE engagements SET status = 'agreed' WHERE id = $1`, [engagementId]);
    await seedPayout(escrowId, providerId, { ageDays: 3 });

    const report = await reconciliation.run();
    const finding = report.findings.find((f) => f.code === 'PAYOUT_STUCK_INITIATED');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('warning');
    // A warning, not a critical: nothing is corrupt, but a provider has
    // not been paid and nobody was watching.
    expect(report.ok).toBe(true);
  });

  it('surfaces a negative reserve — TRACKER.md D7, made visible', async () => {
    const { engagementId, escrowId, seekerId, providerId } = await seedHeldEscrow(50_000n);
    void engagementId;
    void seekerId;
    void providerId;

    // A real platform-failure resolution draws on reserve, by design.
    await escrows.resolvePlatformFailure({
      escrowId,
      idempotencyKey: `pf:${escrowId}`,
      failureDetail: 'SFU outage during the session',
    });

    const report = await reconciliation.run();
    expect(codes(report)).toContain('RESERVE_NEGATIVE');
    // Still 'ok': the reserve going negative is the system working as
    // designed (#23), not a corruption. It just must not go unnoticed.
    expect(report.ok).toBe(true);
  });

  it('surfaces outbox events nothing ever dispatched', async () => {
    const { escrowId } = await seedHeldEscrow();
    await pool.query(
      `UPDATE outbox SET created_at = now() - interval '5 days' WHERE aggregate_id = $1`,
      [escrowId],
    );

    const report = await reconciliation.run();
    expect(codes(report)).toContain('OUTBOX_UNRELAYED');
  });

  it('surfaces an idempotency key stranded in flight', async () => {
    // The shape a crashed process leaves behind: claimed, never
    // completed or failed. Every retry of that request is now refused
    // forever, which on a money endpoint pushes the caller toward
    // retrying under a fresh key — the double-charge. See D27.
    const { seekerId } = await seedUsers(pool);
    await pool.query(
      `INSERT INTO idempotency_keys (key, actor_id, endpoint, request_hash, claimed_at)
       VALUES ('stranded', $1, 'POST /internal/escrows/x/hold', 'hash', now() - interval '3 days')`,
      [seekerId],
    );

    const finding = (await reconciliation.run()).findings.find(
      (f) => f.code === 'IDEMPOTENCY_KEY_STUCK_IN_FLIGHT',
    );
    expect(finding).toBeDefined();
    expect(finding!.count).toBe(1);

    // A key that completed normally is not a finding.
    await pool.query(
      `UPDATE idempotency_keys
          SET state = 'completed', response_status = 201, response_body = '{}'::jsonb, completed_at = now()
        WHERE key = 'stranded'`,
    );
    expect(codes(await reconciliation.run())).not.toContain('IDEMPOTENCY_KEY_STUCK_IN_FLIGHT');
  });

  it('surfaces a webhook recorded but never applied', async () => {
    // What a crash mid-apply leaves: the aggregator believes it told us,
    // and the payout row does not know.
    await pool.query(
      `INSERT INTO pa_webhook_events (pa_provider, pa_event_id, event_type, payload, received_at)
       VALUES ('razorpay_route', 'evt-stuck', 'payout.settled', '{}'::jsonb, now() - interval '3 days')`,
    );
    const report = await reconciliation.run();
    expect(codes(report)).toContain('PA_WEBHOOK_UNPROCESSED');
    expect(report.criticalCount).toBeGreaterThan(0);

    await pool.query(`UPDATE pa_webhook_events SET processed_at = now(), outcome = 'applied'`);
    expect(codes(await reconciliation.run())).not.toContain('PA_WEBHOOK_UNPROCESSED');
  });

  it('surfaces a failed payout as money still owed', async () => {
    const { escrowId, providerId } = await seedHeldEscrow();
    await seedPayout(escrowId, providerId, {});
    await pool.query(
      `UPDATE payouts SET status = 'failed', failed_at = now(), failure_reason = 'bank rejected'`,
    );

    const finding = (await reconciliation.run()).findings.find((f) => f.code === 'SETTLEMENT_FAILED_UNRESOLVED');
    expect(finding).toBeDefined();
    expect(finding!.count).toBe(1);
    expect(finding!.samples[0]).toMatchObject({ kind: 'payout', failure_reason: 'bank rejected' });
  });

  it('respects the staleness window rather than flagging everything', async () => {
    const { escrowId, providerId } = await seedHeldEscrow();
    await seedPayout(escrowId, providerId, { ageDays: 3 });

    // Three days old against the default 24h window: stale.
    expect(codes(await reconciliation.run())).toContain('PAYOUT_STUCK_INITIATED');
    // Same row, a 30-day window: not yet worth anyone's attention.
    const lenient = await reconciliation.run({ staleAfterHours: 24 * 30 });
    expect(codes(lenient)).not.toContain('PAYOUT_STUCK_INITIATED');
  });

  it('caps the rows it returns so an ops screen cannot be flooded', async () => {
    // 25 stale payouts; the report should sample, not dump.
    for (let i = 0; i < 25; i++) {
      const { escrowId, providerId } = await seedHeldEscrow();
      await seedPayout(escrowId, providerId, { ageDays: 3, amountPaise: 1000 });
    }
    const finding = (await reconciliation.run()).findings.find((f) => f.code === 'PAYOUT_STUCK_INITIATED')!;
    expect(finding.count).toBe(25);
    expect(finding.samples).toHaveLength(20);
  });

  describe('the ops HTTP surface', () => {
    it('is admin-only, and refuses a seeker and an anonymous caller', async () => {
      await request(app.getHttpServer()).get('/admin/reconciliation').expect(401);

      const seeker = await authenticate(app, 'seeker');
      await request(app.getHttpServer())
        .get('/admin/reconciliation')
        .set('authorization', seeker.bearer)
        .expect(403);
    });

    it('returns the report to a 2FA-authenticated admin', async () => {
      const admin = await authenticate(app, 'admin');
      const res = await request(app.getHttpServer())
        .get('/admin/reconciliation')
        .set('authorization', admin.bearer)
        .expect(200);

      expect(res.body).toHaveProperty('ok');
      expect(res.body).toHaveProperty('findings');
      expect(Array.isArray(res.body.findings)).toBe(true);
    });
  });
});
