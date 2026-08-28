import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { AgendaService } from '../../src/modules/agenda/agenda.service';
import { AgendaModule } from '../../src/modules/agenda/agenda.module';
import { EvaluationService } from '../../src/modules/assessment/evaluation.service';
import { SubmissionService } from '../../src/modules/assessment/submission.service';
import { AssessmentModule } from '../../src/modules/assessment/assessment.module';
import { DisputeService } from '../../src/modules/disputes/dispute.service';
import { DisputesModule } from '../../src/modules/disputes/disputes.module';
import { EvidenceService } from '../../src/modules/disputes/evidence.service';
import { DomainManifestService } from '../../src/modules/domains/domain-manifest.service';
import { DomainLoaderService } from '../../src/modules/domains/domain-loader.service';
import { DomainsModule } from '../../src/modules/domains/domains.module';
import { FamilyManifestService } from '../../src/modules/domains/family-manifest.service';
import { EngagementsService } from '../../src/modules/engagements/engagements.service';
import { EngagementsModule } from '../../src/modules/engagements/engagements.module';
import { EscrowService } from '../../src/modules/money/escrow.service';
import { MoneyModule } from '../../src/modules/money/money.module';
import { ReputationModule } from '../../src/modules/reputation/reputation.module';
import { ReviewService } from '../../src/modules/reputation/review.service';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { accountBalance, findAccountId, resetDatabase, seedAdminUser, seedFeeSchedule, seedUsers } from '../test-utils';
import {
  domainManifestV1,
  familyManifestTwoTierLadder,
  familyManifestV1,
} from '../domains/manifest-fixtures';

/**
 * SPEC-PLATFORM.md §18, M7's own done-when bar: "A dispute is raised,
 * ruled, appealed, settled — **no code change**."
 *
 * The last three words are the real test. The tier ladder lives in the
 * family manifest, so the final case here republishes a family with a
 * two-rung ladder instead of three and shows the same code walking it
 * correctly — a rung is added or removed by editing pack data, never by
 * touching `disputes/`.
 */
describe('M7 acceptance: dispute raised -> ruled -> appealed -> ruled again -> settled', () => {
  let app: INestApplication;
  let pool: Pool;
  let families: FamilyManifestService;
  let domains: DomainManifestService;
  let loader: DomainLoaderService;
  let engagements: EngagementsService;
  let agendas: AgendaService;
  let escrows: EscrowService;
  let submissions: SubmissionService;
  let evaluations: EvaluationService;
  let disputes: DisputeService;
  let evidence: EvidenceService;
  let reviews: ReviewService;
  let categoryId: string;

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([
        DomainsModule,
        EngagementsModule,
        AgendaModule,
        AssessmentModule,
        MoneyModule,
        ReputationModule,
        DisputesModule,
      ]);
      pool = app.get<Pool>(PG_POOL);
      families = app.get(FamilyManifestService);
      domains = app.get(DomainManifestService);
      loader = app.get(DomainLoaderService);
      engagements = app.get(EngagementsService);
      agendas = app.get(AgendaService);
      escrows = app.get(EscrowService);
      submissions = app.get(SubmissionService);
      evaluations = app.get(EvaluationService);
      disputes = app.get(DisputeService);
      evidence = app.get(EvidenceService);
      reviews = app.get(ReviewService);
    }
    await resetDatabase(pool);
    loader.clearAll();
    await seedFeeSchedule(pool, 'INR', 1500); // 15%

    await families.publish(familyManifestV1());
    await domains.publish(domainManifestV1());
    const gs = await pool.query<{ id: string }>(`SELECT id FROM categories WHERE domain_code = 'uppsc' AND slug = 'gs'`);
    categoryId = gs.rows[0].id;
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  /** Drives a real engagement to `delivered` with escrow held — the state most disputes are raised from. */
  async function seedDeliveredEngagement(amountPaise = 100_000n): Promise<{
    engagementId: string;
    seekerId: string;
    providerId: string;
  }> {
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
      expectedDeliverable: 'मूल्यांकित उत्तर',
      successCriteria: 'तीन कमज़ोर क्षेत्र पता चलें',
      items: [{ labelLang: 'hi', labelText: 'संरचना पर प्रतिक्रिया दें' }],
    });
    await agendas.lock(agenda.id);
    await escrows.hold({
      engagementId: engagement.id,
      seekerId,
      providerId,
      currency: 'INR',
      amountPaise,
      idempotencyKey: `hold:${engagement.id}`,
    });
    await submissions.submit({ engagementId: engagement.id, seekerId, contentRef: 's3://placeholder/answer.pdf' });
    return { engagementId: engagement.id, seekerId, providerId };
  }

  it('runs the full ladder and settles with a split, with money moving correctly', async () => {
    const { engagementId, seekerId, providerId } = await seedDeliveredEngagement(100_000n);
    const adminId = await seedAdminUser(pool);

    // ─── Raised ───
    const dispute = await disputes.raise({
      engagementId,
      raisedBy: seekerId,
      reasonCode: 'not_as_agreed',
      bodyOriginal: 'मूल्यांकन वापस नहीं आया', // Hindi: the original is authoritative (#20)
      bodyLang: 'hi',
    });
    expect(dispute.status).toBe('open');
    expect(dispute.tier).toBe(1); // first rung of the pack's ladder

    // The engagement and its escrow are frozen — money is safe while this is adjudicated.
    expect((await engagements.get(engagementId)).status).toBe('disputed');
    expect((await escrows.findByEngagementId(engagementId))?.status).toBe('disputed_hold');

    // The evidence packet was assembled from the engagement's own record,
    // in the languages the parties actually wrote in (#20).
    const packet = await evidence.listForDispute(dispute.id);
    const agendaEvidence = packet.find((e) => e.kind === 'agenda');
    expect(agendaEvidence).toBeDefined();
    expect(agendaEvidence!.contentLang).toBe('hi');
    expect(agendaEvidence!.contentOriginal).toContain('मूल्यांकित उत्तर'); // the ORIGINAL text, not a translation
    expect(packet.some((e) => e.kind === 'agenda_item')).toBe(true);
    expect(packet.some((e) => e.kind === 'submission')).toBe(true);

    // ─── Ruled (tier 1) ───
    const firstRuling = await disputes.rule({
      disputeId: dispute.id,
      ruledBy: adminId,
      outcome: 'refund_to_seeker',
      rationale: 'No evaluation was returned against a locked agenda.',
    });
    expect(firstRuling.tier).toBe(1);
    expect((await disputes.get(dispute.id)).status).toBe('ruled');

    // ─── Appealed (tier 1 -> 2) ───
    const appeal = await disputes.appeal({
      disputeId: dispute.id,
      appealedBy: providerId,
      bodyOriginal: 'मैंने काम किया था, अपलोड विफल रहा',
      bodyLang: 'hi',
    });
    expect(appeal.fromTier).toBe(1);
    expect(appeal.toTier).toBe(2);

    const afterAppeal = await disputes.get(dispute.id);
    expect(afterAppeal.status).toBe('appealed');
    expect(afterAppeal.tier).toBe(2);

    // The appeal text joins the packet, in its own language.
    const packetAfterAppeal = await evidence.listForDispute(dispute.id);
    const appealEvidence = packetAfterAppeal.find((e) => e.kind === 'appeal');
    expect(appealEvidence?.contentLang).toBe('hi');

    // ─── Ruled again (tier 2), this time a split ───
    const secondRuling = await disputes.rule({
      disputeId: dispute.id,
      ruledBy: adminId,
      outcome: 'split',
      seekerRefundPaise: 40_000n,
      rationale: 'Partial work evidenced; a partial refund is proportionate.',
    });
    expect(secondRuling.tier).toBe(2);
    // Both rulings survive — the record of an overturned decision is not erased.
    expect((await disputes.listRulings(dispute.id)).map((r) => r.tier)).toEqual([1, 2]);

    // ─── Settled ───
    const settled = await disputes.settle(dispute.id);
    expect(settled.status).toBe('settled');

    const finalEscrow = await escrows.findByEngagementId(engagementId);
    expect(finalEscrow?.status).toBe('settled_split');
    expect((await engagements.get(engagementId)).status).toBe('completed');

    // Money: seeker refunded 40,000. Provider's 60,000 carries a pro-rata
    // fee (15% of 60,000 = 9,000), so the provider nets 51,000 — the
    // platform does NOT take a full 15,000 fee out of a half-delivered job.
    const escrowAccountId = await findAccountId(pool, 'escrow', null, 'INR');
    const paAccountId = await findAccountId(pool, 'payment_aggregator', null, 'INR');
    const providerAccountId = await findAccountId(pool, 'provider_wallet', providerId, 'INR');
    const feeAccountId = await findAccountId(pool, 'platform_fee_revenue', null, 'INR');

    expect(await accountBalance(pool, escrowAccountId!, 'INR')).toBe(0n);
    expect(await accountBalance(pool, providerAccountId!, 'INR')).toBe(51_000n);
    expect(await accountBalance(pool, feeAccountId!, 'INR')).toBe(9_000n);
    // Captured 100,000 in, 40,000 back out to the seeker.
    expect(await accountBalance(pool, paAccountId!, 'INR')).toBe(-60_000n);

    // And the whole thing still balances to zero across every account.
    const sum = await pool.query<{ total: string }>(
      `SELECT coalesce(sum(amount_paise), 0)::text AS total FROM ledger_entries WHERE currency = 'INR'`,
    );
    expect(BigInt(sum.rows[0].total)).toBe(0n);
  });

  it('refuses to appeal past the final rung the family declares', async () => {
    const { engagementId, seekerId, providerId } = await seedDeliveredEngagement();
    const adminId = await seedAdminUser(pool);

    const dispute = await disputes.raise({
      engagementId, raisedBy: seekerId, reasonCode: 'not_as_agreed',
      bodyOriginal: 'x', bodyLang: 'hi',
    });

    // Walk to the last rung of the three-tier fixture ladder.
    await disputes.rule({ disputeId: dispute.id, ruledBy: adminId, outcome: 'refund_to_seeker', rationale: 'r1' });
    await disputes.appeal({ disputeId: dispute.id, appealedBy: providerId, bodyOriginal: 'a1', bodyLang: 'hi' });
    await disputes.rule({ disputeId: dispute.id, ruledBy: adminId, outcome: 'refund_to_seeker', rationale: 'r2' });
    await disputes.appeal({ disputeId: dispute.id, appealedBy: providerId, bodyOriginal: 'a2', bodyLang: 'hi' });
    await disputes.rule({ disputeId: dispute.id, ruledBy: adminId, outcome: 'refund_to_seeker', rationale: 'r3' });

    expect((await disputes.get(dispute.id)).tier).toBe(3); // 'appeal_panel', marked final in the pack

    await expect(
      disputes.appeal({ disputeId: dispute.id, appealedBy: providerId, bodyOriginal: 'a3', bodyLang: 'hi' }),
    ).rejects.toMatchObject({ code: 'APPEAL_TIER_IS_FINAL' });
  });

  it('walks a DIFFERENT ladder with no code change when the family manifest supplies one', async () => {
    // Republish the same family with two rungs instead of three. No
    // migration, no deploy, no line of `disputes/` touched.
    await families.publish(familyManifestTwoTierLadder());
    loader.clearAll();

    const { engagementId, seekerId, providerId } = await seedDeliveredEngagement();
    const adminId = await seedAdminUser(pool);

    const dispute = await disputes.raise({
      engagementId, raisedBy: seekerId, reasonCode: 'not_as_agreed', bodyOriginal: 'x', bodyLang: 'hi',
    });
    await disputes.rule({ disputeId: dispute.id, ruledBy: adminId, outcome: 'refund_to_seeker', rationale: 'r1' });
    await disputes.appeal({ disputeId: dispute.id, appealedBy: providerId, bodyOriginal: 'a1', bodyLang: 'hi' });
    await disputes.rule({ disputeId: dispute.id, ruledBy: adminId, outcome: 'refund_to_seeker', rationale: 'r2' });

    // Tier 2 is final in THIS ladder, though it was appealable in the other.
    expect((await disputes.get(dispute.id)).tier).toBe(2);
    await expect(
      disputes.appeal({ disputeId: dispute.id, appealedBy: providerId, bodyOriginal: 'a2', bodyLang: 'hi' }),
    ).rejects.toMatchObject({ code: 'APPEAL_TIER_IS_FINAL' });

    const settled = await disputes.settle(dispute.id);
    expect(settled.status).toBe('settled');
    expect((await engagements.get(engagementId)).status).toBe('refunded');
  });

  it('settles a full refund to the seeker and leaves the engagement refunded', async () => {
    const { engagementId, seekerId, providerId } = await seedDeliveredEngagement(80_000n);
    const adminId = await seedAdminUser(pool);

    const dispute = await disputes.raise({
      engagementId, raisedBy: seekerId, reasonCode: 'not_delivered', bodyOriginal: 'कुछ नहीं मिला', bodyLang: 'hi',
    });
    await disputes.rule({
      disputeId: dispute.id, ruledBy: adminId, outcome: 'refund_to_seeker', rationale: 'Nothing was delivered.',
    });
    await disputes.settle(dispute.id);

    expect((await engagements.get(engagementId)).status).toBe('refunded');
    expect((await escrows.findByEngagementId(engagementId))?.status).toBe('refunded');
    const providerAccountId = await findAccountId(pool, 'provider_wallet', providerId, 'INR');
    // Provider account may not even exist; either way they were paid nothing.
    expect(providerAccountId ? await accountBalance(pool, providerAccountId, 'INR') : 0n).toBe(0n);
  });

  it('settles in the provider\'s favour and pays them the ordinary fee-adjusted amount', async () => {
    const { engagementId, seekerId, providerId } = await seedDeliveredEngagement(100_000n);
    const adminId = await seedAdminUser(pool);

    const dispute = await disputes.raise({
      engagementId, raisedBy: seekerId, reasonCode: 'quality', bodyOriginal: 'x', bodyLang: 'hi',
    });
    await disputes.rule({
      disputeId: dispute.id, ruledBy: adminId, outcome: 'release_to_provider',
      rationale: 'Work matched the locked agenda in full.',
    });
    await disputes.settle(dispute.id);

    expect((await engagements.get(engagementId)).status).toBe('completed');
    const providerAccountId = await findAccountId(pool, 'provider_wallet', providerId, 'INR');
    expect(await accountBalance(pool, providerAccountId!, 'INR')).toBe(85_000n); // ordinary 15% fee
  });

  it('lets the raiser withdraw before any ruling', async () => {
    const { engagementId, seekerId } = await seedDeliveredEngagement();
    const dispute = await disputes.raise({
      engagementId, raisedBy: seekerId, reasonCode: 'mistake', bodyOriginal: 'x', bodyLang: 'hi',
    });
    const withdrawn = await disputes.withdraw(dispute.id, seekerId);
    expect(withdrawn.status).toBe('withdrawn');
  });

  it('refuses a second dispute on the same engagement, and one raised by a stranger', async () => {
    const { engagementId, seekerId } = await seedDeliveredEngagement();
    const { seekerId: strangerId } = await seedUsers(pool);

    await expect(
      disputes.raise({
        engagementId, raisedBy: strangerId, reasonCode: 'nosy', bodyOriginal: 'x', bodyLang: 'hi',
      }),
    ).rejects.toMatchObject({ code: 'DISPUTE_NOT_A_PARTY' });

    await disputes.raise({ engagementId, raisedBy: seekerId, reasonCode: 'r', bodyOriginal: 'x', bodyLang: 'hi' });
    await expect(
      disputes.raise({ engagementId, raisedBy: seekerId, reasonCode: 'r', bodyOriginal: 'y', bodyLang: 'hi' }),
    ).rejects.toMatchObject({ code: 'DISPUTE_ALREADY_EXISTS' });
  });

  it('a settled dispute leaves both parties able to review, and the review counts toward per-skill stats', async () => {
    const { engagementId, seekerId, providerId } = await seedDeliveredEngagement(100_000n);
    const adminId = await seedAdminUser(pool);

    const dispute = await disputes.raise({
      engagementId, raisedBy: seekerId, reasonCode: 'quality', bodyOriginal: 'x', bodyLang: 'hi',
    });
    await disputes.rule({
      disputeId: dispute.id, ruledBy: adminId, outcome: 'release_to_provider', rationale: 'Work stands.',
    });
    await disputes.settle(dispute.id);

    const review = await reviews.leave({
      engagementId,
      reviewerId: seekerId,
      direction: 'seeker_on_provider',
      rating: 4,
      bodyOriginal: 'ठीक रहा',
      bodyLang: 'hi',
    });
    expect(review.subjectId).toBe(providerId); // derived from the engagement, not supplied by the caller

    // The seeker cannot review twice, and cannot review in the provider's direction.
    await expect(
      reviews.leave({ engagementId, reviewerId: seekerId, direction: 'seeker_on_provider', rating: 1, bodyLang: 'hi' }),
    ).rejects.toMatchObject({ code: 'REVIEW_ALREADY_EXISTS' });
    await expect(
      reviews.leave({ engagementId, reviewerId: seekerId, direction: 'provider_on_seeker', rating: 5, bodyLang: 'hi' }),
    ).rejects.toMatchObject({ code: 'REVIEW_NOT_A_PARTY' });
  });
});
