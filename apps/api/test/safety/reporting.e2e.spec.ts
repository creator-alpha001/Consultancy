import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { BoardModule } from '../../src/modules/board/board.module';
import { QuestionService } from '../../src/modules/board/question.service';
import { DomainManifestService } from '../../src/modules/domains/domain-manifest.service';
import { DomainsModule } from '../../src/modules/domains/domains.module';
import { FamilyManifestService } from '../../src/modules/domains/family-manifest.service';
import { ReportService } from '../../src/modules/safety/report.service';
import { SafetyModule } from '../../src/modules/safety/safety.module';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { ReviewService } from '../../src/modules/reputation/review.service';
import { ReputationModule } from '../../src/modules/reputation/reputation.module';
import { resetDatabase, seedAdminUser, seedEngagement, seedUsers } from '../test-utils';
import { domainManifestV1, familyManifestV1 } from '../domains/manifest-fixtures';

/**
 * D45 — reporting.
 *
 * The three policy decisions this feature exists to implement, each
 * settled with the product owner because no spec covers them:
 *
 *   1. reported CONTENT is held immediately; a PERSON never is
 *   2. a person, content, a session and an engagement are all reportable
 *   3. the reporter is acknowledged and never told the outcome
 *
 * Each has a test below, because each is the kind of decision a later
 * refactor silently reverses.
 */
describe('safety reporting', () => {
  let app: INestApplication;
  let pool: Pool;
  let reports: ReportService;
  let questions: QuestionService;
  let reviews: ReviewService;
  let families: FamilyManifestService;
  let domains: DomainManifestService;
  let categoryId: string;

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([DomainsModule, BoardModule, SafetyModule, ReputationModule]);
      pool = app.get<Pool>(PG_POOL);
      reports = app.get(ReportService);
      questions = app.get(QuestionService);
      reviews = app.get(ReviewService);
      families = app.get(FamilyManifestService);
      domains = app.get(DomainManifestService);
    }
    await resetDatabase(pool);
    await families.publish(familyManifestV1());
    await domains.publish(domainManifestV1());
    const gs = await pool.query<{ id: string }>(`SELECT id FROM categories WHERE domain_code = 'uppsc' AND slug = 'gs'`);
    categoryId = gs.rows[0].id;
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  async function publishedQuestion(seekerId: string): Promise<string> {
    const asked = await questions.ask({
      seekerId,
      domainCode: 'uppsc',
      categoryId,
      bodyOriginal: 'How should I structure a 250-word answer under time pressure?',
      bodyLang: 'en',
    });
    expect(asked.question.status).toBe('published');
    return asked.question.id;
  }

  it('holds reported content immediately, before any human has looked', async () => {
    const { seekerId } = await seedUsers(pool);
    const other = await seedUsers(pool);
    const questionId = await publishedQuestion(seekerId);

    expect((await questions.listPublished('uppsc')).map((q) => q.id)).toContain(questionId);

    const result = await reports.raise({
      reporterId: other.seekerId,
      subjectType: 'question',
      subjectId: questionId,
      reasonCode: 'harassment',
      detailOriginal: 'This is abusive.',
      detailLang: 'en',
    });

    expect(result.contentHeld).toBe(true);
    // Out of public view the moment it was reported — the same state the
    // screening classifier uses, reached from the other direction.
    expect((await questions.listPublished('uppsc')).map((q) => q.id)).not.toContain(questionId);
    expect((await questions.get(questionId)).status).toBe('held_for_review');
  });

  it('never auto-suspends a person, and never freezes their work', async () => {
    const { seekerId } = await seedUsers(pool);
    const target = await seedUsers(pool);

    const result = await reports.raise({
      reporterId: seekerId,
      subjectType: 'user',
      subjectId: target.providerId,
      reasonCode: 'harassment',
      domainCode: 'uppsc',
    });

    // A report is a claim, not a finding. One person must not be able to
    // stop another's paid work by pressing a button.
    expect(result.contentHeld).toBe(false);
    const user = await pool.query<{ status: string }>(`SELECT status FROM users WHERE id = $1`, [target.providerId]);
    expect(user.rows[0].status).toBe('active');
  });

  it('tells the reporter it was reviewed, and never what happened', async () => {
    const { seekerId } = await seedUsers(pool);
    const other = await seedUsers(pool);
    const admin = await seedAdminUser(pool);
    const questionId = await publishedQuestion(seekerId);

    const raised = await reports.raise({
      reporterId: other.seekerId,
      subjectType: 'question',
      subjectId: questionId,
      reasonCode: 'harassment',
    });
    expect(raised.report.state).toBe('received');

    await reports.resolve({
      reportId: raised.report.id,
      reviewerId: admin,
      decision: 'actioned',
      note: 'Confirmed abusive; content stays down and the author has been warned.',
    });

    const mine = await reports.listForReporter(other.seekerId);
    expect(mine).toHaveLength(1);
    expect(mine[0].state).toBe('reviewed');
    // The outcome and the reviewer's note are the other party's record.
    // Not "absent by accident" — asserted absent.
    const serialized = JSON.stringify(mine[0]);
    expect(serialized).not.toMatch(/actioned|dismissed/);
    expect(serialized).not.toMatch(/warned/);
    expect(Object.keys(mine[0])).not.toContain('resolutionNote');
    expect(Object.keys(mine[0])).not.toContain('resolvedBy');
  });

  it('releases the hold when a report is dismissed — but not while another still holds', async () => {
    const { seekerId } = await seedUsers(pool);
    const first = await seedUsers(pool);
    const second = await seedUsers(pool);
    const admin = await seedAdminUser(pool);
    const questionId = await publishedQuestion(seekerId);

    const a = await reports.raise({
      reporterId: first.seekerId,
      subjectType: 'question',
      subjectId: questionId,
      reasonCode: 'harassment',
    });
    const b = await reports.raise({
      reporterId: second.seekerId,
      subjectType: 'question',
      subjectId: questionId,
      reasonCode: 'spam',
    });

    await reports.resolve({ reportId: a.report.id, reviewerId: admin, decision: 'dismissed', note: 'No abuse here.' });
    // Still held: someone else's report is live against the same post.
    expect((await questions.get(questionId)).status).toBe('held_for_review');

    await reports.resolve({ reportId: b.report.id, reviewerId: admin, decision: 'dismissed', note: 'Not spam either.' });
    expect((await questions.get(questionId)).status).toBe('published');
    expect((await questions.listPublished('uppsc')).map((q) => q.id)).toContain(questionId);
  });

  it('leaves content up for a welfare concern, and answers with the helplines', async () => {
    const { seekerId } = await seedUsers(pool);
    const worried = await seedUsers(pool);
    const questionId = await publishedQuestion(seekerId);

    const result = await reports.raise({
      reporterId: worried.seekerId,
      subjectType: 'question',
      subjectId: questionId,
      reasonCode: 'welfare_concern',
    });

    // #24-#26: hiding someone's post because a stranger was worried about
    // them punishes them for being unwell. The post stays; the concern
    // goes to the front of the queue.
    expect(result.contentHeld).toBe(false);
    expect((await questions.get(questionId)).status).toBe('published');
    expect(result.supportResources?.[0]?.value).toBe('14416');

    const queue = await reports.listQueue();
    expect(queue[0].reasonCode).toBe('welfare_concern');
    expect(queue[0].welfareConcern).toBe(true);
  });

  it('puts welfare concerns at the front of the queue, ahead of older reports', async () => {
    const { seekerId } = await seedUsers(pool);
    const one = await seedUsers(pool);
    const two = await seedUsers(pool);
    const older = await publishedQuestion(seekerId);
    const newer = await publishedQuestion(seekerId);

    await reports.raise({ reporterId: one.seekerId, subjectType: 'question', subjectId: older, reasonCode: 'spam' });
    await reports.raise({
      reporterId: two.seekerId,
      subjectType: 'question',
      subjectId: newer,
      reasonCode: 'welfare_concern',
    });

    const queue = await reports.listQueue();
    expect(queue.map((r) => r.reasonCode)).toEqual(['welfare_concern', 'spam']);
  });

  it('refuses a reason the family has not declared', async () => {
    const { seekerId } = await seedUsers(pool);
    const other = await seedUsers(pool);
    const questionId = await publishedQuestion(seekerId);

    await expect(
      reports.raise({
        reporterId: other.seekerId,
        subjectType: 'question',
        subjectId: questionId,
        // Plausible, and not in this family's manifest. Core knows no
        // reason codes at all, so the pack is the only authority.
        reasonCode: 'copyright_infringement',
      }),
    ).rejects.toMatchObject({ code: 'REPORT_REASON_UNKNOWN' });
  });

  it('refuses a self-report, and a second live report on the same subject', async () => {
    const { seekerId } = await seedUsers(pool);
    const other = await seedUsers(pool);
    const questionId = await publishedQuestion(seekerId);

    await expect(
      reports.raise({ reporterId: seekerId, subjectType: 'question', subjectId: questionId, reasonCode: 'spam' }),
    ).rejects.toMatchObject({ code: 'REPORT_SELF' });

    await reports.raise({
      reporterId: other.seekerId,
      subjectType: 'question',
      subjectId: questionId,
      reasonCode: 'spam',
    });
    await expect(
      reports.raise({
        reporterId: other.seekerId,
        subjectType: 'question',
        subjectId: questionId,
        reasonCode: 'harassment',
      }),
    ).rejects.toMatchObject({ code: 'REPORT_ALREADY_OPEN' });
  });

  it('never exposes who reported, in anything the reported party can reach', async () => {
    const { seekerId } = await seedUsers(pool);
    const reporter = await seedUsers(pool);
    const questionId = await publishedQuestion(seekerId);

    const raised = await reports.raise({
      reporterId: reporter.seekerId,
      subjectType: 'question',
      subjectId: questionId,
      reasonCode: 'harassment',
      detailOriginal: 'Reported because of the language used.',
      detailLang: 'en',
    });

    // The author of the reported question can see their own question and
    // that it is held. Nothing on that path carries the reporter.
    const authorsView = JSON.stringify(await questions.get(questionId));
    expect(authorsView).not.toContain(reporter.seekerId);
    expect(authorsView).not.toContain('Reported because of the language used.');

    // And the reporter's own view does not carry the reporter id either —
    // it is theirs, but a screenshot of it should not identify them.
    expect(JSON.stringify(raised.report)).not.toContain(reporter.seekerId);
  });

  /**
   * The trap this test exists for: filtering a held review out of the
   * list while leaving it in the average hides the words and keeps the
   * score. Both have to move together, which is why the summary views
   * carry the same filter as the queries.
   */
  it('drops a held review out of the provider rating as well as the list', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    await pool.query(`ALTER TABLE engagements DISABLE TRIGGER USER`);
    try {
      await pool.query(`UPDATE engagements SET status = 'completed' WHERE id = $1`, [engagementId]);
    } finally {
      await pool.query(`ALTER TABLE engagements ENABLE TRIGGER USER`);
    }
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO reviews (engagement_id, reviewer_id, subject_id, direction, rating, body_original, body_lang)
       VALUES ($1, $2, $3, 'seeker_on_provider', 1, 'Abusive language in the feedback.', 'en')
       RETURNING id`,
      [engagementId, seekerId, providerId],
    );
    const reviewId = inserted.rows[0].id;

    expect((await reviews.summaryFor(providerId)).reviewCount).toBe(1);
    expect((await reviews.listAboutProviderWithContext(providerId))).toHaveLength(1);

    const reporter = await seedUsers(pool);
    const raised = await reports.raise({
      reporterId: reporter.seekerId,
      subjectType: 'review',
      subjectId: reviewId,
      reasonCode: 'harassment',
      // This engagement was seeded without a domain, so the reporter's
      // context supplies one — the same path a reported person takes.
      domainCode: 'uppsc',
    });
    expect(raised.contentHeld).toBe(true);

    expect(await reviews.listAboutProviderWithContext(providerId)).toHaveLength(0);
    expect((await reviews.summaryFor(providerId)).reviewCount).toBe(0);

    // Dismissed, it comes back — both the words and the score.
    const admin = await seedAdminUser(pool);
    await reports.resolve({ reportId: raised.report.id, reviewerId: admin, decision: 'dismissed', note: 'Fair review.' });
    expect(await reviews.listAboutProviderWithContext(providerId)).toHaveLength(1);
    expect((await reviews.summaryFor(providerId)).reviewCount).toBe(1);
  });

  it('resolves a report only once', async () => {
    const { seekerId } = await seedUsers(pool);
    const other = await seedUsers(pool);
    const admin = await seedAdminUser(pool);
    const questionId = await publishedQuestion(seekerId);

    const raised = await reports.raise({
      reporterId: other.seekerId,
      subjectType: 'question',
      subjectId: questionId,
      reasonCode: 'spam',
    });
    await reports.resolve({ reportId: raised.report.id, reviewerId: admin, decision: 'dismissed', note: 'Fine.' });

    await expect(
      reports.resolve({ reportId: raised.report.id, reviewerId: admin, decision: 'actioned', note: 'Changed my mind.' }),
    ).rejects.toMatchObject({ code: 'REPORT_ALREADY_RESOLVED' });
  });
});
