import { Pool, PoolClient } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, resetDatabase, seedEngagement, seedUsers } from '../test-utils';

/**
 * "Any DB invariant touched has a test that attempts violation in raw
 * SQL and asserts failure" (CLAUDE.md, Definition of done).
 *
 * 0031 added three: a reply may only be written by the person the review
 * is about, dimension scores are 1–5, and both are append-only. These go
 * straight at the database, so they prove Postgres refuses the bad
 * shapes rather than that the service happens to avoid them.
 */
describe('review depth invariants (raw SQL)', () => {
  const pool = createPool();

  beforeEach(async () => {
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function expectRejected(fn: (c: PoolClient) => Promise<void>): Promise<Error> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      try {
        await fn(client);
        await client.query('COMMIT');
        throw new Error('__NO_ERROR_THROWN__');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        expect((err as Error).message).not.toBe('__NO_ERROR_THROWN__');
        return err as Error;
      }
    } finally {
      client.release();
    }
  }

  /** A review on a genuinely completed engagement — the trigger from 0022 demands one. */
  async function seedReview(): Promise<{ reviewId: string; seekerId: string; providerId: string }> {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    // Force the terminal status past the lifecycle triggers: this test is
    // about 0031's rules, not about how an engagement gets to completed.
    await pool.query(`ALTER TABLE engagements DISABLE TRIGGER USER`);
    try {
      await pool.query(`UPDATE engagements SET status = 'completed' WHERE id = $1`, [engagementId]);
    } finally {
      await pool.query(`ALTER TABLE engagements ENABLE TRIGGER USER`);
    }

    const res = await pool.query<{ id: string }>(
      `INSERT INTO reviews (engagement_id, reviewer_id, subject_id, direction, rating, body_original, body_lang)
       VALUES ($1, $2, $3, 'seeker_on_provider', 4, 'ok', 'en') RETURNING id`,
      [engagementId, seekerId, providerId],
    );
    return { reviewId: res.rows[0].id, seekerId, providerId };
  }

  describe('the right of reply belongs to the subject alone', () => {
    it('refuses a reply from the reviewer', async () => {
      const { reviewId, seekerId } = await seedReview();
      const err = await expectRejected(async (c) => {
        await c.query(
          `INSERT INTO review_replies (review_id, author_id, body_original, body_lang)
           VALUES ($1, $2, 'let me add to my own review', 'en')`,
          [reviewId, seekerId],
        );
      });
      expect(err.message).toMatch(/only the subject of a review may reply/);
    });

    it('refuses a reply from an unrelated user', async () => {
      const { reviewId } = await seedReview();
      const stranger = await seedUsers(pool);
      const err = await expectRejected(async (c) => {
        await c.query(
          `INSERT INTO review_replies (review_id, author_id, body_original, body_lang)
           VALUES ($1, $2, 'nothing to do with me', 'en')`,
          [reviewId, stranger.providerId],
        );
      });
      expect(err.message).toMatch(/only the subject of a review may reply/);
    });

    it('allows exactly one reply, from the subject', async () => {
      const { reviewId, providerId } = await seedReview();
      await pool.query(
        `INSERT INTO review_replies (review_id, author_id, body_original, body_lang)
         VALUES ($1, $2, 'fair — here is what I changed', 'en')`,
        [reviewId, providerId],
      );

      const err = await expectRejected(async (c) => {
        await c.query(
          `INSERT INTO review_replies (review_id, author_id, body_original, body_lang)
           VALUES ($1, $2, 'and another thing', 'en')`,
          [reviewId, providerId],
        );
      });
      expect(err.message).toMatch(/duplicate key|review_replies_review_id_key/);
    });

    it('refuses an empty reply', async () => {
      const { reviewId, providerId } = await seedReview();
      const err = await expectRejected(async (c) => {
        await c.query(
          `INSERT INTO review_replies (review_id, author_id, body_original, body_lang)
           VALUES ($1, $2, '   ', 'en')`,
          [reviewId, providerId],
        );
      });
      expect(err.message).toMatch(/body_original/);
    });

    it('refuses to edit or delete a reply', async () => {
      const { reviewId, providerId } = await seedReview();
      await pool.query(
        `INSERT INTO review_replies (review_id, author_id, body_original, body_lang)
         VALUES ($1, $2, 'my answer', 'en')`,
        [reviewId, providerId],
      );

      const edit = await expectRejected(async (c) => {
        await c.query(`UPDATE review_replies SET body_original = 'rewritten' WHERE review_id = $1`, [reviewId]);
      });
      expect(edit.message).toMatch(/append-only|immutable|cannot be/i);

      const del = await expectRejected(async (c) => {
        await c.query(`DELETE FROM review_replies WHERE review_id = $1`, [reviewId]);
      });
      expect(del.message).toMatch(/append-only|immutable|cannot be/i);
    });
  });

  describe('dimension scores', () => {
    it('refuses a score outside 1–5', async () => {
      const { reviewId } = await seedReview();
      for (const score of [0, 6, -1]) {
        const err = await expectRejected(async (c) => {
          await c.query(
            `INSERT INTO review_dimension_scores (review_id, dimension_code, score) VALUES ($1, 'clarity', $2)`,
            [reviewId, score],
          );
        });
        expect(err.message).toMatch(/score/);
      }
    });

    it('refuses two scores for the same dimension on one review', async () => {
      const { reviewId } = await seedReview();
      await pool.query(
        `INSERT INTO review_dimension_scores (review_id, dimension_code, score) VALUES ($1, 'clarity', 5)`,
        [reviewId],
      );
      const err = await expectRejected(async (c) => {
        await c.query(
          `INSERT INTO review_dimension_scores (review_id, dimension_code, score) VALUES ($1, 'clarity', 1)`,
          [reviewId],
        );
      });
      expect(err.message).toMatch(/duplicate key|review_dimension_scores_pkey/);
    });

    it('refuses to revise a score after the fact', async () => {
      const { reviewId } = await seedReview();
      await pool.query(
        `INSERT INTO review_dimension_scores (review_id, dimension_code, score) VALUES ($1, 'clarity', 2)`,
        [reviewId],
      );
      const err = await expectRejected(async (c) => {
        await c.query(
          `UPDATE review_dimension_scores SET score = 5 WHERE review_id = $1 AND dimension_code = 'clarity'`,
          [reviewId],
        );
      });
      expect(err.message).toMatch(/append-only|immutable|cannot be/i);
    });
  });

  describe('credential publication', () => {
    it('defaults public_fields to empty, so a type that says nothing publishes nothing', async () => {
      // Fail closed. A credential type added without anyone thinking about
      // publication must not leak whatever happens to sit in verifier_data.
      const def = await pool.query<{ column_default: string | null; is_nullable: string }>(
        `SELECT column_default, is_nullable FROM information_schema.columns
          WHERE table_name = 'credential_types' AND column_name = 'public_fields'`,
      );
      expect(def.rows[0].column_default).toMatch(/\{\}/);
      expect(def.rows[0].is_nullable).toBe('NO');
    });
  });
});
