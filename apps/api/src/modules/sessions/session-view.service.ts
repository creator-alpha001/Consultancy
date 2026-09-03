import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { displayNameFor } from '../../common/display-name';

/**
 * A session as a screen has to render it.
 *
 * The row answers "when and how"; the screens also have to say who it is
 * with, whether BOTH people agreed to recording, and whether there is
 * anything to read or watch afterwards. Those live in
 * `session_consents`, `transcripts` and the recording flags.
 *
 * Consent is the load-bearing part. CLAUDE.md #21 requires an explicit
 * yes from both parties at the start of every session, and a refusal to
 * be logged rather than merely absent — so this distinguishes the three
 * states the table can express, and never collapses them to a boolean:
 *
 *   true   they said yes
 *   false  they said no, and that refusal is on the record
 *   null   they have not been asked yet
 *
 * Additive: the flat row is untouched and these sit beside it.
 */

export interface SessionView {
  /** Whoever the caller is NOT. A session is always between two people. */
  counterpart: string;
  durationMinutes: number;
  consent: { seeker: boolean | null; provider: boolean | null };
  recordingAvailable: boolean;
  transcriptAvailable: boolean;
}

@Injectable()
export class SessionViewService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async viewsFor(sessionIds: string[], viewerId: string): Promise<Map<string, SessionView>> {
    const out = new Map<string, SessionView>();
    if (sessionIds.length === 0) return out;

    const [rows, consents] = await Promise.all([
      this.pool.query<{
        id: string;
        scheduled_start: Date;
        scheduled_end: Date;
        seeker_id: string;
        provider_id: string;
        seeker_email: string;
        provider_email: string;
        recording_active: boolean;
        ended_at: Date | null;
        has_transcript: boolean;
      }>(
        `SELECT s.id, s.scheduled_start, s.scheduled_end,
                e.seeker_id, e.provider_id,
                su.email AS seeker_email,
                pu.email AS provider_email,
                s.recording_active, s.ended_at,
                (t.id IS NOT NULL) AS has_transcript
           FROM sessions s
           JOIN engagements e ON e.id = s.engagement_id
           JOIN users su ON su.id = e.seeker_id
           JOIN users pu ON pu.id = e.provider_id
           LEFT JOIN transcripts t ON t.session_id = s.id
          WHERE s.id = ANY($1::uuid[])`,
        [sessionIds],
      ),
      this.pool.query<{ session_id: string; user_id: string; consent_given: boolean }>(
        `SELECT session_id, user_id, consent_given
           FROM session_consents
          WHERE session_id = ANY($1::uuid[])`,
        [sessionIds],
      ),
    ]);

    for (const row of rows.rows) {
      const mine = consents.rows.filter((c) => c.session_id === row.id);
      const decisionOf = (userId: string): boolean | null => {
        const found = mine.find((c) => c.user_id === userId);
        return found ? found.consent_given : null;
      };

      out.set(row.id, {
        /*
         * Named from the viewer's side. A screen that said "session with
         * Priya Nair" to Priya herself is the sort of thing that reads
         * as a bug even when the data is right.
         */
        counterpart: displayNameFor(
          viewerId === row.seeker_id ? row.provider_email : row.seeker_email,
        ),
        durationMinutes: Math.max(
          0,
          Math.round((row.scheduled_end.getTime() - row.scheduled_start.getTime()) / 60_000),
        ),
        consent: { seeker: decisionOf(row.seeker_id), provider: decisionOf(row.provider_id) },
        /*
         * There is something to watch only if it was actually recorded
         * AND the session has finished. A session recording mid-call is
         * not yet a recording anyone can open.
         */
        recordingAvailable: row.recording_active && row.ended_at !== null,
        transcriptAvailable: row.has_transcript,
      });
    }

    return out;
  }
}
