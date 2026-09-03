import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, resetDatabase } from '../test-utils';

/**
 * Raw-SQL invariant tests for annotations. These bypass every service —
 * if a rule only holds because `EvaluationService` remembers to check it,
 * it does not hold.
 *
 * The one that matters most: a returned evaluation's remarks are a record
 * of what the seeker read. An assessment that could be quietly edited
 * after delivery is not evidence of anything, and is the same reasoning
 * that makes a locked agenda immutable (#11).
 */
describe('annotation invariants (raw SQL)', () => {
  const pool = createPool();

  beforeEach(async () => {
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  /** An open evaluation with a real engagement behind it. */
  async function openEvaluation(): Promise<string> {
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const seeker = await pool.query<{ id: string }>(
      `INSERT INTO users (email, role, adult_confirmed_at, status)
       VALUES ($1, 'seeker', now(), 'active') RETURNING id`,
      [`s+${unique}@test.local`],
    );
    const provider = await pool.query<{ id: string }>(
      `INSERT INTO users (email, role, adult_confirmed_at, status)
       VALUES ($1, 'provider', now(), 'active') RETURNING id`,
      [`p+${unique}@test.local`],
    );
    const engagement = await pool.query<{ id: string }>(
      `INSERT INTO engagements (seeker_id, provider_id, currency, status, engagement_type)
       VALUES ($1, $2, 'INR', 'draft', 'document_review') RETURNING id`,
      [seeker.rows[0].id, provider.rows[0].id],
    );
    const submission = await pool.query<{ id: string }>(
      `INSERT INTO submissions (engagement_id, seeker_id, content_ref, note)
       VALUES ($1, $2, 'ref', '') RETURNING id`,
      [engagement.rows[0].id, seeker.rows[0].id],
    );
    const evaluation = await pool.query<{ id: string }>(
      `INSERT INTO evaluations (engagement_id, submission_id, provider_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [engagement.rows[0].id, submission.rows[0].id, provider.rows[0].id],
    );
    return evaluation.rows[0].id;
  }

  async function addAnnotation(
    evaluationId: string,
    opts: { ordinal?: number; x?: number | null; y?: number | null; text?: string } = {},
  ): Promise<unknown> {
    return pool.query(
      `INSERT INTO evaluation_annotations (evaluation_id, ordinal, page, anchor_x, anchor_y, body_text, body_lang)
       VALUES ($1, $2, 1, $3, $4, $5, 'en')`,
      [
        evaluationId,
        opts.ordinal ?? 1,
        opts.x === undefined ? 0.5 : opts.x,
        opts.y === undefined ? 0.5 : opts.y,
        opts.text ?? 'this states rather than examines',
      ],
    );
  }

  describe('a returned assessment is a record', () => {
    it('refuses a new remark once the evaluation is returned', async () => {
      const evaluationId = await openEvaluation();
      await pool.query(`UPDATE evaluations SET returned_at = now() WHERE id = $1`, [evaluationId]);

      await expect(addAnnotation(evaluationId)).rejects.toThrow(
        /annotations are a record and cannot be changed/,
      );
    });

    it('refuses editing a remark the seeker has already read', async () => {
      const evaluationId = await openEvaluation();
      await addAnnotation(evaluationId);
      await pool.query(`UPDATE evaluations SET returned_at = now() WHERE id = $1`, [evaluationId]);

      await expect(
        pool.query(`UPDATE evaluation_annotations SET body_text = 'something else' WHERE evaluation_id = $1`, [
          evaluationId,
        ]),
      ).rejects.toThrow(/annotations are a record and cannot be changed/);
    });

    it('refuses deleting one, which is how a remark would be disowned', async () => {
      const evaluationId = await openEvaluation();
      await addAnnotation(evaluationId);
      await pool.query(`UPDATE evaluations SET returned_at = now() WHERE id = $1`, [evaluationId]);

      await expect(
        pool.query(`DELETE FROM evaluation_annotations WHERE evaluation_id = $1`, [evaluationId]),
      ).rejects.toThrow(/annotations are a record and cannot be changed/);
    });

    it('allows all three while the evaluation is still open', async () => {
      const evaluationId = await openEvaluation();
      await expect(addAnnotation(evaluationId)).resolves.toBeDefined();
      await expect(
        pool.query(`UPDATE evaluation_annotations SET body_text = 'revised' WHERE evaluation_id = $1`, [
          evaluationId,
        ]),
      ).resolves.toBeDefined();
      await expect(
        pool.query(`DELETE FROM evaluation_annotations WHERE evaluation_id = $1`, [evaluationId]),
      ).resolves.toBeDefined();
    });
  });

  describe('an anchor is a point or it is nothing', () => {
    it('refuses half an anchor', async () => {
      const evaluationId = await openEvaluation();
      await expect(addAnnotation(evaluationId, { x: 0.5, y: null })).rejects.toThrow(
        /annotation_anchor_complete/,
      );
      await expect(addAnnotation(evaluationId, { x: null, y: 0.5 })).rejects.toThrow(
        /annotation_anchor_complete/,
      );
    });

    it('allows no anchor at all — a remark about the page, not a point on it', async () => {
      const evaluationId = await openEvaluation();
      await expect(addAnnotation(evaluationId, { x: null, y: null })).resolves.toBeDefined();
    });

    it('refuses a position outside the page', async () => {
      const evaluationId = await openEvaluation();
      await expect(addAnnotation(evaluationId, { x: 1.5, y: 0.5 })).rejects.toThrow(/anchor_x/);
      await expect(addAnnotation(evaluationId, { x: 0.5, y: -0.1 })).rejects.toThrow(/anchor_y/);
    });
  });

  describe('pin numbers', () => {
    it('refuses two remarks claiming the same pin number', async () => {
      // "Pin 4" is cited in disputes and tapped by the seeker. Two of them
      // would make the citation ambiguous.
      const evaluationId = await openEvaluation();
      await addAnnotation(evaluationId, { ordinal: 1 });
      await expect(addAnnotation(evaluationId, { ordinal: 1 })).rejects.toThrow(
        /annotation_ordinal_unique/,
      );
    });

    it('refuses an empty remark — a pin with nothing behind it is worse than no pin', async () => {
      const evaluationId = await openEvaluation();
      await expect(addAnnotation(evaluationId, { text: '   ' })).rejects.toThrow(/body_text/);
    });
  });
});
