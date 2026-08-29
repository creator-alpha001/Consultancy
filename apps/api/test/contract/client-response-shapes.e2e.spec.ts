import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { AgendaService } from '../../src/modules/agenda/agenda.service';
import { AgendaModule } from '../../src/modules/agenda/agenda.module';
import { AssessmentModule } from '../../src/modules/assessment/assessment.module';
import { EvaluationService } from '../../src/modules/assessment/evaluation.service';
import { SubmissionService } from '../../src/modules/assessment/submission.service';
import { DomainManifestService } from '../../src/modules/domains/domain-manifest.service';
import { DomainsModule } from '../../src/modules/domains/domains.module';
import { FamilyManifestService } from '../../src/modules/domains/family-manifest.service';
import { EngagementsModule } from '../../src/modules/engagements/engagements.module';
import { EngagementsService } from '../../src/modules/engagements/engagements.service';
import { EscrowService } from '../../src/modules/money/escrow.service';
import { MoneyModule } from '../../src/modules/money/money.module';
import { domainManifestV1, familyManifestV1 } from '../domains/manifest-fixtures';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { resetDatabase, seedFeeSchedule, seedUsers } from '../test-utils';

/**
 * The contract the clients actually rely on.
 *
 * `apps/web` and `apps/mobile` hand-write their response types. A
 * hand-written type is an assertion about the API that nothing verifies,
 * and it has now been wrong four times (TRACKER D44) — most damagingly
 * when both clients declared `dimensions` on an evaluation, the API had
 * never sent it, and `.map` on undefined made every completed engagement
 * page a 500 for both parties.
 *
 * Three of those four were invisible until a person opened the page.
 * This file is the mechanism that makes them visible on the API side
 * instead: each entry lists the fields a client destructures, and the
 * test fails the moment the API stops sending one.
 *
 * It deliberately asserts PRESENCE, not an exact key set — adding a
 * field is not a breaking change, removing or renaming one is.
 */
describe('response shapes the clients depend on', () => {
  let app: INestApplication;
  let pool: Pool;
  let engagements: EngagementsService;
  let agendas: AgendaService;
  let escrows: EscrowService;
  let submissions: SubmissionService;
  let evaluations: EvaluationService;
  let categoryId: string;

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([DomainsModule, EngagementsModule, AgendaModule, AssessmentModule, MoneyModule]);
      pool = app.get<Pool>(PG_POOL);
      engagements = app.get(EngagementsService);
      agendas = app.get(AgendaService);
      escrows = app.get(EscrowService);
      submissions = app.get(SubmissionService);
      evaluations = app.get(EvaluationService);
      await app.get(FamilyManifestService).publish(familyManifestV1());
      await app.get(DomainManifestService).publish(domainManifestV1());
    }
    await resetDatabase(pool);
    await seedFeeSchedule(pool, 'INR', 1500);
    await app.get(FamilyManifestService).publish(familyManifestV1());
    await app.get(DomainManifestService).publish(domainManifestV1());
    const gs = await pool.query<{ id: string }>(
      `SELECT id FROM categories WHERE domain_code = 'uppsc' AND slug = 'gs'`,
    );
    categoryId = gs.rows[0].id;
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  function expectFields(value: unknown, fields: string[], what: string): void {
    expect(value, `${what} was null/undefined`).toBeTruthy();
    const obj = value as Record<string, unknown>;
    const missing = fields.filter((f) => !(f in obj));
    expect(missing, `${what} is missing field(s) the clients destructure`).toEqual([]);
  }

  it('an evaluation carries everything a rubric screen renders', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagement = await engagements.createDraft({
      seekerId,
      providerId,
      domainCode: 'uppsc',
      categoryId,
      engagementType: 'document_review',
      currency: 'INR',
      amountPaise: 50_000n,
      language: 'en',
    });
    await engagements.agree(engagement.id);
    const agenda = await agendas.createDraft({
      engagementId: engagement.id,
      originalLang: 'en',
      expectedDeliverable: 'Annotated answer',
      successCriteria: 'Three weakest areas named',
      items: [{ labelLang: 'en', labelText: 'Structure' }],
    });
    await agendas.lock(agenda.id);
    await escrows.hold({
      engagementId: engagement.id,
      seekerId,
      providerId,
      currency: 'INR',
      amountPaise: 50_000n,
      idempotencyKey: `hold:${engagement.id}`,
    });
    const submission = await submissions.submit({
      engagementId: engagement.id,
      seekerId,
      contentRef: 's3://placeholder/a.pdf',
    });

    // Both clients render the submission before marking it.
    expectFields(submission, ['id', 'engagementId', 'contentRef', 'note'], 'submission');

    const evaluation = await evaluations.open({
      engagementId: engagement.id,
      providerId,
      submissionId: submission.id,
    });

    // `dimensions` is the one that was missing. The rest are what the
    // rubric form and the engagement page read off it.
    expectFields(
      evaluation,
      ['id', 'engagementId', 'submissionId', 'providerId', 'templateId', 'dimensions', 'scores', 'overallNote', 'returnedAt'],
      'evaluation',
    );
    expect(Array.isArray(evaluation.dimensions)).toBe(true);
    for (const d of evaluation.dimensions) {
      expectFields(d, ['code', 'labels'], 'evaluation dimension');
    }
  });

  it('an engagement carries the money field the clients read', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagement = await engagements.createDraft({
      seekerId,
      providerId,
      domainCode: 'uppsc',
      categoryId,
      engagementType: 'document_review',
      currency: 'INR',
      amountPaise: 50_000n,
      language: 'en',
    });
    // `agreedPricePaise` vs `amountPaise` was the first instance of D44:
    // the web type named a field the API does not have, and `rupees()`
    // hit BigInt(undefined) on a route the nav links to from every page.
    expectFields(
      engagement,
      ['id', 'seekerId', 'providerId', 'status', 'amountPaise', 'currency', 'engagementType', 'domainCode'],
      'engagement',
    );
    expect('agreedPricePaise' in (engagement as Record<string, unknown>)).toBe(false);
  });

  it('an agenda carries what the lock screen renders', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagement = await engagements.createDraft({
      seekerId,
      providerId,
      domainCode: 'uppsc',
      categoryId,
      engagementType: 'document_review',
      currency: 'INR',
      amountPaise: 50_000n,
      language: 'en',
    });
    await engagements.agree(engagement.id);
    const agenda = await agendas.createDraft({
      engagementId: engagement.id,
      originalLang: 'en',
      expectedDeliverable: 'Annotated answer',
      successCriteria: 'Three weakest areas named',
      items: [{ labelLang: 'en', labelText: 'Structure' }],
    });
    expectFields(
      agenda,
      ['id', 'engagementId', 'items', 'expectedDeliverable', 'successCriteria', 'lockedAt'],
      'agenda',
    );
    expectFields(agenda.items[0], ['id', 'labelText', 'labelLang'], 'agenda item');
  });
});
