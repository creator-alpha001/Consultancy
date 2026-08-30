import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { AgendaService } from '../agenda/agenda.service';
import { AuditService } from '../../common/audit/audit.service';
import { AvailabilityService } from './availability.service';
import { SessionExtensionService } from './session-extension.service';
import { recordingConsentIncomplete, sessionNotFound, sessionWrongStatus } from './errors';
import { ROOM_PROVIDER, RoomProvider } from './room/room-provider.interface';
import { ScheduleSessionInput, SessionMode, SessionRow, SessionStatus } from './types';

interface SessionDbRow {
  id: string;
  engagement_id: string;
  scheduled_start: Date;
  scheduled_end: Date;
  timezone: string;
  room_provider: string | null;
  room_reference: string | null;
  mode: SessionMode;
  recording_active: boolean;
  status: SessionStatus;
  started_at: Date | null;
  ended_at: Date | null;
}

function mapSession(row: SessionDbRow): SessionRow {
  return {
    id: row.id,
    engagementId: row.engagement_id,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    timezone: row.timezone,
    roomProvider: row.room_provider,
    roomReference: row.room_reference,
    mode: row.mode,
    recordingActive: row.recording_active,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

/**
 * SPEC-PLATFORM.md §9 — the backend-modelable core: booking against a
 * fixed window (not the full RRULE availability engine — see
 * TRACKER.md), room provisioning through the RoomProvider seam, both-
 * party recording consent (CLAUDE.md #21), and the live agenda
 * checklist via agenda/. Adaptive bitrate, reconnection, screen share,
 * in-call chat, and live subtitles are real-time client+SFU behaviour
 * this module does not attempt to fake.
 */
@Injectable()
export class SessionService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(ROOM_PROVIDER) private readonly roomProvider: RoomProvider,
    @Inject(AgendaService) private readonly agendas: AgendaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AvailabilityService) private readonly availability: AvailabilityService,
    @Inject(SessionExtensionService) private readonly extensions: SessionExtensionService,
  ) {}

  /**
   * Books a session.
   *
   * `enforceAvailability` defaults on: a booking must land on a slot the
   * provider actually offers. It can be turned off for a session the
   * provider arranges themselves, and for the fixtures that predate the
   * availability engine — but never from an HTTP route, where the caller
   * is a seeker picking a time.
   */
  async schedule(input: ScheduleSessionInput & { enforceAvailability?: boolean }): Promise<SessionRow> {
    if (input.enforceAvailability) {
      await this.availability.assertBookable(input.providerId, input.scheduledStart, input.scheduledEnd);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query<SessionDbRow>(
        `INSERT INTO sessions (engagement_id, scheduled_start, scheduled_end, timezone)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [input.engagementId, input.scheduledStart, input.scheduledEnd, input.timezone],
      );
      const session = res.rows[0];
      for (const userId of [input.seekerId, input.providerId]) {
        await client.query(
          `INSERT INTO session_participants (session_id, user_id) VALUES ($1, $2)`,
          [session.id, userId],
        );
      }
      await client.query('COMMIT');
      return mapSession(session);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async get(sessionId: string): Promise<SessionRow> {
    const res = await this.pool.query<SessionDbRow>(`SELECT * FROM sessions WHERE id = $1`, [sessionId]);
    if (!res.rows[0]) throw sessionNotFound(sessionId);
    return mapSession(res.rows[0]);
  }

  async createRoom(sessionId: string): Promise<SessionRow> {
    const session = await this.get(sessionId);
    const result = await this.roomProvider.createRoom({ sessionId, mode: session.mode });
    const res = await this.pool.query<SessionDbRow>(
      `UPDATE sessions SET room_provider = $2, room_reference = $3 WHERE id = $1 RETURNING *`,
      [sessionId, result.roomProvider, result.roomReference],
    );
    return mapSession(res.rows[0]);
  }

  /**
   * A refusal is recorded exactly like a consent — same row shape,
   * consent_given=false. Never call this only for a yes.
   *
   * Also audited, and this is the one place where the audit entry
   * carries information the row itself does not: `session_consents`
   * upserts, so a person who consents and then withdraws leaves a
   * single row saying "no". #21 makes a refusal shift the evidentiary
   * burden, which means *when each decision was made* is the fact in
   * question — and the audit log is append-only, so it keeps the
   * sequence the consent row overwrites.
   */
  async recordConsent(sessionId: string, userId: string, consentGiven: boolean): Promise<void> {
    await this.pool.query(
      `INSERT INTO session_consents (session_id, user_id, consent_given)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_id, user_id) DO UPDATE SET consent_given = EXCLUDED.consent_given, decided_at = now()`,
      [sessionId, userId, consentGiven],
    );
    await this.audit.record({
      actorId: userId,
      action: consentGiven ? 'session.recording_consented' : 'session.recording_refused',
      subjectType: 'session',
      subjectId: sessionId,
      detail: { consentGiven },
    });
  }

  async setRecording(sessionId: string, active: boolean): Promise<SessionRow> {
    if (active) {
      const counts = await this.pool.query<{ participants: string; consenting: string }>(
        `SELECT
           (SELECT count(*) FROM session_participants WHERE session_id = $1) AS participants,
           (SELECT count(*) FROM session_consents WHERE session_id = $1 AND consent_given) AS consenting`,
        [sessionId],
      );
      const total = Number(counts.rows[0].participants);
      const consenting = Number(counts.rows[0].consenting);
      if (total === 0 || consenting < total) {
        throw recordingConsentIncomplete(sessionId, consenting, total);
      }
    }
    // §9: "90-day retention extended only under legal hold." The clock
    // starts when recording first starts, and is never shortened by a
    // later start — a second recording in the same session does not
    // reset the retention of the first.
    const res = await this.pool.query<SessionDbRow>(
      `UPDATE sessions
          SET recording_active = $2,
              recording_retention_until = CASE
                WHEN $2 AND recording_retention_until IS NULL THEN now() + interval '90 days'
                ELSE recording_retention_until
              END
        WHERE id = $1
        RETURNING *`,
      [sessionId, active],
    );
    if (!res.rows[0]) throw sessionNotFound(sessionId);
    await this.audit.record({
      actorId: null,
      action: active ? 'session.recording_started' : 'session.recording_stopped',
      subjectType: 'session',
      subjectId: sessionId,
      detail: {},
    });
    return mapSession(res.rows[0]);
  }

  async start(sessionId: string): Promise<SessionRow> {
    const session = await this.get(sessionId);
    if (session.status !== 'scheduled') throw sessionWrongStatus(sessionId, session.status, ['scheduled']);
    const res = await this.pool.query<SessionDbRow>(
      `UPDATE sessions SET status = 'in_progress', started_at = now() WHERE id = $1 RETURNING *`,
      [sessionId],
    );
    return mapSession(res.rows[0]);
  }

  /**
   * Ends the session and freezes the interruption credit.
   *
   * Cached onto the row at exactly this moment because the
   * interruptions are final now and not before: recomputing later would
   * keep counting an interruption nobody ever closed, and a session that
   * ended while someone was still disconnected would accrue credit
   * forever.
   */
  async end(sessionId: string): Promise<SessionRow> {
    const session = await this.get(sessionId);
    if (session.status !== 'in_progress') throw sessionWrongStatus(sessionId, session.status, ['in_progress']);
    const res = await this.pool.query<SessionDbRow>(
      `WITH closed AS (
         -- Anyone still disconnected at the end stops accruing here.
         UPDATE session_interruptions SET ended_at = now()
          WHERE session_id = $1 AND ended_at IS NULL
          RETURNING 1
       ),
       spans AS (
         SELECT tstzrange(started_at, COALESCE(ended_at, now())) AS span
           FROM session_interruptions WHERE session_id = $1
       ),
       merged AS (
         -- Merged, not summed: both parties dropping for the same minute
         -- is one lost minute, not two.
         SELECT COALESCE(SUM(EXTRACT(epoch FROM (upper(s.span) - lower(s.span)))), 0)::int AS seconds
           FROM (SELECT unnest(range_agg(span)) AS span FROM spans) s
       )
       UPDATE sessions
          SET status = 'completed',
              ended_at = now(),
              credited_seconds = (SELECT seconds FROM merged)
        WHERE id = $1
        RETURNING *`,
      [sessionId],
    );

    // The extra time was delivered when the session ended, so it is paid
    // now — not when the whole engagement completes, which may be days
    // later. This is the point of charging an extension separately.
    await this.extensions.settleForSession(sessionId);

    return mapSession(res.rows[0]);
  }

  async cancel(sessionId: string): Promise<SessionRow> {
    const session = await this.get(sessionId);
    if (session.status !== 'scheduled') throw sessionWrongStatus(sessionId, session.status, ['scheduled']);
    const res = await this.pool.query<SessionDbRow>(
      `UPDATE sessions SET status = 'cancelled' WHERE id = $1 RETURNING *`,
      [sessionId],
    );
    return mapSession(res.rows[0]);
  }

  async markNoShow(sessionId: string): Promise<SessionRow> {
    const session = await this.get(sessionId);
    if (session.status !== 'scheduled') throw sessionWrongStatus(sessionId, session.status, ['scheduled']);
    const res = await this.pool.query<SessionDbRow>(
      `UPDATE sessions SET status = 'no_show' WHERE id = $1 RETURNING *`,
      [sessionId],
    );
    return mapSession(res.rows[0]);
  }

  /** Models the network-quality fallback event (CLAUDE.md #22) — actual bitrate adaptation is client+SFU behaviour, not something this call performs. */
  async fallBackToAudioOnly(sessionId: string): Promise<SessionRow> {
    const res = await this.pool.query<SessionDbRow>(
      `UPDATE sessions SET mode = 'audio_only' WHERE id = $1 RETURNING *`,
      [sessionId],
    );
    if (!res.rows[0]) throw sessionNotFound(sessionId);
    return mapSession(res.rows[0]);
  }

  async tickAgendaItem(sessionId: string, itemId: string): Promise<void> {
    const session = await this.get(sessionId);
    if (session.status !== 'in_progress') throw sessionWrongStatus(sessionId, session.status, ['in_progress']);
    await this.agendas.tickItem(itemId);
  }
}
