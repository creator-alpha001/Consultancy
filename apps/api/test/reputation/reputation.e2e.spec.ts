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
import { RankingService } from '../../src/modules/reputation/ranking.service';
import { ReputationModule } from '../../src/modules/reputation/reputation.module';
import { ReviewService } from '../../src/modules/reputation/review.service';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { resetDatabase, seedFeeSchedule, seedUsers } from '../test-utils';
import { domainManifestV1, familyManifestV1 } from '../domains/manifest-fixtures';

/**
 * Per-skill stats and ordering. The assertions that matter most are the
 * negative ones: CLAUDE.md #17 forbids leaderboards, percentiles and
 * peer comparison, so `ProviderSkillStats` must expose a provider's own
 * history and nothing about where they stand relative to anyone else.
 */
describe('reputation: reviews, per-skill stats, ordering', () => {
  let app: INestApplication;
  let pool: Pool;
  let families: FamilyManifestService;
  let domains: DomainManifestService;
  let engagements: EngagementsService;
  let agendas: AgendaService;
  let escrows: EscrowService;
  let submissions: SubmissionService;
  let evaluations: EvaluationService;
  let reviews: ReviewService;
  let ranking: RankingService;
  let categoryId: string;
  let politySkillId: string;

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([
        DomainsModule, EngagementsModule, AgendaModule, AssessmentModule, MoneyModule, ReputationModule,
      ]);
      pool = app.get<Pool>(PG_POOL);
      families = app.get(FamilyManifestService);
      domains = app.get(DomainManifestService);
      engagements = app.get(EngagementsService);
      agendas = app.get(AgendaService);
      escrows = app.get(EscrowService);
      submissions = app.get(SubmissionService);
      evaluations = app.get(EvaluationService);
      reviews = app.get(ReviewService);
      ranking = app.get(RankingService);
    }
    await resetDatabase(pool);
    await seedFeeSchedule(pool, 'INR', 1500);
    await families.publish(familyManifestV1());
    await domains.publish(domainManifestV1());

    const gs = await pool.query<{ id: string }>(`SELECT id FROM categories WHERE domain_code = 'uppsc' AND slug = 'gs'`);
    categoryId = gs.rows[0].id;
    const skill = await pool.query<{ id: string }>(`SELECT id FROM skills WHERE code = 'answer_writing.gs.polity'`);
    politySkillId = skill.rows[0].id;
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  /** Runs one engagement all the way to completed, so it counts in the stats view. */
  async function completeOneEngagement(seekerId: string, providerId: string): Promise<string> {
    const engagement = await engagements.createDraft({
      seekerId, providerId, domainCode: 'uppsc', categoryId,
      engagementType: 'document_review', currency: 'INR', amountPaise: 50_000n, language: 'hi',
    });
    await engagements.agree(engagement.id);
    const agenda = await agendas.createDraft({
      engagementId: engagement.id, originalLang: 'hi',
      expectedDeliverable: 'x', successCriteria: 'y', items: [{ labelLang: 'hi', labelText: 'goal' }],
    });
    await agendas.lock(agenda.id);
    await escrows.hold({
      engagementId: engagement.id, seekerId, providerId, currency: 'INR',
      amountPaise: 50_000n, idempotencyKey: `hold:${engagement.id}`,
    });
    const submission = await submissions.submit({ engagementId: engagement.id, seekerId, contentRef: 'ref' });
    const evaluation = await evaluations.open({ engagementId: engagement.id, providerId, submissionId: submission.id });
    await evaluations.addScore({ evaluationId: evaluation.id, dimensionCode: 'content', score: 70 });
    await evaluations.addScore({ evaluationId: evaluation.id, dimensionCode: 'structure', score: 70 });
    await evaluations.return_(evaluation.id);
    await engagements.complete(engagement.id);
    return engagement.id;
  }

  async function verifyProviderInPolity(providerId: string, tier: string): Promise<void> {
    await pool.query(
      `INSERT INTO provider_skills (provider_id, skill_id, tier) VALUES ($1, $2, $3::mentor_tier)`,
      [providerId, politySkillId, tier],
    );
  }

  it('counts a completed engagement and its review in the provider\'s per-skill stats', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    await verifyProviderInPolity(providerId, 't3');

    const before = await ranking.getProviderStatsForSkill(providerId, politySkillId);
    expect(before?.completedEngagements).toBe(0);
    expect(before?.avgRating).toBeNull(); // never defaulted to a flattering number

    const engagementId = await completeOneEngagement(seekerId, providerId);
    await reviews.leave({
      engagementId, reviewerId: seekerId, direction: 'seeker_on_provider', rating: 4, bodyLang: 'hi',
    });

    const after = await ranking.getProviderStatsForSkill(providerId, politySkillId);
    expect(after?.completedEngagements).toBe(1);
    expect(after?.reviewCount).toBe(1);
    expect(after?.avgRating).toBe(4);
    expect(after?.tier).toBe('t3');
  });

  it('exposes no rank, percentile, or peer comparison of any kind (hard rule #17)', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    await verifyProviderInPolity(providerId, 't2');
    const engagementId = await completeOneEngagement(seekerId, providerId);
    await reviews.leave({
      engagementId, reviewerId: seekerId, direction: 'seeker_on_provider', rating: 5, bodyLang: 'hi',
    });

    const stats = await ranking.getProviderStats(providerId);
    expect(stats.length).toBeGreaterThan(0);
    for (const s of stats) {
      const keys = Object.keys(s);
      // Nothing that positions this provider against another.
      expect(keys).not.toContain('rank');
      expect(keys).not.toContain('percentile');
      expect(keys).not.toContain('streak');
      expect(keys).not.toContain('badge');
      // And every field present is about this provider alone.
      expect(s.providerId).toBe(providerId);
    }
  });

  it('orders candidates by tier and history, and never drops one that has no stats row', async () => {
    const { seekerId, providerId: strongId } = await seedUsers(pool);
    const { providerId: weakId } = await seedUsers(pool);
    const { providerId: unverifiedId } = await seedUsers(pool);

    await verifyProviderInPolity(strongId, 't4');
    await verifyProviderInPolity(weakId, 't2');
    // unverifiedId deliberately has no provider_skills row at all.

    const engagementId = await completeOneEngagement(seekerId, strongId);
    await reviews.leave({
      engagementId, reviewerId: seekerId, direction: 'seeker_on_provider', rating: 5, bodyLang: 'hi',
    });

    const ordered = await ranking.rankProviders([weakId, unverifiedId, strongId], politySkillId);
    expect(ordered[0]).toBe(strongId); // higher tier, with history
    expect(ordered).toContain(weakId);
    expect(ordered).toContain(unverifiedId); // present, at the end — never silently dropped
    expect(ordered).toHaveLength(3);
  });

  it('refuses a review on an engagement that has not ended', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagement = await engagements.createDraft({
      seekerId, providerId, domainCode: 'uppsc', categoryId,
      engagementType: 'document_review', currency: 'INR', amountPaise: 50_000n, language: 'hi',
    });
    await expect(
      reviews.leave({
        engagementId: engagement.id, reviewerId: seekerId, direction: 'seeker_on_provider', rating: 5, bodyLang: 'hi',
      }),
    ).rejects.toMatchObject({ code: 'REVIEW_ENGAGEMENT_NOT_ENDED' });
  });

  it('refuses a rating outside 1–5 before it reaches the database', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await completeOneEngagement(seekerId, providerId);
    await expect(
      reviews.leave({ engagementId, reviewerId: seekerId, direction: 'seeker_on_provider', rating: 0, bodyLang: 'hi' }),
    ).rejects.toMatchObject({ code: 'REVIEW_RATING_OUT_OF_RANGE' });
  });

  it('keeps the review body in the language it was written in', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await completeOneEngagement(seekerId, providerId);
    const review = await reviews.leave({
      engagementId,
      reviewerId: seekerId,
      direction: 'seeker_on_provider',
      rating: 5,
      bodyOriginal: 'बहुत अच्छा मार्गदर्शन',
      bodyLang: 'hi',
    });
    expect(review.bodyLang).toBe('hi');
    expect(review.bodyOriginal).toBe('बहुत अच्छा मार्गदर्शन');
  });
});
