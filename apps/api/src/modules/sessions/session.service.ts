import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { AgendaService } from '../agenda/agenda.service';
import { AuditService } from '../../common/audit/audit.service';
import { AvailabilityService } from './availability.service';
import { SessionExtensionService } from './session-extension.service';
import {
  recordingConsentIncomplete,
  recordingUnavailable,
  roomNotJoinable,
  sessionNotFound,
  sessionWrongStatus,
} from './errors';
import { RECORDING_PROVIDER, RecordingProvider, StartedRecording } from './room/recording-provider.interface';
import { JoinCredentials, ROOM_PROVIDER, RoomProvider } from './room/room-provider.interface';
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
    @Inject(RECORDING_PROVIDER) private readonly recorder: RecordingProvider,
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
    // A room is named once. Re-provisioning on every join would hand the
    // second person a different room from the first.
    if (session.roomReference) return session;
    const result = await this.roomProvider.createRoom({ sessionId, mode: session.mode });
    const res = await this.pool.query<SessionDbRow>(
      `UPDATE sessions SET room_provider = $2, room_reference = $3 WHERE id = $1 RETURNING *`,
      [sessionId, result.roomProvider, result.roomReference],
    );
    return mapSession(res.rows[0]);
  }

  /**
   * Credentials for ONE user to join ONE session's room.
   *
   * The caller has already proven the actor is a participant; the token
   * is bound to that actor's media identity, so it cannot be handed to
   * someone else to join as them. It lives until two hours past the
   * scheduled end (bounded to 1-24h), long enough for an overrun or an
   * extension without a mid-call expiry, and a client refreshes it by
   * calling the same route again.
   */
  async joinCredentials(sessionId: string, userId: string): Promise<{ session: SessionRow; join: JoinCredentials }> {
    const current = await this.get(sessionId);
    if (current.status !== 'scheduled' && current.status !== 'in_progress') {
      throw roomNotJoinable(sessionId, current.status);
    }
    const session = await this.createRoom(sessionId);
    const untilEnd = Math.floor((session.scheduledEnd.getTime() - Date.now()) / 1000) + 2 * 3600;
    const expiresInSeconds = Math.min(24 * 3600, Math.max(3600, untilEnd));
    const join = this.roomProvider.issueJoin({
      roomReference: session.roomReference as string,
      userId,
      expiresInSeconds,
    });
    return { session, join };
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

    // Withdrawing consent mid-recording stops the recorder. #21 is consent
    // to be recorded, not consent to having once agreed.
    if (!consentGiven) {
      const session = await this.get(sessionId);
      if (session.recordingActive) await this.setRecording(sessionId, false);
    }
  }

  /**
   * Starts or stops the cloud recorder.
   *
   * Order matters, and each direction fails safe differently:
   *
   *  * START asks the vendor first, then writes the flag and the run in
   *    one transaction. If that write is refused (the consent triggers),
   *    the recorder just started is stopped again, so no recording exists
   *    that the database does not know about.
   *  * STOP asks the vendor first, and only then clears the flag. If the
   *    vendor cannot be reached the flag stays on - see
   *    `recordingUnavailable`.
   *
   * No vendor call is made inside a transaction (CLAUDE.md #9).
   * Repeating either request is a no-op, so a retried tap never starts a
   * second recorder.
   */
  async setRecording(sessionId: string, active: boolean): Promise<SessionRow> {
    const session = await this.get(sessionId);
    const open = await this.openRun(sessionId);

    if (active) {
      if (open) return session;
      await this.assertFullConsent(sessionId);
      // The recorder joins the room by name, so the room must exist.
      const roomReference = (await this.createRoom(sessionId)).roomReference as string;

      let started: StartedRecording;
      try {
        started = await this.recorder.start({ sessionId, roomReference });
      } catch {
        throw recordingUnavailable(sessionId, 'start');
      }

      try {
        const row = await this.writeRunStarted(sessionId, started);
        await this.audit.record({
          actorId: null,
          action: 'session.recording_started',
          subjectType: 'session',
          subjectId: sessionId,
          detail: { provider: started.provider },
        });
        return row;
      } catch (err) {
        await this.recorder.stop({ roomReference, reference: started.reference }).catch(() => undefined);
        throw err;
      }
    }

    if (!open) {
      if (!session.recordingActive) return session;
      // A flag with no run behind it predates run bookkeeping (0053).
      return this.clearRecordingFlag(sessionId, null);
    }

    let stopped: { files: unknown; note: string | null };
    try {
      stopped = await this.recorder.stop({
        roomReference: session.roomReference as string,
        reference: open.reference,
      });
    } catch {
      throw recordingUnavailable(sessionId, 'stop');
    }
    return this.clearRecordingFlag(sessionId, { runId: open.id, files: stopped.files, note: stopped.note });
  }

  private async assertFullConsent(sessionId: string): Promise<void> {
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

  private async openRun(sessionId: string): Promise<{ id: string; reference: Record<string, string> } | null> {
    const res = await this.pool.query<{ id: string; provider_reference: Record<string, string> }>(
      `SELECT id, provider_reference FROM session_recordings WHERE session_id = $1 AND stopped_at IS NULL`,
      [sessionId],
    );
    const row = res.rows[0];
    return row ? { id: row.id, reference: row.provider_reference } : null;
  }

  private async writeRunStarted(sessionId: string, started: StartedRecording): Promise<SessionRow> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO session_recordings (session_id, provider, provider_reference, storage_prefix)
         VALUES ($1, $2, $3, $4)`,
        [sessionId, started.provider, JSON.stringify(started.reference), started.storagePrefix],
      );
      // SPEC-PLATFORM.md section 9: "90-day retention extended only under
      // legal hold." The clock starts when recording first starts, and is
      // never shortened by a later start - a second recording in the same
      // session does not reset the retention of the first.
      const res = await client.query<SessionDbRow>(
        `UPDATE sessions
            SET recording_active = true,
                recording_retention_until = COALESCE(recording_retention_until, now() + interval '90 days')
          WHERE id = $1
          RETURNING *`,
        [sessionId],
      );
      await client.query('COMMIT');
      return mapSession(res.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  private async clearRecordingFlag(
    sessionId: string,
    run: { runId: string; files: unknown; note: string | null } | null,
  ): Promise<SessionRow> {
    const client = await this.pool.connect();
    let row: SessionDbRow;
    try {
      await client.query('BEGIN');
      if (run) {
        await client.query(
          `UPDATE session_recordings SET stopped_at = now(), files = $2, stop_note = $3 WHERE id = $1`,
          [run.runId, JSON.stringify(run.files ?? null), run.note],
        );
      }
      const res = await client.query<SessionDbRow>(
        `UPDATE sessions SET recording_active = false WHERE id = $1 RETURNING *`,
        [sessionId],
      );
      await client.query('COMMIT');
      row = res.rows[0];
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    await this.audit.record({
      actorId: null,
      action: 'session.recording_stopped',
      subjectType: 'session',
      subjectId: sessionId,
      detail: run?.note ? { note: run.note } : {},
    });
    return mapSession(row);
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

    // The recorder stops with the session. If the vendor cannot be
    // reached the session still ends - nobody is kept in a finished
    // session by a vendor outage - and the recorder exits on its own idle
    // timeout once both have left. The run stays open so it is visible.
    if (session.recordingActive) {
      await this.setRecording(sessionId, false).catch(() => undefined);
    }

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
