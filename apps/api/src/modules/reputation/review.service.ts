import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { FamilyManifestService } from '../domains/family-manifest.service';
import {
  reviewAlreadyExists,
  reviewEngagementNotEnded,
  reviewNotAParty,
  reviewNotFound,
  reviewRatingOutOfRange,
  reviewReplyAlreadyExists,
  reviewReplyEmpty,
  reviewReplyNotSubject,
  reviewUnknownDimension,
} from './errors';
import {
  LeaveReviewInput,
  ProviderReviewSummary,
  ReviewRow,
  ReviewWithContext,
} from './types';

interface ReviewDbRow {
  id: string;
  engagement_id: string;
  reviewer_id: string;
  subject_id: string;
  direction: ReviewRow['direction'];
  rating: number;
  body_original: string;
  body_lang: string;
}

function mapReview(row: ReviewDbRow): ReviewRow {
  return {
    id: row.id,
    engagementId: row.engagement_id,
    reviewerId: row.reviewer_id,
    subjectId: row.subject_id,
    direction: row.direction,
    rating: row.rating,
    bodyOriginal: row.body_original,
    bodyLang: row.body_lang,
  };
}

/**
 * Reviews are immutable once written and only possible on an engagement
 * that actually ended — both enforced by triggers in 0022, pre-checked
 * here for typed errors. The subject is derived from the engagement and
 * the direction, never taken from the caller: a client cannot nominate
 * who its review is about (CLAUDE.md #28).
 */
@Injectable()
export class ReviewService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(FamilyManifestService) private readonly families: FamilyManifestService,
  ) {}

  async leave(input: LeaveReviewInput): Promise<ReviewRow> {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw reviewRatingOutOfRange(input.rating);
    }

    const engagementRes = await this.pool.query<{ seeker_id: string; provider_id: string; status: string }>(
      `SELECT seeker_id, provider_id, status FROM engagements WHERE id = $1`,
      [input.engagementId],
    );
    const engagement = engagementRes.rows[0];
    if (!engagement) throw reviewNotFound(input.engagementId);

    if (engagement.status !== 'completed' && engagement.status !== 'refunded') {
      throw reviewEngagementNotEnded(input.engagementId, engagement.status);
    }

    // Derived, never client-supplied.
    const [expectedReviewerId, subjectId] =
      input.direction === 'seeker_on_provider'
        ? [engagement.seeker_id, engagement.provider_id]
        : [engagement.provider_id, engagement.seeker_id];

    if (input.reviewerId !== expectedReviewerId) {
      throw reviewNotAParty(input.engagementId, input.reviewerId, input.direction);
    }

    const existing = await this.pool.query(
      `SELECT 1 FROM reviews WHERE engagement_id = $1 AND direction = $2`,
      [input.engagementId, input.direction],
    );
    if (existing.rows.length > 0) {
      throw reviewAlreadyExists(input.engagementId, input.direction);
    }

    // Dimensions are validated BEFORE anything is written: a review that
    // landed with half its scores rejected would be worse than one
    // refused outright.
    const scores = input.dimensionScores ?? [];
    if (scores.length > 0) {
      const allowed = await this.dimensionCodesFor(input.engagementId);
      for (const s of scores) {
        if (!allowed.codes.has(s.dimensionCode)) {
          throw reviewUnknownDimension(s.dimensionCode, allowed.familyCode);
        }
        if (!Number.isInteger(s.score) || s.score < 1 || s.score > 5) {
          throw reviewRatingOutOfRange(s.score);
        }
      }
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query<ReviewDbRow>(
        `INSERT INTO reviews (engagement_id, reviewer_id, subject_id, direction, rating, body_original, body_lang)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          input.engagementId,
          input.reviewerId,
          subjectId,
          input.direction,
          input.rating,
          input.bodyOriginal ?? '',
          input.bodyLang,
        ],
      );
      const review = res.rows[0];

      for (const s of scores) {
        await client.query(
          `INSERT INTO review_dimension_scores (review_id, dimension_code, score) VALUES ($1, $2, $3)`,
          [review.id, s.dimensionCode, s.score],
        );
      }

      await client.query('COMMIT');
      return mapReview(review);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** The family's declared review dimensions, resolved via the engagement's domain. */
  private async dimensionCodesFor(engagementId: string): Promise<{ codes: Set<string>; familyCode: string }> {
    const res = await this.pool.query<{ family_code: string; manifest: { reviewDimensions?: Array<{ code: string }> } }>(
      `SELECT f.code AS family_code, f.manifest
         FROM engagements e
         JOIN domains d ON d.code = e.domain_code
         JOIN domain_families f ON f.code = d.family_code
        WHERE e.id = $1`,
      [engagementId],
    );
    const row = res.rows[0];
    if (!row) return { codes: new Set(), familyCode: 'unknown' };
    const dims = row.manifest?.reviewDimensions ?? [];
    return { codes: new Set(dims.map((d) => d.code)), familyCode: row.family_code };
  }

  /**
   * A reply, by the person the review is about and nobody else.
   *
   * A review the reviewed party cannot answer is a weapon rather than a
   * record — and one that could be edited later would be worth as little
   * as an editable review. Both are enforced by triggers in 0031; these
   * are pre-checks for typed errors.
   */
  async reply(input: {
    reviewId: string;
    authorId: string;
    bodyOriginal: string;
    bodyLang: string;
  }): Promise<{ reviewId: string; bodyOriginal: string; bodyLang: string; createdAt: Date }> {
    if (input.bodyOriginal.trim().length === 0) throw reviewReplyEmpty();

    const review = await this.get(input.reviewId);
    if (review.subjectId !== input.authorId) throw reviewReplyNotSubject(input.reviewId);

    const existing = await this.pool.query(`SELECT 1 FROM review_replies WHERE review_id = $1`, [input.reviewId]);
    if (existing.rows.length > 0) throw reviewReplyAlreadyExists(input.reviewId);

    const res = await this.pool.query<{ created_at: Date }>(
      `INSERT INTO review_replies (review_id, author_id, body_original, body_lang)
       VALUES ($1, $2, $3, $4) RETURNING created_at`,
      [input.reviewId, input.authorId, input.bodyOriginal, input.bodyLang],
    );
    return {
      reviewId: input.reviewId,
      bodyOriginal: input.bodyOriginal,
      bodyLang: input.bodyLang,
      createdAt: res.rows[0].created_at,
    };
  }

  async get(id: string): Promise<ReviewRow> {
    const res = await this.pool.query<ReviewDbRow>(`SELECT * FROM reviews WHERE id = $1`, [id]);
    if (!res.rows[0]) throw reviewNotFound(id);
    return mapReview(res.rows[0]);
  }

  async listForEngagement(engagementId: string): Promise<ReviewRow[]> {
    const res = await this.pool.query<ReviewDbRow>(
      `SELECT r.* FROM reviews r
        WHERE r.engagement_id = $1
          AND NOT EXISTS (SELECT 1 FROM content_holds h WHERE h.subject_type = 'review' AND h.subject_id = r.id)
        ORDER BY r.created_at ASC`,
      [engagementId],
    );
    return res.rows.map(mapReview);
  }

  /**
   * Reviews written about one user. Recency order — no "top reviews," no
   * sorting by rating.
   *
   * Carries whether each one has already been answered. Without that a
   * caller cannot tell an unanswered review from an answered one, and
   * the workspace offered a reply box on every single review — including
   * the ones already replied to, where posting fails with
   * REVIEW_REPLY_ALREADY_EXISTS. The right of reply is exercised once
   * per review, so "has it been used" is part of the review.
   */
  async listAboutUser(
    subjectId: string,
    limit = 50,
  ): Promise<Array<ReviewRow & { reply: { bodyOriginal: string; bodyLang: string } | null }>> {
    const res = await this.pool.query<ReviewDbRow & { reply_body: string | null; reply_lang: string | null }>(
      `SELECT r.*, rr.body_original AS reply_body, rr.body_lang AS reply_lang
         FROM reviews r
         LEFT JOIN review_replies rr ON rr.review_id = r.id
        WHERE r.subject_id = $1
          AND NOT EXISTS (SELECT 1 FROM content_holds h WHERE h.subject_type = 'review' AND h.subject_id = r.id)
        ORDER BY r.created_at DESC
        LIMIT $2`,
      [subjectId, limit],
    );
    return res.rows.map((row) => ({
      ...mapReview(row),
      reply:
        row.reply_body === null
          ? null
          : { bodyOriginal: row.reply_body, bodyLang: row.reply_lang ?? 'en' },
    }));
  }

  /**
   * Reviews about one provider, with the context that makes them worth
   * reading: which skills the engagement actually required, what kind of
   * engagement it was, the per-dimension scores, and any reply.
   *
   * Skills come from `engagement_skills` — the snapshot taken at
   * `agree()`, not whatever the category maps to today. A review counts
   * toward the work it was actually for.
   *
   * Recency order, always. Sorting by rating would put a provider's best
   * reviews permanently on top, which is a different product.
   */
  async listAboutProviderWithContext(providerId: string, limit = 30): Promise<ReviewWithContext[]> {
    const res = await this.pool.query<
      ReviewDbRow & {
        created_at: Date;
        engagement_type: string | null;
        skills: Array<{ skillId: string; code: string; labels: Record<string, string> }> | null;
        dimension_scores: Array<{ dimensionCode: string; score: number }> | null;
        reply_body: string | null;
        reply_lang: string | null;
        reply_at: Date | null;
      }
    >(
      `SELECT r.*, e.engagement_type,
              (SELECT json_agg(json_build_object('skillId', s.id, 'code', s.code, 'labels', s.labels))
                 FROM engagement_skills es JOIN skills s ON s.id = es.skill_id
                WHERE es.engagement_id = r.engagement_id) AS skills,
              (SELECT json_agg(json_build_object('dimensionCode', ds.dimension_code, 'score', ds.score)
                               ORDER BY ds.dimension_code)
                 FROM review_dimension_scores ds WHERE ds.review_id = r.id) AS dimension_scores,
              rr.body_original AS reply_body, rr.body_lang AS reply_lang, rr.created_at AS reply_at
         FROM reviews r
         JOIN engagements e ON e.id = r.engagement_id
         LEFT JOIN review_replies rr ON rr.review_id = r.id
        WHERE r.subject_id = $1 AND r.direction = 'seeker_on_provider'
          AND NOT EXISTS (SELECT 1 FROM content_holds h WHERE h.subject_type = 'review' AND h.subject_id = r.id)
        ORDER BY r.created_at DESC
        LIMIT $2`,
      [providerId, limit],
    );

    return res.rows.map((row) => ({
      ...mapReview(row),
      createdAt: row.created_at,
      engagementType: row.engagement_type,
      skills: row.skills ?? [],
      dimensionScores: row.dimension_scores ?? [],
      reply:
        row.reply_body === null
          ? null
          : { bodyOriginal: row.reply_body, bodyLang: row.reply_lang ?? 'en', createdAt: row.reply_at as Date },
    }));
  }

  /** A provider's own review record. Reads the views from 0031 — never a stored count. */
  async summaryFor(providerId: string): Promise<ProviderReviewSummary> {
    const [overall, dims] = await Promise.all([
      this.pool.query<{
        review_count: string; avg_rating: string | null;
        count_1: string; count_2: string; count_3: string; count_4: string; count_5: string;
        replied_count: string; last_review_at: Date | null;
      }>(`SELECT * FROM provider_review_summary WHERE provider_id = $1`, [providerId]),
      this.pool.query<{ dimension_code: string; score_count: string; avg_score: string }>(
        `SELECT dimension_code, score_count, avg_score
           FROM provider_review_dimension_summary
          WHERE provider_id = $1
          ORDER BY dimension_code`,
        [providerId],
      ),
    ]);

    const row = overall.rows[0];
    return {
      reviewCount: row ? Number(row.review_count) : 0,
      // null until someone has actually reviewed them — never defaulted
      // to a flattering number.
      avgRating: row?.avg_rating === null || row === undefined ? null : Number(row.avg_rating),
      distribution: {
        1: row ? Number(row.count_1) : 0,
        2: row ? Number(row.count_2) : 0,
        3: row ? Number(row.count_3) : 0,
        4: row ? Number(row.count_4) : 0,
        5: row ? Number(row.count_5) : 0,
      },
      repliedCount: row ? Number(row.replied_count) : 0,
      lastReviewAt: row?.last_review_at ?? null,
      dimensions: dims.rows.map((d) => ({
        dimensionCode: d.dimension_code,
        scoreCount: Number(d.score_count),
        avgScore: Number(d.avg_score),
      })),
    };
  }
}
