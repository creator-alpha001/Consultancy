import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { AttachmentService } from '../../common/storage/attachment.service';
import { submissionWrongStatus } from './errors';
import { SubmissionRow } from './types';

interface SubmissionDbRow {
  id: string;
  engagement_id: string;
  seeker_id: string;
  content_ref: string;
  attachment_id: string | null;
  note: string;
  submitted_at: Date;
}

function mapSubmission(row: SubmissionDbRow): SubmissionRow {
  return {
    id: row.id,
    engagementId: row.engagement_id,
    seekerId: row.seeker_id,
    contentRef: row.content_ref,
    attachmentId: row.attachment_id,
    note: row.note,
    submittedAt: row.submitted_at,
  };
}

/**
 * Work handed over for assessment.
 *
 * `attachment_id` is the real thing now: a private object with an access
 * model (#29). `content_ref` stays for rows written before storage
 * existed, and for a submission that genuinely is just a pointer (a
 * link to something the seeker already published) — it is not a
 * placeholder any more, but it is also not a file.
 *
 * Submitting grants the provider access to the file, in the same
 * transaction as the submission. A submitted document the assessor
 * cannot open is not a submission.
 */
@Injectable()
export class SubmissionService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AttachmentService) private readonly attachments: AttachmentService,
  ) {}

  async submit(input: {
    engagementId: string;
    seekerId: string;
    contentRef: string;
    attachmentId?: string | null;
    note?: string;
  }): Promise<SubmissionRow> {
    const engagement = await this.pool.query<{ status: string; provider_id: string }>(
      `SELECT status, provider_id FROM engagements WHERE id = $1`,
      [input.engagementId],
    );
    if (engagement.rows[0]?.status !== 'working') {
      throw submissionWrongStatus(input.engagementId, engagement.rows[0]?.status ?? 'unknown');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query<SubmissionDbRow>(
        `INSERT INTO submissions (engagement_id, seeker_id, content_ref, attachment_id, note)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          input.engagementId,
          input.seekerId,
          input.contentRef,
          input.attachmentId ?? null,
          input.note ?? '',
        ],
      );

      if (input.attachmentId) {
        // Same transaction as the submission: there is no moment at
        // which the work is submitted and the assessor cannot open it.
        await this.attachments.grant(
          {
            attachmentId: input.attachmentId,
            granteeId: engagement.rows[0].provider_id,
            grantedBy: input.seekerId,
            reason: `engagement_submission:${input.engagementId}`,
          },
          client,
        );
      }

      await client.query('COMMIT');
      return mapSubmission(res.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async getLatestForEngagement(engagementId: string): Promise<SubmissionRow | null> {
    const res = await this.pool.query<SubmissionDbRow>(
      `SELECT * FROM submissions WHERE engagement_id = $1 ORDER BY submitted_at DESC LIMIT 1`,
      [engagementId],
    );
    return res.rows[0] ? mapSubmission(res.rows[0]) : null;
  }
}
