import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { TranscriptRow } from './types';

interface TranscriptDbRow {
  id: string;
  session_id: string;
  language: string;
  content_ref: string;
}

function mapTranscript(row: TranscriptDbRow): TranscriptRow {
  return { id: row.id, sessionId: row.session_id, language: row.language, contentRef: row.content_ref };
}

/**
 * Stored separately from the recording (SPEC-PLATFORM.md §9: "cheaper
 * and more useful in disputes than video"). `content_ref` is a
 * placeholder for a real private-storage pointer — see TRACKER.md.
 */
@Injectable()
export class TranscriptService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async store(sessionId: string, language: string, contentRef: string): Promise<TranscriptRow> {
    const res = await this.pool.query<TranscriptDbRow>(
      `INSERT INTO transcripts (session_id, language, content_ref) VALUES ($1, $2, $3) RETURNING *`,
      [sessionId, language, contentRef],
    );
    return mapTranscript(res.rows[0]);
  }

  async getForSession(sessionId: string): Promise<TranscriptRow | null> {
    const res = await this.pool.query<TranscriptDbRow>(`SELECT * FROM transcripts WHERE session_id = $1`, [sessionId]);
    return res.rows[0] ? mapTranscript(res.rows[0]) : null;
  }
}
