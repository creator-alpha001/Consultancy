import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, resetDatabase, seedAdminUser, seedUsers, seedWorkingEngagement } from '../test-utils';

/**
 * Raw-SQL invariant tests for M7. Every one of these attempts the
 * violation directly against the database, bypassing every service — if
 * a rule only holds because a service happens to check it first, it does
 * not hold.
 *
 * The centrepiece is `trg_ruling_author_is_human_admin`: CLAUDE.md #18,
 * "AI never rules on a dispute," as something the database refuses
 * rather than something the code promises.
 */
describe('trust invariants (raw SQL)', () => {
  const pool = createPool();

  beforeEach(async () => {
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedDisputedEngagement(): Promise<{
    engagementId: string;
    disputeId: string;
    seekerId: string;
    providerId: string;
  }> {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedWorkingEngagement(pool, seekerId, providerId, 'INR', 100_000n);
    await pool.query(`UPDATE engagements SET status = 'disputed' WHERE id = $1`, [engagementId]);
    await pool.query(`UPDATE escrows SET status = 'disputed_hold' WHERE engagement_id = $1`, [engagementId]);
    const dispute = await pool.query<{ id: string }>(
      `INSERT INTO disputes (engagement_id, raised_by, reason_code, body_original, body_lang)
       VALUES ($1, $2, 'not_as_agreed', 'the evaluation never came back', 'hi') RETURNING id`,
      [engagementId, seekerId],
    );
    return { engagementId, disputeId: dispute.rows[0].id, seekerId, providerId };
  }

  describe('hard rule #18 — AI never rules on a dispute', () => {
    it('rejects a ruling whose author is not an admin', async () => {
      const { disputeId, seekerId } = await seedDisputedEngagement();
      await expect(
        pool.query(
          `INSERT INTO dispute_rulings (dispute_id, tier, ruled_by, outcome, rationale)
           VALUES ($1, 1, $2, 'refund_to_seeker', 'because')`,
          [disputeId, seekerId], // a seeker, not an admin
        ),
      ).rejects.toThrow(/must be made by a human admin/);
    });

    it('rejects a ruling whose author is the provider', async () => {
      const { disputeId, providerId } = await seedDisputedEngagement();
      await expect(
        pool.query(
          `INSERT INTO dispute_rulings (dispute_id, tier, ruled_by, outcome, rationale)
           VALUES ($1, 1, $2, 'release_to_provider', 'I did the work')`,
          [disputeId, providerId],
        ),
      ).rejects.toThrow(/must be made by a human admin/);
    });

    it('accepts a ruling from an admin', async () => {
      const { disputeId } = await seedDisputedEngagement();
      const adminId = await seedAdminUser(pool);
      await expect(
        pool.query(
          `INSERT INTO dispute_rulings (dispute_id, tier, ruled_by, outcome, rationale)
           VALUES ($1, 1, $2, 'refund_to_seeker', 'evaluation was never returned')`,
          [disputeId, adminId],
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('rulings and appeals are append-only', () => {
    it('rejects editing a ruling after the fact', async () => {
      const { disputeId } = await seedDisputedEngagement();
      const adminId = await seedAdminUser(pool);
      const ruling = await pool.query<{ id: string }>(
        `INSERT INTO dispute_rulings (dispute_id, tier, ruled_by, outcome, rationale)
         VALUES ($1, 1, $2, 'refund_to_seeker', 'original reasoning') RETURNING id`,
        [disputeId, adminId],
      );
      await expect(
        pool.query(`UPDATE dispute_rulings SET rationale = 'rewritten' WHERE id = $1`, [ruling.rows[0].id]),
      ).rejects.toThrow(/append-only/);
    });

    it('rejects deleting evidence', async () => {
      const { disputeId } = await seedDisputedEngagement();
      const evidence = await pool.query<{ id: string }>(
        `INSERT INTO dispute_evidence (dispute_id, kind, content_original, content_lang)
         VALUES ($1, 'note', 'inconvenient fact', 'hi') RETURNING id`,
        [disputeId],
      );
      await expect(
        pool.query(`DELETE FROM dispute_evidence WHERE id = $1`, [evidence.rows[0].id]),
      ).rejects.toThrow(/append-only/);
    });

    it('rejects a second ruling at the same tier', async () => {
      const { disputeId } = await seedDisputedEngagement();
      const adminId = await seedAdminUser(pool);
      await pool.query(
        `INSERT INTO dispute_rulings (dispute_id, tier, ruled_by, outcome, rationale)
         VALUES ($1, 1, $2, 'refund_to_seeker', 'first')`,
        [disputeId, adminId],
      );
      await expect(
        pool.query(
          `INSERT INTO dispute_rulings (dispute_id, tier, ruled_by, outcome, rationale)
           VALUES ($1, 1, $2, 'release_to_provider', 'changed my mind')`,
          [disputeId, adminId],
        ),
      ).rejects.toThrow(/duplicate key/);
    });
  });

  describe('a split ruling must actually split', () => {
    it('rejects a split that awards the entire escrow', async () => {
      const { disputeId } = await seedDisputedEngagement();
      const adminId = await seedAdminUser(pool);
      await expect(
        pool.query(
          `INSERT INTO dispute_rulings (dispute_id, tier, ruled_by, outcome, seeker_refund_paise, rationale)
           VALUES ($1, 1, $2, 'split', 100000, 'all of it')`,
          [disputeId, adminId],
        ),
      ).rejects.toThrow(/a full award is a refund, not a split/);
    });

    it('rejects a split with no amount, and a non-split carrying one', async () => {
      const { disputeId } = await seedDisputedEngagement();
      const adminId = await seedAdminUser(pool);
      await expect(
        pool.query(
          `INSERT INTO dispute_rulings (dispute_id, tier, ruled_by, outcome, rationale)
           VALUES ($1, 1, $2, 'split', 'how much?')`,
          [disputeId, adminId],
        ),
      ).rejects.toThrow();
      await expect(
        pool.query(
          `INSERT INTO dispute_rulings (dispute_id, tier, ruled_by, outcome, seeker_refund_paise, rationale)
           VALUES ($1, 2, $2, 'refund_to_seeker', 40000, 'why an amount?')`,
          [disputeId, adminId],
        ),
      ).rejects.toThrow();
    });

    it('accepts a split strictly inside the escrow amount', async () => {
      const { disputeId } = await seedDisputedEngagement();
      const adminId = await seedAdminUser(pool);
      await expect(
        pool.query(
          `INSERT INTO dispute_rulings (dispute_id, tier, ruled_by, outcome, seeker_refund_paise, rationale)
           VALUES ($1, 1, $2, 'split', 40000, 'partially delivered')`,
          [disputeId, adminId],
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('appeals', () => {
    it('rejects an appeal by someone who is not a party to the engagement', async () => {
      const { disputeId } = await seedDisputedEngagement();
      const adminId = await seedAdminUser(pool);
      const ruling = await pool.query<{ id: string }>(
        `INSERT INTO dispute_rulings (dispute_id, tier, ruled_by, outcome, rationale)
         VALUES ($1, 1, $2, 'refund_to_seeker', 'r') RETURNING id`,
        [disputeId, adminId],
      );
      const { seekerId: strangerId } = await seedUsers(pool);
      await expect(
        pool.query(
          `INSERT INTO dispute_appeals (dispute_id, ruling_id, appealed_by, from_tier, to_tier, body_original, body_lang)
           VALUES ($1, $2, $3, 1, 2, 'let me in', 'en')`,
          [disputeId, ruling.rows[0].id, strangerId],
        ),
      ).rejects.toThrow(/not a party to dispute/);
    });

    it('rejects appealing the same ruling twice', async () => {
      const { disputeId, providerId } = await seedDisputedEngagement();
      const adminId = await seedAdminUser(pool);
      const ruling = await pool.query<{ id: string }>(
        `INSERT INTO dispute_rulings (dispute_id, tier, ruled_by, outcome, rationale)
         VALUES ($1, 1, $2, 'refund_to_seeker', 'r') RETURNING id`,
        [disputeId, adminId],
      );
      await pool.query(
        `INSERT INTO dispute_appeals (dispute_id, ruling_id, appealed_by, from_tier, to_tier, body_original, body_lang)
         VALUES ($1, $2, $3, 1, 2, 'first appeal', 'hi')`,
        [disputeId, ruling.rows[0].id, providerId],
      );
      await expect(
        pool.query(
          `INSERT INTO dispute_appeals (dispute_id, ruling_id, appealed_by, from_tier, to_tier, body_original, body_lang)
           VALUES ($1, $2, $3, 1, 2, 'again', 'hi')`,
          [disputeId, ruling.rows[0].id, providerId],
        ),
      ).rejects.toThrow(/duplicate key/);
    });

    it('rejects an appeal that does not escalate', async () => {
      const { disputeId, providerId } = await seedDisputedEngagement();
      const adminId = await seedAdminUser(pool);
      const ruling = await pool.query<{ id: string }>(
        `INSERT INTO dispute_rulings (dispute_id, tier, ruled_by, outcome, rationale)
         VALUES ($1, 1, $2, 'refund_to_seeker', 'r') RETURNING id`,
        [disputeId, adminId],
      );
      await expect(
        pool.query(
          `INSERT INTO dispute_appeals (dispute_id, ruling_id, appealed_by, from_tier, to_tier, body_original, body_lang)
           VALUES ($1, $2, $3, 2, 2, 'sideways', 'hi')`,
          [disputeId, ruling.rows[0].id, providerId],
        ),
      ).rejects.toThrow();
    });
  });

  describe('dispute lifecycle', () => {
    it('rejects an invalid dispute transition', async () => {
      const { disputeId } = await seedDisputedEngagement();
      await pool.query(`UPDATE disputes SET status = 'withdrawn' WHERE id = $1`, [disputeId]);
      await expect(
        pool.query(`UPDATE disputes SET status = 'ruled' WHERE id = $1`, [disputeId]),
      ).rejects.toThrow(/invalid dispute transition/);
    });

    it('rejects a second dispute on the same engagement', async () => {
      const { engagementId, seekerId } = await seedDisputedEngagement();
      await expect(
        pool.query(
          `INSERT INTO disputes (engagement_id, raised_by, reason_code, body_original, body_lang)
           VALUES ($1, $2, 'again', 'second grievance', 'hi')`,
          [engagementId, seekerId],
        ),
      ).rejects.toThrow(/duplicate key/);
    });
  });

  describe('reviews', () => {
    it('rejects a review of an engagement that has not ended', async () => {
      const { seekerId, providerId } = await seedUsers(pool);
      const engagementId = await seedWorkingEngagement(pool, seekerId, providerId);
      await expect(
        pool.query(
          `INSERT INTO reviews (engagement_id, reviewer_id, subject_id, direction, rating, body_lang)
           VALUES ($1, $2, $3, 'seeker_on_provider', 5, 'hi')`,
          [engagementId, seekerId, providerId],
        ),
      ).rejects.toThrow(/only possible once it has ended/);
    });

    it('rejects a review written by someone who was not a party', async () => {
      const { seekerId, providerId } = await seedUsers(pool);
      const engagementId = await seedWorkingEngagement(pool, seekerId, providerId);
      await pool.query(`UPDATE engagements SET status = 'delivered' WHERE id = $1`, [engagementId]);
      await pool.query(`UPDATE engagements SET status = 'assessed' WHERE id = $1`, [engagementId]);
      await pool.query(`UPDATE engagements SET status = 'completed' WHERE id = $1`, [engagementId]);
      const { seekerId: strangerId } = await seedUsers(pool);
      await expect(
        pool.query(
          `INSERT INTO reviews (engagement_id, reviewer_id, subject_id, direction, rating, body_lang)
           VALUES ($1, $2, $3, 'seeker_on_provider', 1, 'hi')`,
          [engagementId, strangerId, providerId],
        ),
      ).rejects.toThrow(/must be written by its seeker/);
    });

    it('rejects editing a review, and a second review in the same direction', async () => {
      const { seekerId, providerId } = await seedUsers(pool);
      const engagementId = await seedWorkingEngagement(pool, seekerId, providerId);
      await pool.query(`UPDATE engagements SET status = 'delivered' WHERE id = $1`, [engagementId]);
      await pool.query(`UPDATE engagements SET status = 'assessed' WHERE id = $1`, [engagementId]);
      await pool.query(`UPDATE engagements SET status = 'completed' WHERE id = $1`, [engagementId]);
      const review = await pool.query<{ id: string }>(
        `INSERT INTO reviews (engagement_id, reviewer_id, subject_id, direction, rating, body_lang)
         VALUES ($1, $2, $3, 'seeker_on_provider', 4, 'hi') RETURNING id`,
        [engagementId, seekerId, providerId],
      );
      await expect(
        pool.query(`UPDATE reviews SET rating = 1 WHERE id = $1`, [review.rows[0].id]),
      ).rejects.toThrow(/append-only/);
      await expect(
        pool.query(
          `INSERT INTO reviews (engagement_id, reviewer_id, subject_id, direction, rating, body_lang)
           VALUES ($1, $2, $3, 'seeker_on_provider', 1, 'hi')`,
          [engagementId, seekerId, providerId],
        ),
      ).rejects.toThrow(/duplicate key/);
    });

    it('rejects a rating outside 1–5', async () => {
      const { seekerId, providerId } = await seedUsers(pool);
      const engagementId = await seedWorkingEngagement(pool, seekerId, providerId);
      await pool.query(`UPDATE engagements SET status = 'delivered' WHERE id = $1`, [engagementId]);
      await pool.query(`UPDATE engagements SET status = 'assessed' WHERE id = $1`, [engagementId]);
      await pool.query(`UPDATE engagements SET status = 'completed' WHERE id = $1`, [engagementId]);
      await expect(
        pool.query(
          `INSERT INTO reviews (engagement_id, reviewer_id, subject_id, direction, rating, body_lang)
           VALUES ($1, $2, $3, 'seeker_on_provider', 6, 'hi')`,
          [engagementId, seekerId, providerId],
        ),
      ).rejects.toThrow();
    });
  });

  describe('escrow split settlement', () => {
    /*
      This test used to assert the opposite: that `held -> settled_split`
      was refused, because a split could only follow a dispute ruling.
      That stopped being the rule when provider discounts landed
      (migration 0045) — a provider charging less than they published
      settles as a split from `held`, with no dispute having existed.

      Routing a discount through `disputed_hold` to preserve the old
      assertion would have been the wrong fix: it would stamp "disputed"
      on an engagement where nobody disagreed, and that word appears in
      evidence packets and in a provider's dispute rate.

      What is still invariant is below: a split cannot happen from a
      SETTLED escrow. That is the part that protects the money.
    */
    it('allows held -> settled_split, which is how a provider discount settles', async () => {
      const { seekerId, providerId } = await seedUsers(pool);
      const engagementId = await seedWorkingEngagement(pool, seekerId, providerId);
      await expect(
        pool.query(`UPDATE escrows SET status = 'settled_split' WHERE engagement_id = $1`, [engagementId]),
      ).resolves.toBeDefined();
    });

    it('rejects a split on an escrow that has already been released', async () => {
      const { seekerId, providerId } = await seedUsers(pool);
      const engagementId = await seedWorkingEngagement(pool, seekerId, providerId);
      await pool.query(`UPDATE escrows SET status = 'released' WHERE engagement_id = $1`, [engagementId]);
      await expect(
        pool.query(`UPDATE escrows SET status = 'settled_split' WHERE engagement_id = $1`, [engagementId]),
      ).rejects.toThrow(/invalid escrow transition released -> settled_split/);
    });

    it('rejects a split on an escrow that has already been refunded', async () => {
      const { seekerId, providerId } = await seedUsers(pool);
      const engagementId = await seedWorkingEngagement(pool, seekerId, providerId);
      await pool.query(`UPDATE escrows SET status = 'refunded' WHERE engagement_id = $1`, [engagementId]);
      await expect(
        pool.query(`UPDATE escrows SET status = 'settled_split' WHERE engagement_id = $1`, [engagementId]),
      ).rejects.toThrow(/invalid escrow transition refunded -> settled_split/);
    });

    it('allows disputed_hold -> settled_split', async () => {
      const { seekerId, providerId } = await seedUsers(pool);
      const engagementId = await seedWorkingEngagement(pool, seekerId, providerId);
      await pool.query(`UPDATE escrows SET status = 'disputed_hold' WHERE engagement_id = $1`, [engagementId]);
      await expect(
        pool.query(`UPDATE escrows SET status = 'settled_split' WHERE engagement_id = $1`, [engagementId]),
      ).resolves.toBeDefined();
    });
  });
});
