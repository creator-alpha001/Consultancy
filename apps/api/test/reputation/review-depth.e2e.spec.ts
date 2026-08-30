import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
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
import { ReputationModule } from '../../src/modules/reputation/reputation.module';
import { ReviewService } from '../../src/modules/reputation/review.service';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { domainManifestV1, familyManifestV1 } from '../domains/manifest-fixtures';
import { resetDatabase, seedFeeSchedule, seedUsers } from '../test-utils';

/**
 * The two things a seeker needs before parting with money: what this
 * person has actually achieved, and what people who worked with them say.
 *
 * The assertions that matter most here are the negative ones. A profile
 * must publish the CONCLUSION of a verification and never the evidence
 * (#30), and nothing anywhere may compare one provider to another (#17).
 */
describe('profiles: achievements, track record, and reviews with substance', () => {
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
    }
    await resetDatabase(pool);
    await seedFeeSchedule(pool, 'INR', 1500);
    await families.publish(familyManifestV1());
    await domains.publish(domainManifestV1());

    const gs = await pool.query<{ id: string }>(
      `SELECT id FROM categories WHERE domain_code = 'uppsc' AND slug = 'gs'`,
    );
    categoryId = gs.rows[0].id;
    const skill = await pool.query<{ id: string }>(
      `SELECT id FROM skills WHERE code = 'answer_writing.gs.polity'`,
    );
    politySkillId = skill.rows[0].id;
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  async function verify(providerId: string, tier = 't3'): Promise<void> {
    await pool.query(
      `INSERT INTO provider_skills (provider_id, skill_id, tier) VALUES ($1, $2, $3::mentor_tier)
       ON CONFLICT DO NOTHING`,
      [providerId, politySkillId, tier],
    );
  }

  async function completeOne(seekerId: string, providerId: string): Promise<string> {
    const e = await engagements.createDraft({
      seekerId, providerId, domainCode: 'uppsc', categoryId,
      engagementType: 'document_review', currency: 'INR', amountPaise: 50_000n, language: 'hi',
    });
    await engagements.agree(e.id);
    const agenda = await agendas.createDraft({
      engagementId: e.id, originalLang: 'hi', expectedDeliverable: 'x', successCriteria: 'y',
      items: [{ labelLang: 'hi', labelText: 'goal' }],
    });
    await agendas.lock(agenda.id);
    await escrows.hold({
      engagementId: e.id, seekerId, providerId, currency: 'INR',
      amountPaise: 50_000n, idempotencyKey: `hold:${e.id}`,
    });
    const sub = await submissions.submit({ engagementId: e.id, seekerId, contentRef: 'ref' });
    const ev = await evaluations.open({ engagementId: e.id, providerId, submissionId: sub.id });
    await evaluations.addScore({ evaluationId: ev.id, dimensionCode: 'content', score: 70 });
    await evaluations.addScore({ evaluationId: ev.id, dimensionCode: 'structure', score: 70 });
    await evaluations.return_(ev.id);
    await engagements.complete(e.id);
    return e.id;
  }

  /** A verified credential, with evidence in verifier_data that must never surface. */
  async function grantCredential(providerId: string, code: string, verifierData: object): Promise<void> {
    const admin = await pool.query<{ id: string }>(
      `INSERT INTO users (email, role) VALUES ($1, 'admin') RETURNING id`,
      [`cred-admin-${Date.now()}-${Math.random()}@test.local`],
    );
    const type = await pool.query<{ id: string }>(
      `SELECT id FROM credential_types WHERE code = $1`,
      [code],
    );
    await pool.query(
      `INSERT INTO provider_credentials
         (provider_id, credential_type_id, domain_code, verifier_data, status, reviewed_by, reviewed_at)
       VALUES ($1, $2, 'uppsc', $3::jsonb, 'verified', $4, now())`,
      [providerId, type.rows[0].id, JSON.stringify(verifierData), admin.rows[0].id],
    );
  }

  describe('achievements on a profile', () => {
    it('publishes the achievement and withholds the evidence that proved it', async () => {
      const { providerId } = await seedUsers(pool);
      await verify(providerId);
      await grantCredential(providerId, 'exam_rank', {
        year: 2019,
        rank: 342,
        // Evidence. The manifest's publicFields does not list these.
        rollNumber: '1234567',
        claimedName: 'Asha Rathore',
        documentRef: 's3://private/scorecard.pdf',
      });

      const res = await request(app.getHttpServer()).get(`/providers/${providerId}`).expect(200);
      const [credential] = res.body.credentials;

      expect(credential.credentialCode).toBe('exam_rank');
      expect(credential.details).toEqual({ year: 2019, rank: 342 });

      // The whole point (#30).
      const serialised = JSON.stringify(res.body);
      expect(serialised).not.toContain('1234567');
      expect(serialised).not.toContain('Asha Rathore');
      expect(serialised).not.toContain('s3://private');
      expect(credential.details).not.toHaveProperty('rollNumber');
    });

    it('publishes nothing but the label for a credential type with no declared public fields', async () => {
      // `mains_cleared` has no publicFields in the fixture — the default
      // is empty, and empty must mean empty rather than "everything".
      const { providerId } = await seedUsers(pool);
      await grantCredential(providerId, 'mains_cleared', { year: 2020, rollNumber: '999' });

      const res = await request(app.getHttpServer()).get(`/providers/${providerId}`).expect(200);
      const credential = res.body.credentials.find((c: { credentialCode: string }) => c.credentialCode === 'mains_cleared');

      expect(credential.details).toEqual({});
      expect(JSON.stringify(res.body)).not.toContain('999');
    });

    it('never publishes an unverified credential', async () => {
      const { providerId } = await seedUsers(pool);
      const type = await pool.query<{ id: string }>(`SELECT id FROM credential_types WHERE code = 'exam_rank'`);
      await pool.query(
        `INSERT INTO provider_credentials (provider_id, credential_type_id, domain_code, verifier_data, status)
         VALUES ($1, $2, 'uppsc', '{"year": 2021}'::jsonb, 'submitted')`,
        [providerId, type.rows[0].id],
      );

      const res = await request(app.getHttpServer()).get(`/providers/${providerId}`).expect(200);
      expect(res.body.credentials).toHaveLength(0);
    });
  });

  describe('track record', () => {
    it('counts repeat seekers, and reports refunds rather than hiding them', async () => {
      const { seekerId, providerId } = await seedUsers(pool);
      const other = await seedUsers(pool);
      await verify(providerId);

      await completeOne(seekerId, providerId);
      await completeOne(seekerId, providerId); // the same person came back
      await completeOne(other.seekerId, providerId);

      const res = await request(app.getHttpServer()).get(`/providers/${providerId}`).expect(200);
      const record = res.body.trackRecord;

      expect(record.completedEngagements).toBe(3);
      expect(record.distinctSeekers).toBe(2);
      expect(record.repeatSeekers).toBe(1);
      expect(record.refundedEngagements).toBe(0);
      expect(record.lastCompletedAt).not.toBeNull();
    });
  });

  describe('reviews with substance', () => {
    it('records per-dimension scores alongside the overall rating', async () => {
      const { seekerId, providerId } = await seedUsers(pool);
      await verify(providerId);
      const engagementId = await completeOne(seekerId, providerId);

      await reviews.leave({
        engagementId, reviewerId: seekerId, direction: 'seeker_on_provider',
        rating: 4, bodyOriginal: 'सटीक और स्पष्ट।', bodyLang: 'hi',
        dimensionScores: [
          { dimensionCode: 'clarity', score: 5 },
          { dimensionCode: 'punctuality', score: 3 },
        ],
      });

      const res = await request(app.getHttpServer()).get(`/providers/${providerId}`).expect(200);
      const [review] = res.body.reviews;

      expect(review.rating).toBe(4);
      expect(review.dimensionScores).toEqual(
        expect.arrayContaining([
          { dimensionCode: 'clarity', score: 5 },
          { dimensionCode: 'punctuality', score: 3 },
        ]),
      );
      // The original language is preserved, not translated away (#20).
      expect(review.bodyLang).toBe('hi');
      expect(review.bodyOriginal).toBe('सटीक और स्पष्ट।');
    });

    it('carries the context that makes a review credible', async () => {
      const { seekerId, providerId } = await seedUsers(pool);
      await verify(providerId);
      const engagementId = await completeOne(seekerId, providerId);
      await reviews.leave({
        engagementId, reviewerId: seekerId, direction: 'seeker_on_provider',
        rating: 5, bodyOriginal: 'good', bodyLang: 'en',
      });

      const res = await request(app.getHttpServer()).get(`/providers/${providerId}`).expect(200);
      const [review] = res.body.reviews;

      // Which skills the work actually required, snapshotted at agree().
      expect(review.skills.length).toBeGreaterThan(0);
      expect(review.skills.map((s: { code: string }) => s.code)).toContain('answer_writing.gs.polity');
      expect(review.engagementType).toBe('document_review');
    });

    it('refuses a dimension the family never declared', async () => {
      const { seekerId, providerId } = await seedUsers(pool);
      await verify(providerId);
      const engagementId = await completeOne(seekerId, providerId);

      await expect(
        reviews.leave({
          engagementId, reviewerId: seekerId, direction: 'seeker_on_provider',
          rating: 5, bodyLang: 'en',
          dimensionScores: [{ dimensionCode: 'invented_by_the_client', score: 5 }],
        }),
      ).rejects.toMatchObject({ code: 'REVIEW_UNKNOWN_DIMENSION' });

      // And nothing was written — the review is validated before it lands.
      const count = await pool.query(`SELECT count(*) FROM reviews WHERE engagement_id = $1`, [engagementId]);
      expect(Number(count.rows[0].count)).toBe(0);
    });

    it('summarises a provider\'s own record, with no comparison to anyone else', async () => {
      const { seekerId, providerId } = await seedUsers(pool);
      const other = await seedUsers(pool);
      await verify(providerId);

      for (const [reviewer, rating] of [[seekerId, 5], [other.seekerId, 3]] as const) {
        const id = await completeOne(reviewer, providerId);
        await reviews.leave({
          engagementId: id, reviewerId: reviewer, direction: 'seeker_on_provider',
          rating, bodyLang: 'en', dimensionScores: [{ dimensionCode: 'clarity', score: rating }],
        });
      }

      const res = await request(app.getHttpServer()).get(`/providers/${providerId}`).expect(200);
      const summary = res.body.reviewSummary;

      expect(summary.reviewCount).toBe(2);
      expect(Number(summary.avgRating)).toBe(4);
      expect(summary.distribution).toMatchObject({ 5: 1, 3: 1, 4: 0 });
      expect(summary.dimensions).toEqual([
        { dimensionCode: 'clarity', scoreCount: 2, avgScore: 4 },
      ]);

      // #17: nothing here places this provider against any other.
      const serialised = JSON.stringify(res.body);
      expect(serialised).not.toMatch(/percentile|rank_|leaderboard|topProvider|betterThan/i);
    });

    it('leaves avgRating null rather than defaulting to a flattering number', async () => {
      const { providerId } = await seedUsers(pool);
      await verify(providerId);
      const res = await request(app.getHttpServer()).get(`/providers/${providerId}`).expect(200);
      expect(res.body.reviewSummary.reviewCount).toBe(0);
      expect(res.body.reviewSummary.avgRating).toBeNull();
    });
  });

  /**
   * Whether a review has been answered is part of the review.
   *
   * `listAboutUser` returned the review rows alone, so no caller could
   * tell an answered review from an unanswered one — and the mentor
   * workspace offered a reply box on every review, including ones
   * already replied to, where posting fails with
   * REVIEW_REPLY_ALREADY_EXISTS. The right of reply is exercised once
   * per review, so its state travels with the review.
   */
  describe('reviews about a user carry their reply state', () => {
    it('reports null before a reply and the reply afterwards', async () => {
      const { seekerId, providerId } = await seedUsers(pool);
      const engagementId = await completeOne(seekerId, providerId);
      const review = await reviews.leave({
        engagementId,
        reviewerId: seekerId,
        direction: 'seeker_on_provider',
        rating: 4,
        bodyOriginal: 'Clear and honest.',
        bodyLang: 'en',
      });

      const before = await reviews.listAboutUser(providerId);
      expect(before).toHaveLength(1);
      expect(before[0].reply).toBeNull();

      await reviews.reply({
        reviewId: review.id,
        authorId: providerId,
        bodyOriginal: 'Fair — here is what changed.',
        bodyLang: 'en',
      });

      const after = await reviews.listAboutUser(providerId);
      expect(after[0].reply).toEqual({
        bodyOriginal: 'Fair — here is what changed.',
        bodyLang: 'en',
      });
    });
  });

  describe('the right of reply', () => {
    it('lets the reviewed provider answer, once', async () => {
      const { seekerId, providerId } = await seedUsers(pool);
      await verify(providerId);
      const engagementId = await completeOne(seekerId, providerId);
      const review = await reviews.leave({
        engagementId, reviewerId: seekerId, direction: 'seeker_on_provider',
        rating: 2, bodyOriginal: 'Late.', bodyLang: 'en',
      });

      await reviews.reply({
        reviewId: review.id, authorId: providerId,
        bodyOriginal: 'You are right — I was two days late. I have changed how I schedule.',
        bodyLang: 'en',
      });

      const res = await request(app.getHttpServer()).get(`/providers/${providerId}`).expect(200);
      expect(res.body.reviews[0].reply.bodyOriginal).toContain('two days late');
      expect(res.body.reviewSummary.repliedCount).toBe(1);

      // A reply that could be rewritten is worth as little as a review
      // that could be.
      await expect(
        reviews.reply({ reviewId: review.id, authorId: providerId, bodyOriginal: 'Actually no.', bodyLang: 'en' }),
      ).rejects.toMatchObject({ code: 'REVIEW_REPLY_ALREADY_EXISTS' });
    });

    it('refuses a reply from anyone but the person the review is about', async () => {
      const { seekerId, providerId } = await seedUsers(pool);
      const stranger = await seedUsers(pool);
      await verify(providerId);
      const engagementId = await completeOne(seekerId, providerId);
      const review = await reviews.leave({
        engagementId, reviewerId: seekerId, direction: 'seeker_on_provider',
        rating: 1, bodyOriginal: 'bad', bodyLang: 'en',
      });

      await expect(
        reviews.reply({
          reviewId: review.id, authorId: stranger.providerId,
          bodyOriginal: 'defending someone else', bodyLang: 'en',
        }),
      ).rejects.toMatchObject({ code: 'REVIEW_REPLY_NOT_SUBJECT' });
    });
  });
});
