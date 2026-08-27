import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { AgendaService } from '../../src/modules/agenda/agenda.service';
import { AgendaModule } from '../../src/modules/agenda/agenda.module';
import { EvaluationService } from '../../src/modules/assessment/evaluation.service';
import { SubmissionService } from '../../src/modules/assessment/submission.service';
import { AssessmentModule } from '../../src/modules/assessment/assessment.module';
import { BoardPostService } from '../../src/modules/board/board-post.service';
import { BoardModule } from '../../src/modules/board/board.module';
import { ProposalService } from '../../src/modules/board/proposal.service';
import { DomainManifestService } from '../../src/modules/domains/domain-manifest.service';
import { DomainsModule } from '../../src/modules/domains/domains.module';
import { FamilyManifestService } from '../../src/modules/domains/family-manifest.service';
import { EngagementsService } from '../../src/modules/engagements/engagements.service';
import { EngagementsModule } from '../../src/modules/engagements/engagements.module';
import { EscrowService } from '../../src/modules/money/escrow.service';
import { MoneyModule } from '../../src/modules/money/money.module';
import { SafetyModule } from '../../src/modules/safety/safety.module';
import { CredentialService } from '../../src/modules/verification/credential.service';
import { VerificationModule } from '../../src/modules/verification/verification.module';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { accountBalance, findAccountId, resetDatabase, seedAdminUser, seedFeeSchedule, seedUsers } from '../test-utils';
import { domainManifestV1, familyManifestV1 } from '../domains/manifest-fixtures';

/**
 * SPEC-PLATFORM.md §18, M6's own done-when bar: "A seeker finds a
 * provider they never met and completes an engagement." This proves the
 * whole chain — an open request, a provider who cannot legally propose
 * rejected by the skill/tier/language gate (closing TRACKER.md's D8), a
 * verified provider whose proposal is accepted into a real engagement,
 * a sibling proposal rejected on award, and that engagement run through
 * M3's full lifecycle to completion.
 */
describe('M6 acceptance: open board post -> eligible proposal -> award -> real engagement -> completion', () => {
  let app: INestApplication;
  let pool: Pool;
  let families: FamilyManifestService;
  let domains: DomainManifestService;
  let boardPosts: BoardPostService;
  let proposals: ProposalService;
  let credentials: CredentialService;
  let engagements: EngagementsService;
  let agendas: AgendaService;
  let escrows: EscrowService;
  let submissions: SubmissionService;
  let evaluations: EvaluationService;
  let gsCategoryId: string;

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([
        DomainsModule,
        EngagementsModule,
        AgendaModule,
        AssessmentModule,
        MoneyModule,
        VerificationModule,
        SafetyModule,
        BoardModule,
      ]);
      pool = app.get<Pool>(PG_POOL);
      families = app.get(FamilyManifestService);
      domains = app.get(DomainManifestService);
      boardPosts = app.get(BoardPostService);
      proposals = app.get(ProposalService);
      credentials = app.get(CredentialService);
      engagements = app.get(EngagementsService);
      agendas = app.get(AgendaService);
      escrows = app.get(EscrowService);
      submissions = app.get(SubmissionService);
      evaluations = app.get(EvaluationService);
    }
    await resetDatabase(pool);
    await seedFeeSchedule(pool, 'INR', 1500);

    await families.publish(familyManifestV1());
    await domains.publish(domainManifestV1());
    const gs = await pool.query<{ id: string }>(`SELECT id FROM categories WHERE domain_code = 'uppsc' AND slug = 'gs'`);
    gsCategoryId = gs.rows[0].id;
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  async function verifyProviderForGs(providerId: string, adminId: string): Promise<void> {
    const submitted = await credentials.submit({
      providerId,
      credentialTypeCode: 'exam_rank',
      domainCode: 'uppsc',
      skillCodes: ['answer_writing.gs.polity', 'state_gs.up'], // gs requires BOTH
      verifierData: { year: 2024, rollNo: 'R2001', claimedName: 'Test Mentor' },
    });
    await credentials.runAutomatedCheck(submitted.id);
    await credentials.decide({ credentialId: submitted.id, reviewerId: adminId, decision: 'verified' });
    await pool.query(`INSERT INTO provider_languages (provider_id, lang_code) VALUES ($1, 'hi')`, [providerId]);
  }

  it('finds a stranger provider, rejects an unqualified one, awards the qualified one, and completes the resulting engagement', async () => {
    await pool.query(
      `INSERT INTO result_list_entries (domain_code, source_code, cycle_year, roll_no, candidate_name, rank, service_allotted)
       VALUES ('uppsc', 'uppsc_results', 2024, 'R2001', 'Test Mentor', 11, 'PCS (Executive)')`,
    );
    const { seekerId } = await seedUsers(pool);
    const { providerId: unqualifiedProviderId } = await seedUsers(pool);
    const { providerId: qualifiedProviderId } = await seedUsers(pool);
    const { providerId: rivalProviderId } = await seedUsers(pool);
    const adminId = await seedAdminUser(pool);

    // 1. Seeker posts an open request — never having met any provider.
    const post = await boardPosts.create({
      seekerId,
      domainCode: 'uppsc',
      categoryId: gsCategoryId,
      engagementType: 'document_review',
      language: 'hi',
      currency: 'INR',
      budgetMinPaise: 6_000n,
      budgetMaxPaise: 20_000n,
      description: 'Need my GS mains answer reviewed',
    });
    expect(post.status).toBe('open');

    // Cross-domain search finds it without a specific domain filter.
    await pool.query(
      `INSERT INTO seeker_domains (seeker_id, domain_code, working_language, active) VALUES ($1, 'uppsc', 'hi', true)`,
      [seekerId],
    );
    const found = await boardPosts.searchOpen({ seekerId });
    expect(found.map((p) => p.id)).toContain(post.id);

    // 2. An unqualified provider (no verified skill at all) cannot propose —
    // the app-level pre-check surfaces a typed error, backed by the DB trigger.
    await expect(
      proposals.submit({ boardPostId: post.id, providerId: unqualifiedProviderId, proposedAmountPaise: 10_000n }),
    ).rejects.toMatchObject({ code: 'PROPOSAL_NOT_ELIGIBLE' });

    // 3. Two independently-verified providers (one verification each, per M4) can propose.
    await verifyProviderForGs(qualifiedProviderId, adminId);
    await verifyProviderForGs(rivalProviderId, adminId);

    const winningProposal = await proposals.submit({
      boardPostId: post.id,
      providerId: qualifiedProviderId,
      message: 'Happy to review this today',
      proposedAmountPaise: 10_000n,
    });
    expect(winningProposal.status).toBe('submitted');

    const rivalProposal = await proposals.submit({
      boardPostId: post.id,
      providerId: rivalProviderId,
      proposedAmountPaise: 9_000n,
    });
    expect(rivalProposal.status).toBe('submitted');

    // 4. Seeker accepts the qualified provider's proposal — a real engagement is born.
    const accepted = await proposals.accept(winningProposal.id, seekerId);
    expect(accepted.status).toBe('accepted');
    expect(accepted.resultingEngagementId).not.toBeNull();

    const awardedPost = await boardPosts.get(post.id);
    expect(awardedPost.status).toBe('awarded');

    // The sibling proposal is rejected automatically, never left dangling.
    const rivalAfter = await proposals.get(rivalProposal.id);
    expect(rivalAfter.status).toBe('rejected');

    // 5. The resulting engagement runs through M3's full lifecycle, same as any other.
    const engagementId = accepted.resultingEngagementId as string;
    let engagement = await engagements.get(engagementId);
    expect(engagement.providerId).toBe(qualifiedProviderId);
    expect(engagement.seekerId).toBe(seekerId);
    expect(engagement.status).toBe('draft');

    const agreed = await engagements.agree(engagementId);
    expect(agreed.status).toBe('agreed');

    const agenda = await agendas.createDraft({
      engagementId,
      originalLang: 'hi',
      expectedDeliverable: 'Annotated GS answer',
      successCriteria: 'Seeker knows their weakest areas',
      items: [{ labelLang: 'hi', labelText: 'संरचना पर प्रतिक्रिया दें' }],
    });
    await agendas.lock(agenda.id);

    await escrows.hold({
      engagementId,
      seekerId,
      providerId: qualifiedProviderId,
      currency: 'INR',
      amountPaise: 10_000n,
      idempotencyKey: `hold:${engagementId}`,
    });
    engagement = await engagements.get(engagementId);
    expect(engagement.status).toBe('working');

    const submission = await submissions.submit({ engagementId, seekerId, contentRef: 's3://placeholder/answer.pdf' });
    const evaluation = await evaluations.open({ engagementId, providerId: qualifiedProviderId, submissionId: submission.id });
    await evaluations.addScore({ evaluationId: evaluation.id, dimensionCode: 'content', score: 70 });
    await evaluations.addScore({ evaluationId: evaluation.id, dimensionCode: 'structure', score: 68 });
    await evaluations.return_(evaluation.id);

    const completed = await engagements.complete(engagementId);
    expect(completed.status).toBe('completed');

    const providerAccountId = await findAccountId(pool, 'provider_wallet', qualifiedProviderId, 'INR');
    expect(await accountBalance(pool, providerAccountId!, 'INR')).toBe(8_500n); // 10,000 - 15%
  });
});
