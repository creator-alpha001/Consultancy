import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { AttachmentService } from '../../src/common/storage/attachment.service';
import { SessionRoomService } from '../../src/modules/sessions/session-room.service';
import { SessionService } from '../../src/modules/sessions/session.service';
import { SessionsModule } from '../../src/modules/sessions/sessions.module';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { resetDatabase, seedEngagement, seedUsers } from '../test-utils';

/**
 * The half of SPEC-PLATFORM.md §9 that is genuinely server work: in-call
 * chat, file share, the timer with its five-minute warning, reconnection
 * credit, and the recording retention rule.
 *
 * The other half — adaptive bitrate, network-quality indicator, screen
 * share, live translated subtitles — is client-and-SFU work with no
 * meaningful server-side fake, and is deliberately absent rather than
 * simulated.
 */
describe('inside a session', () => {
  let app: INestApplication;
  let pool: Pool;
  let sessions: SessionService;
  let room: SessionRoomService;
  let attachments: AttachmentService;

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([SessionsModule]);
      pool = app.get<Pool>(PG_POOL);
      sessions = app.get(SessionService);
      room = app.get(SessionRoomService);
      attachments = app.get(AttachmentService);
    }
    await resetDatabase(pool);
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  async function liveSession(minutes = 60): Promise<{ sessionId: string; seekerId: string; providerId: string }> {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    const session = await sessions.schedule({
      engagementId,
      seekerId,
      providerId,
      scheduledStart: new Date(Date.now() - 60_000),
      scheduledEnd: new Date(Date.now() + minutes * 60_000),
      timezone: 'Asia/Kolkata',
    });
    await sessions.start(session.id);
    return { sessionId: session.id, seekerId, providerId };
  }

  it('carries chat during the session, and refuses it once the session is over', async () => {
    const { sessionId, seekerId, providerId } = await liveSession();

    await room.postMessage({ sessionId, senderId: seekerId, body: 'मेरा उत्तर भेज दिया है', bodyLang: 'hi' });
    await room.postMessage({ sessionId, senderId: providerId, body: 'Got it — reading now.', bodyLang: 'en' });

    const messages = await room.listMessages(sessionId);
    expect(messages).toHaveLength(2);
    // Original language kept, never overwritten by a translation (#20).
    expect(messages[0].bodyOriginal).toBe('मेरा उत्तर भेज दिया है');
    expect(messages[0].bodyLang).toBe('hi');

    await sessions.end(sessionId);
    // A session's chat is a record of what was said during the call, not
    // a thread to keep arguing in afterwards.
    await expect(
      room.postMessage({ sessionId, senderId: seekerId, body: 'one more thing', bodyLang: 'en' }),
    ).rejects.toMatchObject({ code: 'SESSION_WRONG_STATUS' });
  });

  it('refuses to rewrite a message after the fact', async () => {
    const { sessionId, seekerId } = await liveSession();
    const msg = await room.postMessage({ sessionId, senderId: seekerId, body: 'as discussed', bodyLang: 'en' });

    // Chat is evidence in a dispute; a message that can be edited
    // afterwards is evidence of nothing.
    await expect(
      pool.query(`UPDATE session_messages SET body = 'something else' WHERE id = $1`, [msg.id]),
    ).rejects.toThrow(/append-only/i);
  });

  it('grants the other party access to a file shared in the session', async () => {
    const { sessionId, seekerId, providerId } = await liveSession();
    const file = await attachments.upload({
      ownerId: seekerId,
      bytes: Buffer.from('%PDF-1.4 my answer'),
      contentType: 'application/pdf',
      originalFilename: 'answer.pdf',
    });

    // Before sharing, the provider cannot open it — no grant, no access.
    await expect(
      attachments.signedUrlFor(file.id, { id: providerId, label: 'provider' }),
    ).rejects.toMatchObject({ code: 'ATTACHMENT_NOT_FOUND' });

    await room.shareFile({ sessionId, attachmentId: file.id, sharedBy: seekerId });

    // Sharing is what creates the grant, so a file listed here is one
    // the other person can actually open.
    const link = await attachments.signedUrlFor(file.id, { id: providerId, label: 'provider' });
    expect(link.url).toContain(file.id);

    const listed = await room.listFiles(sessionId);
    expect(listed).toHaveLength(1);
    expect(listed[0].originalFilename).toBe('answer.pdf');
    expect(listed[0].sharedBy).toBe(seekerId);
  });

  it('raises the five-minute warning once, and not before', async () => {
    const far = await liveSession(60);
    const early = await room.timer(far.sessionId);
    expect(early.warningRaised).toBe(false);
    expect(early.secondsRemaining).toBeGreaterThan(5 * 60);

    const near = await liveSession(4);
    const state = await room.timer(near.sessionId);
    expect(state.warningRaised).toBe(true);

    // Stamped, not recomputed: a client polling every few seconds must
    // not raise it repeatedly, and a dispute about an overrun needs to
    // show it was given at all.
    const stamps = await pool.query<{ warning_raised_at: Date | null }>(
      `SELECT warning_raised_at FROM sessions WHERE id = $1`,
      [near.sessionId],
    );
    const first = stamps.rows[0].warning_raised_at;
    expect(first).not.toBeNull();
    await room.timer(near.sessionId);
    const second = await pool.query<{ warning_raised_at: Date }>(
      `SELECT warning_raised_at FROM sessions WHERE id = $1`,
      [near.sessionId],
    );
    expect(second.rows[0].warning_raised_at.getTime()).toBe(first!.getTime());
  });

  it('credits time lost to a dropped connection, and counts a shared outage once', async () => {
    const { sessionId, seekerId, providerId } = await liveSession();

    await room.reportDisconnected(sessionId, seekerId);
    // The same drop reported twice is what a flaky connection produces.
    // It must not count twice.
    await room.reportDisconnected(sessionId, seekerId);
    const open = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM session_interruptions WHERE session_id = $1 AND ended_at IS NULL`,
      [sessionId],
    );
    expect(Number(open.rows[0].n)).toBe(1);

    // Both parties down over the same period is one lost minute, not
    // two — summing per person would hand back more time than was lost.
    await room.reportDisconnected(sessionId, providerId);
    await pool.query(
      `UPDATE session_interruptions SET started_at = now() - interval '60 seconds' WHERE session_id = $1`,
      [sessionId],
    );
    const credited = await room.creditedSeconds(sessionId);
    expect(credited).toBeGreaterThanOrEqual(59);
    expect(credited).toBeLessThan(75);

    await room.reportReconnected(sessionId, seekerId);
    await room.reportReconnected(sessionId, providerId);

    // Credit extends the clock: a session interrupted for a minute has a
    // minute more before it is over.
    const timer = await room.timer(sessionId);
    expect(timer.creditedSeconds).toBeGreaterThanOrEqual(59);
  });

  it('freezes the credit when the session ends, including for someone still disconnected', async () => {
    const { sessionId, seekerId } = await liveSession();
    await room.reportDisconnected(sessionId, seekerId);
    await pool.query(
      `UPDATE session_interruptions SET started_at = now() - interval '120 seconds' WHERE session_id = $1`,
      [sessionId],
    );

    // Ended while they were still disconnected. Without closing the
    // interruption the credit would keep growing forever.
    await sessions.end(sessionId);

    const row = await pool.query<{ credited_seconds: number }>(
      `SELECT credited_seconds FROM sessions WHERE id = $1`,
      [sessionId],
    );
    expect(row.rows[0].credited_seconds).toBeGreaterThanOrEqual(119);

    const stillOpen = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM session_interruptions WHERE session_id = $1 AND ended_at IS NULL`,
      [sessionId],
    );
    expect(Number(stillOpen.rows[0].n)).toBe(0);
  });

  it('sets a 90-day retention when recording starts, and does not reset it on a second start', async () => {
    const { sessionId, seekerId, providerId } = await liveSession();
    await sessions.recordConsent(sessionId, seekerId, true);
    await sessions.recordConsent(sessionId, providerId, true);

    await sessions.setRecording(sessionId, true);
    const first = await pool.query<{ until: Date | null; hold: boolean }>(
      `SELECT recording_retention_until AS until, recording_legal_hold AS hold FROM sessions WHERE id = $1`,
      [sessionId],
    );
    expect(first.rows[0].until).not.toBeNull();
    expect(first.rows[0].hold).toBe(false);
    const days = (first.rows[0].until!.getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(90);

    // Stopping and restarting must not extend the retention of what was
    // already captured.
    await sessions.setRecording(sessionId, false);
    await sessions.setRecording(sessionId, true);
    const second = await pool.query<{ until: Date }>(
      `SELECT recording_retention_until AS until FROM sessions WHERE id = $1`,
      [sessionId],
    );
    expect(second.rows[0].until.getTime()).toBe(first.rows[0].until!.getTime());
  });
});
