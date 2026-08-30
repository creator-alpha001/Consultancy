import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { AgendaService } from '../../src/modules/agenda/agenda.service';
import { AgendaModule } from '../../src/modules/agenda/agenda.module';
import { BoardModule } from '../../src/modules/board/board.module';
import { QuestionService } from '../../src/modules/board/question.service';
import { DomainManifestService } from '../../src/modules/domains/domain-manifest.service';
import { DomainsModule } from '../../src/modules/domains/domains.module';
import { FamilyManifestService } from '../../src/modules/domains/family-manifest.service';
import { EngagementsModule } from '../../src/modules/engagements/engagements.module';
import { EngagementsService } from '../../src/modules/engagements/engagements.service';
import { EscrowService } from '../../src/modules/money/escrow.service';
import { MoneyModule } from '../../src/modules/money/money.module';
import { SessionService } from '../../src/modules/sessions/session.service';
import { SessionsModule } from '../../src/modules/sessions/sessions.module';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { resetDatabase, seedAdminUser, seedEngagement, seedFeeSchedule, seedUsers } from '../test-utils';
import { domainManifestV1, familyManifestV1 } from '../domains/manifest-fixtures';

interface AuditRow {
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  subject_type: string;
  subject_id: string | null;
  detail: Record<string, unknown>;
  created_at: Date;
}

/**
 * D46: `audit_log` records *who decided*, for the decisions where that
 * question gets asked months later.
 *
 * The ledger already proves money moved and in what direction. What it
 * cannot answer is "who released this escrow" — a ledger transaction has
 * a reason code, not a person. These tests pin that gap closed for every
 * escrow outcome, for a moderation override, and for recording consent.
 */
describe('audit coverage for consequential actions', () => {
  let app: INestApplication;
  let pool: Pool;
  let escrows: EscrowService;
  let engagements: EngagementsService;
  let agendas: AgendaService;
  let sessions: SessionService;
  let questions: QuestionService;
  let families: FamilyManifestService;
  let domains: DomainManifestService;
  let categoryId: string;

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([DomainsModule, EngagementsModule, AgendaModule, MoneyModule, SessionsModule, BoardModule]);
      pool = app.get<Pool>(PG_POOL);
      escrows = app.get(EscrowService);
      engagements = app.get(EngagementsService);
      agendas = app.get(AgendaService);
      sessions = app.get(SessionService);
      questions = app.get(QuestionService);
      families = app.get(FamilyManifestService);
      domains = app.get(DomainManifestService);
    }
    await resetDatabase(pool);
    await seedFeeSchedule(pool, 'INR', 1500);
    await families.publish(familyManifestV1());
    await domains.publish(domainManifestV1());
    const gs = await pool.query<{ id: string }>(`SELECT id FROM categories WHERE domain_code = 'uppsc' AND slug = 'gs'`);
    categoryId = gs.rows[0].id;
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  async function entriesFor(subjectId: string): Promise<AuditRow[]> {
    const res = await pool.query<AuditRow>(
      `SELECT * FROM audit_log WHERE subject_id = $1 ORDER BY created_at ASC, action ASC`,
      [subjectId],
    );
    return res.rows;
  }

  async function heldEscrow(actorId?: string): Promise<{ escrowId: string; seekerId: string; providerId: string; engagementId: string }> {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    const escrow = await escrows.hold({
      engagementId,
      seekerId,
      providerId,
      currency: 'INR',
      amountPaise: 100_000n,
      idempotencyKey: `hold:${engagementId}`,
      actorId: actorId ?? seekerId,
      actorRole: 'seeker',
    });
    return { escrowId: escrow.id, seekerId, providerId, engagementId };
  }

  it('records who held an escrow, and never twice for a retried hold', async () => {
    const { escrowId, seekerId, engagementId } = await heldEscrow();

    const entries = await entriesFor(escrowId);
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('escrow.held');
    expect(entries[0].actor_id).toBe(seekerId);
    expect(entries[0].actor_role).toBe('seeker');
    expect(entries[0].detail.engagementId).toBe(engagementId);
    // Money in the log is paise as a string, never a float — the entry
    // is read as evidence and must survive JSON exactly.
    expect(entries[0].detail.amountPaise).toBe('100000');
    expect(entries[0].detail.platformFeePaise).toBe('15000');

    // Holding again is an idempotent no-op. An audit log that gained a
    // line every time a client retried would be unreadable, and would
    // suggest a second hold that never happened.
    await escrows.hold({
      engagementId,
      seekerId,
      providerId: seekerId,
      currency: 'INR',
      amountPaise: 100_000n,
      idempotencyKey: `hold:${engagementId}`,
      actorId: seekerId,
    });
    expect(await entriesFor(escrowId)).toHaveLength(1);
  });

  it('records who released an escrow, with the split it produced', async () => {
    const { escrowId, providerId, seekerId } = await heldEscrow();

    await escrows.release({
      escrowId,
      idempotencyKey: `release:${escrowId}`,
      actorId: seekerId,
      actorRole: 'seeker',
    });

    const released = (await entriesFor(escrowId)).filter((e) => e.action === 'escrow.released');
    expect(released).toHaveLength(1);
    expect(released[0].actor_id).toBe(seekerId);
    expect(released[0].detail.providerId).toBe(providerId);
    expect(released[0].detail.netPaise).toBe('85000');
    expect(released[0].detail.platformFeePaise).toBe('15000');

    // Same rule as the hold: a retried release must not fabricate a
    // second payout in the record.
    await escrows.release({ escrowId, idempotencyKey: `release:${escrowId}`, actorId: seekerId });
    expect((await entriesFor(escrowId)).filter((e) => e.action === 'escrow.released')).toHaveLength(1);
  });

  it('records a refund with its reason, and a platform-failure resolution as its own action', async () => {
    const first = await heldEscrow();
    await escrows.refund({
      escrowId: first.escrowId,
      idempotencyKey: `refund:${first.escrowId}`,
      reason: 'mutual_cancellation',
      actorId: first.seekerId,
      actorRole: 'seeker',
    });
    const refunded = (await entriesFor(first.escrowId)).filter((e) => e.action === 'escrow.refunded');
    expect(refunded).toHaveLength(1);
    expect(refunded[0].detail.reason).toBe('mutual_cancellation');

    // #23: the platform paying for its own failure is not a refund, and
    // must not be readable as one — a reviewer counting refunds against
    // a provider would otherwise count this against them.
    const second = await heldEscrow();
    const admin = await seedAdminUser(pool);
    await escrows.resolvePlatformFailure({
      escrowId: second.escrowId,
      idempotencyKey: `platform-failure:${second.escrowId}`,
      failureDetail: 'SFU dropped the room mid-session',
      actorId: admin,
      actorRole: 'admin',
    });
    const failure = await entriesFor(second.escrowId);
    expect(failure.map((e) => e.action)).toContain('escrow.platform_failure_resolved');
    expect(failure.map((e) => e.action)).not.toContain('escrow.refunded');
    const entry = failure.find((e) => e.action === 'escrow.platform_failure_resolved')!;
    expect(entry.actor_id).toBe(admin);
    expect(entry.detail.fundedFrom).toBe('reserve');
    expect(entry.detail.providerDuePaise).toBe('85000');
  });

  it('carries the acting party through the engagement lifecycle to the money entry', async () => {
    // The escrow entry is written by money/, but the person who decided
    // is only known to the caller. This is the plumbing that gets them
    // there — without it every completion would be logged as the
    // platform acting alone.
    const { seekerId, providerId } = await seedUsers(pool);
    const engagement = await engagements.createDraft({
      seekerId, providerId, domainCode: 'uppsc', categoryId,
      engagementType: 'live_session', currency: 'INR', amountPaise: 60_000n, language: 'hi',
    });
    await engagements.agree(engagement.id);
    const agenda = await agendas.createDraft({
      engagementId: engagement.id, originalLang: 'hi',
      expectedDeliverable: 'Feedback', successCriteria: 'Three points',
      items: [{ labelLang: 'hi', labelText: 'परिचय' }],
    });
    void agenda; // left unlocked on purpose: cancel() is the pre-work exit
    const escrow = await escrows.hold({
      engagementId: engagement.id, seekerId, providerId, currency: 'INR',
      amountPaise: 60_000n, idempotencyKey: `hold:${engagement.id}`, actorId: seekerId, actorRole: 'seeker',
    });

    await engagements.cancel(engagement.id, { actorId: seekerId, actorRole: 'seeker' });

    const refunded = (await entriesFor(escrow.id)).find((e) => e.action === 'escrow.refunded');
    expect(refunded?.actor_id).toBe(seekerId);
    expect(refunded?.actor_role).toBe('seeker');
  });

  it('keeps the sequence of recording decisions that the consent row overwrites', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagement = await engagements.createDraft({
      seekerId, providerId, domainCode: 'uppsc', categoryId,
      engagementType: 'live_session', currency: 'INR', amountPaise: 40_000n, language: 'hi',
    });
    const session = await sessions.schedule({
      engagementId: engagement.id, seekerId, providerId,
      scheduledStart: new Date(Date.now() + 3_600_000),
      scheduledEnd: new Date(Date.now() + 7_200_000),
      timezone: 'Asia/Kolkata',
    });

    await sessions.recordConsent(session.id, seekerId, true);
    await sessions.recordConsent(session.id, seekerId, false);

    // `session_consents` upserts, so it now holds one row saying "no".
    const row = await pool.query<{ consent_given: boolean }>(
      `SELECT consent_given FROM session_consents WHERE session_id = $1 AND user_id = $2`,
      [session.id, seekerId],
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].consent_given).toBe(false);

    // #21 makes a refusal shift the evidentiary burden, so *when* each
    // decision was made is the fact in dispute. Only the append-only log
    // still holds the consent that was withdrawn.
    const decisions = (await entriesFor(session.id)).map((e) => e.action);
    expect(decisions).toContain('session.recording_consented');
    expect(decisions).toContain('session.recording_refused');
    const consented = (await entriesFor(session.id)).filter((e) => e.action === 'session.recording_consented');
    expect(consented[0].actor_id).toBe(seekerId);
  });

  it('records who published content the screening classifier held', async () => {
    const { seekerId } = await seedUsers(pool);
    const admin = await seedAdminUser(pool);
    const asked = await questions.ask({
      seekerId,
      domainCode: 'uppsc',
      categoryId,
      bodyOriginal: 'Whatsapp me on my number and I will send the paid material',
      bodyLang: 'en',
    });
    expect(asked.question.status).toBe('held_for_review');

    await questions.clearForReview(asked.question.id, { actorId: admin, actorRole: 'admin' });

    const entries = await entriesFor(asked.question.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('moderation.cleared');
    expect(entries[0].actor_id).toBe(admin);
    // The held text itself is not copied into a log more people can read.
    expect(JSON.stringify(entries[0].detail)).not.toContain('Whatsapp');
  });
});
