import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { AgendaService } from '../../src/modules/agenda/agenda.service';
import { AgendaModule } from '../../src/modules/agenda/agenda.module';
import { DomainManifestService } from '../../src/modules/domains/domain-manifest.service';
import { DomainsModule } from '../../src/modules/domains/domains.module';
import { FamilyManifestService } from '../../src/modules/domains/family-manifest.service';
import { EngagementsService } from '../../src/modules/engagements/engagements.service';
import { EngagementsModule } from '../../src/modules/engagements/engagements.module';
import { MoneyModule } from '../../src/modules/money/money.module';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { accountBalance, findAccountId, resetDatabase, seedFeeSchedule, seedUsers } from '../test-utils';
import { domainManifestV1, familyManifestV1 } from '../domains/manifest-fixtures';

/**
 * `payIntoEscrow` — the step the product had no way to take.
 *
 * `EscrowService.hold` was correct and tested, but its only HTTP caller
 * was an `@Roles('admin')` route under `internal/escrows`. So an
 * engagement a real seeker created could never be funded, and every
 * "completed" engagement in the seed had been fabricated by a script
 * calling the service directly.
 *
 * These tests are mostly about what this method REFUSES, because that is
 * where the money risk lives: the amount must come from the row, the
 * payer must be the seeker, and nothing may be charged before the goals
 * are fixed.
 */
describe('the seeker pays into escrow', () => {
  let app: INestApplication;
  let pool: Pool;
  let engagements: EngagementsService;
  let agendas: AgendaService;
  let categoryId: string;

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([DomainsModule, EngagementsModule, AgendaModule, MoneyModule]);
      pool = app.get<Pool>(PG_POOL);
      engagements = app.get(EngagementsService);
      agendas = app.get(AgendaService);
    }
    await resetDatabase(pool);
    await seedFeeSchedule(pool);

    await app.get(FamilyManifestService).publish(familyManifestV1());
    await app.get(DomainManifestService).publish(domainManifestV1());
    const gs = await pool.query<{ id: string }>(
      `SELECT id FROM categories WHERE domain_code = 'uppsc' AND active ORDER BY slug LIMIT 1`,
    );
    categoryId = gs.rows[0].id;
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  /** An engagement agreed and with a locked agenda — ready to be paid for. */
  async function readyToPay(amountPaise = 100_000n) {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagement = await engagements.createDraft({
      seekerId,
      providerId,
      domainCode: 'uppsc',
      categoryId,
      engagementType: 'document_review',
      currency: 'INR',
      amountPaise,
      language: 'hi',
    });
    await engagements.agree(engagement.id);
    const agenda = await agendas.createDraft({
      engagementId: engagement.id,
      originalLang: 'hi',
      expectedDeliverable: 'Annotated answer',
      successCriteria: 'Two concrete fixes named',
      items: [{ labelLang: 'hi', labelText: 'संरचना की समीक्षा करें' }],
    });
    await agendas.lock(agenda.id);
    return { engagementId: engagement.id, seekerId, providerId };
  }

  it('holds the money and lets the trigger promote the engagement to working', async () => {
    const { engagementId, seekerId } = await readyToPay();

    const result = await engagements.payIntoEscrow({
      engagementId,
      actorId: seekerId,
      idempotencyKey: `pay:${engagementId}`,
    });

    expect(result.escrowId).toBeTruthy();
    // Nothing in payIntoEscrow sets this — `try_promote_engagement_to_working`
    // does, which is why hard rule #12 holds even if this method is bypassed.
    expect(result.engagement.status).toBe('working');

    const escrowAccount = await findAccountId(pool, 'escrow', null, 'INR');
    expect(await accountBalance(pool, escrowAccount!, 'INR')).toBe(100_000n);
  });

  it('charges the amount on the ENGAGEMENT, whatever the caller hoped', async () => {
    // The method takes no amount at all — this asserts the shape that makes
    // "pay ₹1 for a ₹1,500 engagement" unrepresentable rather than merely
    // validated against.
    const { engagementId, seekerId } = await readyToPay(150_000n);
    await engagements.payIntoEscrow({
      engagementId,
      actorId: seekerId,
      idempotencyKey: `pay:${engagementId}`,
    });

    const escrow = await pool.query<{ amount_paise: string }>(
      `SELECT amount_paise FROM escrows WHERE engagement_id = $1`,
      [engagementId],
    );
    expect(BigInt(escrow.rows[0].amount_paise)).toBe(150_000n);
  });

  it('refuses a payer who is not this engagement\'s seeker, and does not confirm it exists', async () => {
    const { engagementId, providerId } = await readyToPay();

    // The provider is a party to this engagement, and still gets NOT_FOUND
    // rather than FORBIDDEN — the id is not confirmed to anyone who is not
    // the payer.
    await expect(
      engagements.payIntoEscrow({
        engagementId,
        actorId: providerId,
        idempotencyKey: `pay:${engagementId}`,
      }),
    ).rejects.toMatchObject({ code: 'ENGAGEMENT_NOT_FOUND' });

    const escrow = await pool.query(`SELECT 1 FROM escrows WHERE engagement_id = $1`, [engagementId]);
    expect(escrow.rowCount).toBe(0);
  });

  it('refuses to take money before the agenda is locked', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagement = await engagements.createDraft({
      seekerId,
      providerId,
      domainCode: 'uppsc',
      categoryId,
      engagementType: 'document_review',
      currency: 'INR',
      amountPaise: 100_000n,
      language: 'hi',
    });
    await engagements.agree(engagement.id);
    // Agreed, but no agenda — paying now would be paying for undefined work.
    await expect(
      engagements.payIntoEscrow({
        engagementId: engagement.id,
        actorId: seekerId,
        idempotencyKey: `pay:${engagement.id}`,
      }),
    ).rejects.toMatchObject({ code: 'AGENDA_NOT_LOCKED' });
  });

  it('refuses a draft — terms have to be agreed first', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagement = await engagements.createDraft({
      seekerId,
      providerId,
      domainCode: 'uppsc',
      categoryId,
      engagementType: 'document_review',
      currency: 'INR',
      amountPaise: 100_000n,
      language: 'hi',
    });
    await expect(
      engagements.payIntoEscrow({
        engagementId: engagement.id,
        actorId: seekerId,
        idempotencyKey: `pay:${engagement.id}`,
      }),
    ).rejects.toMatchObject({ code: 'ENGAGEMENT_WRONG_STATUS' });
  });

  it('does not charge twice when the same payment is retried', async () => {
    const { engagementId, seekerId } = await readyToPay();
    const key = `pay:${engagementId}`;

    const first = await engagements.payIntoEscrow({ engagementId, actorId: seekerId, idempotencyKey: key });
    const second = await engagements.payIntoEscrow({ engagementId, actorId: seekerId, idempotencyKey: key });

    expect(second.escrowId).toBe(first.escrowId);
    const escrowAccount = await findAccountId(pool, 'escrow', null, 'INR');
    // The balance is the thing that matters: two calls, one charge.
    expect(await accountBalance(pool, escrowAccount!, 'INR')).toBe(100_000n);
  });
});
