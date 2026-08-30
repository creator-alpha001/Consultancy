import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { AgreementService } from '../../src/common/agreements/agreement.service';
import { DomainManifestService } from '../../src/modules/domains/domain-manifest.service';
import { DomainsModule } from '../../src/modules/domains/domains.module';
import { FamilyManifestService } from '../../src/modules/domains/family-manifest.service';
import { EscrowService } from '../../src/modules/money/escrow.service';
import { MoneyModule } from '../../src/modules/money/money.module';
import { SessionExtensionService } from '../../src/modules/sessions/session-extension.service';
import { SessionService } from '../../src/modules/sessions/session.service';
import { SessionsModule } from '../../src/modules/sessions/sessions.module';
import { EngagementsModule } from '../../src/modules/engagements/engagements.module';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { accountBalance, findAccountId, resetDatabase, seedFeeSchedule, seedUsers } from '../test-utils';
import { domainManifestV1, familyManifestV1 } from '../domains/manifest-fixtures';

/**
 * Paid session extensions (SPEC-PLATFORM.md §9).
 *
 * The product decision these tests pin down: an extension is charged as
 * its **own transaction with its own escrow**, so it can be refunded on
 * its own — and the seeker must **accept a recorded agreement** before
 * any money moves.
 *
 * The agreement's wording is family pack data, so what is asserted here
 * is the mechanism (it was shown, it was stored in full, it is tied to
 * this extension), never the words themselves.
 */
describe('paying for more session time', () => {
  let app: INestApplication;
  let pool: Pool;
  let sessions: SessionService;
  let extensions: SessionExtensionService;
  let escrows: EscrowService;
  let agreements: AgreementService;
  let families: FamilyManifestService;
  let domains: DomainManifestService;
  let categoryId: string;

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([DomainsModule, EngagementsModule, MoneyModule, SessionsModule]);
      pool = app.get<Pool>(PG_POOL);
      sessions = app.get(SessionService);
      extensions = app.get(SessionExtensionService);
      escrows = app.get(EscrowService);
      agreements = app.get(AgreementService);
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

  async function liveSession(): Promise<{
    sessionId: string;
    engagementId: string;
    seekerId: string;
    providerId: string;
  }> {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagements = app.get(await import('../../src/modules/engagements/engagements.service')
      .then((m) => m.EngagementsService));
    const engagement = await engagements.createDraft({
      seekerId,
      providerId,
      domainCode: 'uppsc',
      categoryId,
      engagementType: 'live_session',
      currency: 'INR',
      amountPaise: 100_000n,
      language: 'hi',
    });
    const session = await sessions.schedule({
      engagementId: engagement.id,
      seekerId,
      providerId,
      scheduledStart: new Date(Date.now() - 60_000),
      scheduledEnd: new Date(Date.now() + 30 * 60_000),
      timezone: 'Asia/Kolkata',
    });
    await sessions.start(session.id);
    return { sessionId: session.id, engagementId: engagement.id, seekerId, providerId };
  }

  it('charges an extension as its own escrow, beside the engagement’s', async () => {
    const { sessionId, engagementId, seekerId, providerId } = await liveSession();

    // The engagement's own money, held first.
    await escrows.hold({
      engagementId,
      seekerId,
      providerId,
      currency: 'INR',
      amountPaise: 100_000n,
      idempotencyKey: `hold:${engagementId}`,
    });

    const proposed = await extensions.propose({
      sessionId,
      proposedBy: providerId,
      minutes: 15,
      amountPaise: 30_000n,
    });
    await extensions.accept({ extensionId: proposed.id, userId: seekerId, lang: 'hi' });

    // Two escrows on one engagement: the engagement's, and the
    // extension's. This is what "charged separately" means in practice —
    // each can be released or refunded without touching the other.
    const primary = await escrows.findByEngagementId(engagementId);
    const forExtension = await escrows.findByExtensionId(proposed.id);
    expect(primary).not.toBeNull();
    expect(forExtension).not.toBeNull();
    expect(primary!.id).not.toBe(forExtension!.id);
    expect(primary!.amountPaise).toBe(100_000n);
    expect(forExtension!.amountPaise).toBe(30_000n);

    // And the engagement's own lookup still finds the engagement's own
    // escrow, not the extension — the bug this scoping exists to stop.
    expect(primary!.sessionExtensionId).toBeNull();
  });

  it('records the exact agreement text before any money moves', async () => {
    const { sessionId, seekerId, providerId } = await liveSession();
    const proposed = await extensions.propose({
      sessionId,
      proposedBy: providerId,
      minutes: 15,
      amountPaise: 30_000n,
    });

    const accepted = await extensions.accept({ extensionId: proposed.id, userId: seekerId, lang: 'en' });
    expect(accepted.agreementId).not.toBeNull();

    const stored = await pool.query<{
      user_id: string;
      document_code: string;
      document_version: string;
      text_shown: string;
      text_hash: string;
      subject_type: string;
      subject_id: string;
    }>(`SELECT * FROM agreements WHERE id = $1`, [accepted.agreementId]);

    const row = stored.rows[0];
    expect(row.user_id).toBe(seekerId);
    expect(row.document_code).toBe('session_extension');
    expect(row.subject_type).toBe('session_extension');
    expect(row.subject_id).toBe(proposed.id);
    // The FULL text, not a reference to a document that can later be
    // edited: "you accepted v1" is only evidence if v1 is still what it
    // was.
    const pack = await agreements.documentFor('civil_services_exams', 'session_extension', 'en');
    expect(row.text_shown).toBe(pack.text);
    expect(row.document_version).toBe(pack.version);
    expect(row.text_hash).toHaveLength(64);
  });

  it('refuses to let anyone but the seeker accept — it is their money', async () => {
    const { sessionId, seekerId, providerId } = await liveSession();
    const proposed = await extensions.propose({
      sessionId,
      proposedBy: providerId,
      minutes: 15,
      amountPaise: 30_000n,
    });

    await expect(
      extensions.accept({ extensionId: proposed.id, userId: providerId, lang: 'en' }),
    ).rejects.toMatchObject({ code: 'SESSION_EXTENSION_NOT_SEEKER' });

    // Nothing was charged and nothing was agreed on the failed attempt.
    expect(await escrows.findByExtensionId(proposed.id)).toBeNull();
    const agreementRows = await pool.query(`SELECT 1 FROM agreements WHERE subject_id = $1`, [proposed.id]);
    expect(agreementRows.rows).toHaveLength(0);
    void seekerId;
  });

  it('extends the clock by the minutes bought', async () => {
    const { sessionId, seekerId, providerId } = await liveSession();
    const before = await sessions.get(sessionId);

    const proposed = await extensions.propose({
      sessionId,
      proposedBy: providerId,
      minutes: 15,
      amountPaise: 30_000n,
    });
    await extensions.accept({ extensionId: proposed.id, userId: seekerId, lang: 'en' });

    const after = await sessions.get(sessionId);
    const addedMinutes = (after.scheduledEnd.getTime() - before.scheduledEnd.getTime()) / 60_000;
    expect(addedMinutes).toBe(15);
  });

  it('pays the extension out when the session ends, not when the engagement completes', async () => {
    const { sessionId, seekerId, providerId } = await liveSession();
    const proposed = await extensions.propose({
      sessionId,
      proposedBy: providerId,
      minutes: 15,
      amountPaise: 30_000n,
    });
    await extensions.accept({ extensionId: proposed.id, userId: seekerId, lang: 'en' });

    const providerAccount = await findAccountId(pool, 'provider_wallet', providerId, 'INR');
    expect(providerAccount === null ? 0n : await accountBalance(pool, providerAccount, 'INR')).toBe(0n);

    await sessions.end(sessionId);

    // The extra time was delivered when the session ended, so it is paid
    // then — the engagement itself may not complete for days.
    const settled = await extensions.get(proposed.id);
    expect(settled.status).toBe('settled');
    const paid = await findAccountId(pool, 'provider_wallet', providerId, 'INR');
    // 30,000 less the 15% platform fee.
    expect(await accountBalance(pool, paid!, 'INR')).toBe(25_500n);
  });

  it('allows only one open offer at a time', async () => {
    const { sessionId, providerId, seekerId } = await liveSession();
    const first = await extensions.propose({
      sessionId,
      proposedBy: providerId,
      minutes: 15,
      amountPaise: 30_000n,
    });
    // Two open offers would make "accept" ambiguous about which price
    // was agreed, so a second proposal returns the standing one.
    const second = await extensions.propose({
      sessionId,
      proposedBy: seekerId,
      minutes: 30,
      amountPaise: 60_000n,
    });
    expect(second.id).toBe(first.id);
    expect(second.amountPaise).toBe(30_000n);
  });

  it('refuses to add time to a session that is not running', async () => {
    const { sessionId, providerId } = await liveSession();
    await sessions.end(sessionId);
    await expect(
      extensions.propose({ sessionId, proposedBy: providerId, minutes: 15, amountPaise: 30_000n }),
    ).rejects.toMatchObject({ code: 'SESSION_EXTENSION_SESSION_NOT_LIVE' });
  });
});
