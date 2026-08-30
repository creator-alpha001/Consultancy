import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { AgendaService } from '../../src/modules/agenda/agenda.service';
import { AgendaModule } from '../../src/modules/agenda/agenda.module';
import { EvaluationService } from '../../src/modules/assessment/evaluation.service';
import { SubmissionService } from '../../src/modules/assessment/submission.service';
import { AssessmentModule } from '../../src/modules/assessment/assessment.module';
import { DomainManifestService } from '../../src/modules/domains/domain-manifest.service';
import { DomainsModule } from '../../src/modules/domains/domains.module';
import { FamilyManifestService } from '../../src/modules/domains/family-manifest.service';
import { EngagementsService } from '../../src/modules/engagements/engagements.service';
import { EngagementsModule } from '../../src/modules/engagements/engagements.module';
import { EscrowService } from '../../src/modules/money/escrow.service';
import { MoneyModule } from '../../src/modules/money/money.module';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { accountBalance, findAccountId, resetDatabase, seedFeeSchedule, seedUsers } from '../test-utils';
import { domainManifestV1, familyManifestV1 } from '../domains/manifest-fixtures';

/**
 * SPEC-PLATFORM.md §18, M3's own done-when bar: "One real evaluation,
 * real money, end to end." This is that test — every module built so
 * far (money, domains, taxonomy, agenda, engagements, assessment)
 * wired together the way the product actually uses them, not through
 * shortcuts the real system wouldn't take.
 */
describe('M3 acceptance: agenda -> lock -> escrow -> deliver -> assess -> complete -> release', () => {
  let app: INestApplication;
  let pool: Pool;
  let families: FamilyManifestService;
  let domains: DomainManifestService;
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
      families = app.get(FamilyManifestService);
      domains = app.get(DomainManifestService);
      engagements = app.get(EngagementsService);
      agendas = app.get(AgendaService);
      escrows = app.get(EscrowService);
      submissions = app.get(SubmissionService);
      evaluations = app.get(EvaluationService);
    }
    await resetDatabase(pool);
    await seedFeeSchedule(pool, 'INR', 1500); // 15%

    await families.publish(familyManifestV1());
    const resolvedDomain = await domains.publish(domainManifestV1());
    void resolvedDomain;
    const gs = await pool.query<{ id: string }>(
      `SELECT id FROM categories WHERE domain_code = 'uppsc' AND slug = 'gs'`,
    );
    categoryId = gs.rows[0].id;
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  it('completes one full document_review engagement end to end, with money moving correctly', async () => {
    const { seekerId, providerId } = await seedUsers(pool);

    // 1. Draft the engagement against a real category, resolved from a real published domain.
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
    expect(engagement.status).toBe('draft');

    // 2. Both parties agree terms — freezes the required-skills snapshot.
    const agreed = await engagements.agree(engagement.id);
    expect(agreed.status).toBe('agreed');
    const requiredSkills = await pool.query(`SELECT skill_id FROM engagement_skills WHERE engagement_id = $1`, [engagement.id]);
    expect(requiredSkills.rows.length).toBeGreaterThan(0); // gs maps to answer_writing.gs.polity + state_gs.up

    // 3. Draft and lock the agenda. Still 'agreed' — escrow isn't held yet.
    const agenda = await agendas.createDraft({
      engagementId: engagement.id,
      originalLang: 'hi',
      expectedDeliverable: 'Annotated answer with a scored rubric',
      successCriteria: 'Seeker can name their three weakest areas',
      items: [
        { labelLang: 'hi', labelText: 'सिद्धांत भाग की समीक्षा करें' },
        { labelLang: 'hi', labelText: 'संरचना पर प्रतिक्रिया दें' },
      ],
    });
    const locked = await agendas.lock(agenda.id);
    expect(locked.lockedAt).not.toBeNull();
    expect(locked.lockedHash).toBeTruthy();
    let current = await engagements.get(engagement.id);
    expect(current.status).toBe('agreed'); // agenda alone isn't enough — hard rule #12

    // 4. Hold escrow. THIS is what flips it to working — both preconditions now met.
    await escrows.hold({
      engagementId: engagement.id,
      seekerId,
      providerId,
      currency: 'INR',
      amountPaise: 100_000n,
      idempotencyKey: `hold:${engagement.id}`,
    });
    current = await engagements.get(engagement.id);
    expect(current.status).toBe('working');

    // 5. Seeker delivers.
    const submission = await submissions.submit({
      engagementId: engagement.id,
      seekerId,
      contentRef: 's3://placeholder/answer-sheet-1.pdf',
      note: 'First attempt at the GS-II polity question',
    });
    current = await engagements.get(engagement.id);
    expect(current.status).toBe('delivered');

    // 6. Provider evaluates — template resolved automatically via the engagement's skills.
    const evaluation = await evaluations.open({
      engagementId: engagement.id,
      providerId,
      submissionId: submission.id,
    });
    expect(evaluation.templateId).not.toBeNull(); // answer_writing.v1, via answer_writing.gs.polity

    await evaluations.addScore({ evaluationId: evaluation.id, dimensionCode: 'content', score: 72 });
    await evaluations.addScore({ evaluationId: evaluation.id, dimensionCode: 'structure', score: 65 });

    const returned = await evaluations.return_(evaluation.id, { overallNote: 'Solid attempt, tighten the intro.' });
    expect(returned.returnedAt).not.toBeNull();
    current = await engagements.get(engagement.id);
    expect(current.status).toBe('assessed');

    // 7. Complete — releases escrow through money/, never touched directly here.
    const completed = await engagements.complete(engagement.id);
    expect(completed.status).toBe('completed');

    const escrowAccountId = await findAccountId(pool, 'escrow', null, 'INR');
    const providerAccountId = await findAccountId(pool, 'provider_wallet', providerId, 'INR');
    const feeAccountId = await findAccountId(pool, 'platform_fee_revenue', null, 'INR');
    expect(await accountBalance(pool, escrowAccountId!, 'INR')).toBe(0n);
    expect(await accountBalance(pool, providerAccountId!, 'INR')).toBe(85_000n); // 100,000 - 15%
    expect(await accountBalance(pool, feeAccountId!, 'INR')).toBe(15_000n);

    const finalEscrow = await escrows.findByEngagementId(engagement.id);
    expect(finalEscrow?.status).toBe('released');
  });

  /**
   * An evaluation must carry the dimensions it was scored against.
   *
   * Its absence was a live 500 on every completed engagement page: two
   * clients had hand-written types declaring `dimensions`, the API had
   * never sent it, and `.map` on undefined took the page down for both
   * parties — the seeker could not see their marks and the mentor could
   * not see what they had returned. Nothing caught it because no test
   * and no journey opened a page for an engagement that had been marked.
   */
  it('returns the dimensions an evaluation is scored against', async () => {
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
      items: [{ labelLang: 'en', labelText: 'Review structure' }],
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
    const evaluation = await evaluations.open({
      engagementId: engagement.id,
      providerId,
      submissionId: submission.id,
    });

    expect(evaluation.dimensions.length).toBeGreaterThan(0);
    // Labels, not just codes: a client cannot render "content" as
    // something a person reads without them, and core names no dimension.
    expect(evaluation.dimensions.every((d) => d.code && d.labels)).toBe(true);

    // They survive a re-read, which is the path every client actually uses.
    const reread = await evaluations.get(evaluation.id);
    expect(reread.dimensions.map((d) => d.code)).toEqual(evaluation.dimensions.map((d) => d.code));
  });

  it('rejects delivering before the engagement is working', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagement = await engagements.createDraft({
      seekerId,
      providerId,
      domainCode: 'uppsc',
      categoryId,
      engagementType: 'document_review',
      currency: 'INR',
      amountPaise: 50_000n,
      language: 'hi',
    });

    await expect(
      submissions.submit({ engagementId: engagement.id, seekerId, contentRef: 'too-early' }),
    ).rejects.toMatchObject({ code: 'SUBMISSION_WRONG_STATUS' });
  });

  it('rejects returning an evaluation with an unscored dimension', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagement = await engagements.createDraft({
      seekerId, providerId, domainCode: 'uppsc', categoryId, engagementType: 'document_review',
      currency: 'INR', amountPaise: 50_000n, language: 'hi',
    });
    await engagements.agree(engagement.id);
    const agenda = await agendas.createDraft({
      engagementId: engagement.id, originalLang: 'hi',
      expectedDeliverable: 'x', successCriteria: 'y', items: [{ labelLang: 'hi', labelText: 'goal' }],
    });
    await agendas.lock(agenda.id);
    await escrows.hold({ engagementId: engagement.id, seekerId, providerId, currency: 'INR', amountPaise: 50_000n, idempotencyKey: `hold:${engagement.id}` });
    const submission = await submissions.submit({ engagementId: engagement.id, seekerId, contentRef: 'ref' });
    const evaluation = await evaluations.open({ engagementId: engagement.id, providerId, submissionId: submission.id });

    await evaluations.addScore({ evaluationId: evaluation.id, dimensionCode: 'content', score: 50 });
    // 'structure' left unscored.
    await expect(evaluations.return_(evaluation.id)).rejects.toMatchObject({ code: 'EVALUATION_INCOMPLETE' });
  });

  it('cancelling an agreed engagement with escrow already held refunds the seeker in full', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagement = await engagements.createDraft({
      seekerId, providerId, domainCode: 'uppsc', categoryId, engagementType: 'document_review',
      currency: 'INR', amountPaise: 40_000n, language: 'hi',
    });
    await engagements.agree(engagement.id);
    // Escrow held before the agenda is locked — engagement stays 'agreed', per hard rule #12.
    await escrows.hold({ engagementId: engagement.id, seekerId, providerId, currency: 'INR', amountPaise: 40_000n, idempotencyKey: `hold:${engagement.id}` });

    const cancelled = await engagements.cancel(engagement.id);
    expect(cancelled.status).toBe('cancelled');

    const escrow = await escrows.findByEngagementId(engagement.id);
    expect(escrow?.status).toBe('refunded');
    const paAccountId = await findAccountId(pool, 'payment_aggregator', null, 'INR');
    expect(await accountBalance(pool, paAccountId!, 'INR')).toBe(0n); // captured then refunded — net zero
  });
});
