import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { submissionWrongStatus } from './errors';
import { SubmissionRow } from './types';

interface SubmissionDbRow {
  id: string;
  engagement_id: string;
  seeker_id: string;
  content_ref: string;
  note: string;
  submitted_at: Date;
}

function mapSubmission(row: SubmissionDbRow): SubmissionRow {
  return {
    id: row.id,
    engagementId: row.engagement_id,
    seekerId: row.seeker_id,
    contentRef: row.content_ref,
    note: row.note,
    submittedAt: row.submitted_at,
  };
}

/**
 * `content_ref` stands in for the real private-storage pointer (S3 key
 * behind `attachment_grants`, signed URLs, CLAUDE.md #29) — no object
 * storage is wired up in this environment. See TRACKER.md.
 */
@Injectable()
export class SubmissionService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async submit(input: { engagementId: string; seekerId: string; contentRef: string; note?: string }): Promise<SubmissionRow> {
    const engagement = await this.pool.query<{ status: string }>(
      `SELECT status FROM engagements WHERE id = $1`,
      [input.engagementId],
    );
    if (engagement.rows[0]?.status !== 'working') {
      throw submissionWrongStatus(input.engagementId, engagement.rows[0]?.status ?? 'unknown');
    }

    const res = await this.pool.query<SubmissionDbRow>(
      `INSERT INTO submissions (engagement_id, seeker_id, content_ref, note)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.engagementId, input.seekerId, input.contentRef, input.note ?? ''],
    );
    return mapSubmission(res.rows[0]);
  }

  async getLatestForEngagement(engagementId: string): Promise<SubmissionRow | null> {
    const res = await this.pool.query<SubmissionDbRow>(
      `SELECT * FROM submissions WHERE engagement_id = $1 ORDER BY submitted_at DESC LIMIT 1`,
      [engagementId],
    );
    return res.rows[0] ? mapSubmission(res.rows[0]) : null;
  }
}
