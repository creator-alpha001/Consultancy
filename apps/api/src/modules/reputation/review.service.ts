import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import {
  reviewAlreadyExists,
  reviewEngagementNotEnded,
  reviewNotAParty,
  reviewNotFound,
  reviewRatingOutOfRange,
} from './errors';
import { LeaveReviewInput, ReviewRow } from './types';

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
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

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

    const res = await this.pool.query<ReviewDbRow>(
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
    return mapReview(res.rows[0]);
  }

  async get(id: string): Promise<ReviewRow> {
    const res = await this.pool.query<ReviewDbRow>(`SELECT * FROM reviews WHERE id = $1`, [id]);
    if (!res.rows[0]) throw reviewNotFound(id);
    return mapReview(res.rows[0]);
  }

  async listForEngagement(engagementId: string): Promise<ReviewRow[]> {
    const res = await this.pool.query<ReviewDbRow>(
      `SELECT * FROM reviews WHERE engagement_id = $1 ORDER BY created_at ASC`,
      [engagementId],
    );
    return res.rows.map(mapReview);
  }

  /** Reviews written about one user. Recency order — no "top reviews," no sorting by rating. */
  async listAboutUser(subjectId: string, limit = 50): Promise<ReviewRow[]> {
    const res = await this.pool.query<ReviewDbRow>(
      `SELECT * FROM reviews WHERE subject_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [subjectId, limit],
    );
    return res.rows.map(mapReview);
  }
}
