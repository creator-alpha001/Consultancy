import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { AttachmentService } from '../../common/storage/attachment.service';
import { sessionNotFound, sessionWrongStatus } from './errors';

export interface SessionMessage {
  id: string;
  sessionId: string;
  senderId: string;
  bodyOriginal: string;
  bodyLang: string;
  createdAt: Date;
}

export interface SharedFile {
  attachmentId: string;
  sharedBy: string;
  originalFilename: string | null;
  contentType: string;
  byteSize: number;
  createdAt: Date;
}

export interface TimerState {
  scheduledEnd: Date;
  secondsRemaining: number;
  /** Seconds credited back for time lost to a dropped connection. */
  creditedSeconds: number;
  /** True once the five-minute warning has been raised — raised exactly once. */
  warningRaised: boolean;
}

/** §9: "timer with 5-minute warning". */
const WARNING_SECONDS = 5 * 60;

/**
 * What happens inside a session (SPEC-PLATFORM.md §9).
 *
 * Everything here is the half of §9 that is genuinely backend work.
 * The other half — adaptive bitrate, the network-quality indicator,
 * screen share, live translated subtitles — is client-and-SFU work with
 * no meaningful server-side fake, and is deliberately not simulated
 * here: a column saying "the bitrate adapted" would be a lie with a
 * schema.
 */
@Injectable()
export class SessionRoomService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AttachmentService) private readonly attachments: AttachmentService,
  ) {}

  private async participants(sessionId: string): Promise<string[]> {
    const res = await this.pool.query<{ user_id: string }>(
      `SELECT user_id FROM session_participants WHERE session_id = $1`,
      [sessionId],
    );
    return res.rows.map((r) => r.user_id);
  }

  // ── In-call chat ────────────────────────────────────────────────────

  /**
   * Chat is allowed while the session is live, and only then.
   *
   * Not after it ends: a session's chat is a record of what was said
   * during it, and letting either party append afterwards turns it into
   * a place to argue rather than a record of the call.
   */
  async postMessage(input: {
    sessionId: string;
    senderId: string;
    body: string;
    bodyLang: string;
  }): Promise<SessionMessage> {
    const session = await this.pool.query<{ status: string }>(`SELECT status FROM sessions WHERE id = $1`, [
      input.sessionId,
    ]);
    if (!session.rows[0]) throw sessionNotFound(input.sessionId);
    if (session.rows[0].status !== 'in_progress') {
      throw sessionWrongStatus(input.sessionId, session.rows[0].status, ['in_progress']);
    }

    const res = await this.pool.query<{
      id: string;
      session_id: string;
      sender_id: string;
      body: string;
      body_lang: string;
      created_at: Date;
    }>(
      `INSERT INTO session_messages (session_id, sender_id, body, body_lang)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.sessionId, input.senderId, input.body, input.bodyLang],
    );
    const row = res.rows[0];
    return {
      id: row.id,
      sessionId: row.session_id,
      senderId: row.sender_id,
      bodyOriginal: row.body,
      bodyLang: row.body_lang,
      createdAt: row.created_at,
    };
  }

  async listMessages(sessionId: string): Promise<SessionMessage[]> {
    const res = await this.pool.query<{
      id: string;
      session_id: string;
      sender_id: string;
      body: string;
      body_lang: string;
      created_at: Date;
    }>(`SELECT * FROM session_messages WHERE session_id = $1 ORDER BY created_at ASC`, [sessionId]);
    return res.rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      senderId: row.sender_id,
      bodyOriginal: row.body,
      bodyLang: row.body_lang,
      createdAt: row.created_at,
    }));
  }

  // ── File share ──────────────────────────────────────────────────────

  /**
   * Hands a file to the other party.
   *
   * Sharing is what creates the grant, in the same transaction as the
   * record — so a file mentioned in a session is a file the other person
   * can actually open, and there is no window where it is listed but
   * unopenable. Only participants are granted: a session has exactly two
   * people in it, and neither the platform nor anyone else joins by
   * being mentioned.
   */
  async shareFile(input: { sessionId: string; attachmentId: string; sharedBy: string }): Promise<void> {
    const others = (await this.participants(input.sessionId)).filter((id) => id !== input.sharedBy);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO session_shared_files (session_id, attachment_id, shared_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (session_id, attachment_id) DO NOTHING`,
        [input.sessionId, input.attachmentId, input.sharedBy],
      );
      for (const granteeId of others) {
        await this.attachments.grant(
          {
            attachmentId: input.attachmentId,
            granteeId,
            grantedBy: input.sharedBy,
            reason: `session_share:${input.sessionId}`,
          },
          client,
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async listFiles(sessionId: string): Promise<SharedFile[]> {
    const res = await this.pool.query<{
      attachment_id: string;
      shared_by: string;
      original_filename: string | null;
      content_type: string;
      byte_size: string;
      created_at: Date;
    }>(
      `SELECT f.attachment_id, f.shared_by, a.original_filename, a.content_type, a.byte_size, f.created_at
         FROM session_shared_files f
         JOIN attachments a ON a.id = f.attachment_id
        WHERE f.session_id = $1
        ORDER BY f.created_at ASC`,
      [sessionId],
    );
    return res.rows.map((r) => ({
      attachmentId: r.attachment_id,
      sharedBy: r.shared_by,
      originalFilename: r.original_filename,
      contentType: r.content_type,
      byteSize: Number(r.byte_size),
      createdAt: r.created_at,
    }));
  }

  // ── Reconnection credit ─────────────────────────────────────────────

  /**
   * Someone's connection dropped.
   *
   * Idempotent: a client that reports the same drop twice — which is
   * exactly what a flaky connection produces — must not double-count the
   * credit. The partial unique index enforces that at most one
   * interruption per person is open at a time.
   */
  async reportDisconnected(sessionId: string, userId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO session_interruptions (session_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (session_id, user_id) WHERE ended_at IS NULL DO NOTHING`,
      [sessionId, userId],
    );
  }

  async reportReconnected(sessionId: string, userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE session_interruptions SET ended_at = now()
        WHERE session_id = $1 AND user_id = $2 AND ended_at IS NULL`,
      [sessionId, userId],
    );
  }

  /**
   * Time to credit back, in seconds.
   *
   * Counts wall-clock time during which **anyone** was disconnected,
   * merged rather than summed: if both parties drop for the same
   * overlapping minute, that is one lost minute, not two. Summing per
   * person would credit a two-person outage twice and quietly hand back
   * more time than was lost.
   */
  async creditedSeconds(sessionId: string): Promise<number> {
    const res = await this.pool.query<{ seconds: string | null }>(
      `WITH spans AS (
         SELECT tstzrange(started_at, COALESCE(ended_at, now())) AS span
           FROM session_interruptions
          WHERE session_id = $1
       ),
       merged AS (
         SELECT unnest(range_agg(span)) AS span FROM spans
       )
       SELECT COALESCE(SUM(EXTRACT(epoch FROM (upper(span) - lower(span)))), 0)::bigint AS seconds
         FROM merged`,
      [sessionId],
    );
    return Number(res.rows[0]?.seconds ?? 0);
  }

  // ── The timer ───────────────────────────────────────────────────────

  /**
   * Where the clock is, including the five-minute warning.
   *
   * The warning is stamped on first crossing rather than recomputed, for
   * two reasons: a client polling every few seconds must not raise it
   * repeatedly, and a dispute about a session that overran needs to show
   * the warning was actually given.
   *
   * Credited time extends the clock — a session interrupted for four
   * minutes has four more minutes before it is over, which is the whole
   * point of tracking interruptions.
   */
  async timer(sessionId: string): Promise<TimerState> {
    const res = await this.pool.query<{
      scheduled_end: Date;
      warning_raised_at: Date | null;
      status: string;
    }>(`SELECT scheduled_end, warning_raised_at, status FROM sessions WHERE id = $1`, [sessionId]);
    if (!res.rows[0]) throw sessionNotFound(sessionId);

    const credited = await this.creditedSeconds(sessionId);
    const effectiveEnd = new Date(res.rows[0].scheduled_end.getTime() + credited * 1000);
    const secondsRemaining = Math.round((effectiveEnd.getTime() - Date.now()) / 1000);

    let warningRaised = res.rows[0].warning_raised_at !== null;
    if (!warningRaised && secondsRemaining <= WARNING_SECONDS && res.rows[0].status === 'in_progress') {
      // Stamped once. The WHERE clause makes a concurrent poll a no-op
      // rather than a second warning.
      const stamped = await this.pool.query(
        `UPDATE sessions SET warning_raised_at = now() WHERE id = $1 AND warning_raised_at IS NULL`,
        [sessionId],
      );
      warningRaised = (stamped.rowCount ?? 0) > 0 || true;
    }

    return {
      scheduledEnd: effectiveEnd,
      secondsRemaining,
      creditedSeconds: credited,
      warningRaised,
    };
  }
}
