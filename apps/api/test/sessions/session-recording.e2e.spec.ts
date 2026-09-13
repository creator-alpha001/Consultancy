import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { SessionService } from '../../src/modules/sessions/session.service';
import { SessionsModule } from '../../src/modules/sessions/sessions.module';
import {
  RECORDING_PROVIDER,
  RecordingProvider,
  RecordingVendorError,
  StartRecordingInput,
  StartedRecording,
  StopRecordingResult,
} from '../../src/modules/sessions/room/recording-provider.interface';
import { authenticateExistingUser } from '../auth-helpers';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { resetDatabase, seedEngagement, seedUsers } from '../test-utils';

/**
 * A recorder that does what the test tells it to, so the session
 * service's failure handling can be driven: the vendor refusing to start,
 * refusing to stop, and a retried request.
 */
class ScriptedRecorder implements RecordingProvider {
  readonly code = 'scripted';
  starts = 0;
  stops = 0;
  failStart = false;
  failStop = false;

  async start(input: StartRecordingInput): Promise<StartedRecording> {
    if (this.failStart) throw new RecordingVendorError('down', 503);
    this.starts += 1;
    return { provider: this.code, reference: { run: `${input.sessionId}:${this.starts}` }, storagePrefix: 's3://b/p/' };
  }

  async stop(): Promise<StopRecordingResult> {
    if (this.failStop) throw new RecordingVendorError('down', 503);
    this.stops += 1;
    return { files: [{ filename: 'a.m3u8' }], note: null };
  }
}

describe('recording runs through the vendor seam (CLAUDE.md #21)', () => {
  let app: INestApplication;
  let pool: Pool;
  let sessions: SessionService;
  const recorder = new ScriptedRecorder();

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([SessionsModule], [{ token: RECORDING_PROVIDER, useValue: recorder }]);
      pool = app.get<Pool>(PG_POOL);
      sessions = app.get(SessionService);
    }
    await resetDatabase(pool);
    Object.assign(recorder, { starts: 0, stops: 0, failStart: false, failStop: false });
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  async function consentingSession() {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    const session = await sessions.schedule({
      engagementId, seekerId, providerId,
      scheduledStart: new Date(Date.now() - 60_000),
      scheduledEnd: new Date(Date.now() + 60 * 60_000),
      timezone: 'Asia/Kolkata',
    });
    await sessions.recordConsent(session.id, seekerId, true);
    await sessions.recordConsent(session.id, providerId, true);
    return { sessionId: session.id, seekerId, providerId };
  }

  async function runs(sessionId: string) {
    const res = await pool.query<{ stopped_at: Date | null; files: unknown; storage_prefix: string | null }>(
      `SELECT stopped_at, files, storage_prefix FROM session_recordings WHERE session_id = $1 ORDER BY started_at`,
      [sessionId],
    );
    return res.rows;
  }

  it('records a run with where it went, and closes it on stop', async () => {
    const { sessionId } = await consentingSession();

    const on = await sessions.setRecording(sessionId, true);
    expect(on.recordingActive).toBe(true);
    expect(on.roomReference).not.toBeNull(); // the recorder needs a room to join
    expect(await runs(sessionId)).toMatchObject([{ stopped_at: null, storage_prefix: 's3://b/p/' }]);

    const off = await sessions.setRecording(sessionId, false);
    expect(off.recordingActive).toBe(false);
    const [run] = await runs(sessionId);
    expect(run.stopped_at).not.toBeNull();
    expect(run.files).toEqual([{ filename: 'a.m3u8' }]);
  });

  it('starts one recorder when the same request arrives twice', async () => {
    const { sessionId } = await consentingSession();
    await sessions.setRecording(sessionId, true);
    await sessions.setRecording(sessionId, true);
    expect(recorder.starts).toBe(1);
    expect(await runs(sessionId)).toHaveLength(1);
  });

  it('leaves the session unrecorded, and says so, when the vendor cannot start', async () => {
    const { sessionId } = await consentingSession();
    recorder.failStart = true;
    await expect(sessions.setRecording(sessionId, true)).rejects.toMatchObject({ code: 'RECORDING_UNAVAILABLE' });
    expect((await sessions.get(sessionId)).recordingActive).toBe(false);
    expect(await runs(sessionId)).toHaveLength(0);
  });

  it('keeps showing the recording as on when the vendor cannot stop', async () => {
    const { sessionId } = await consentingSession();
    await sessions.setRecording(sessionId, true);
    recorder.failStop = true;
    await expect(sessions.setRecording(sessionId, false)).rejects.toMatchObject({ code: 'RECORDING_UNAVAILABLE' });
    // Clearing it would tell both people nothing is recording while a
    // recorder may still be running.
    expect((await sessions.get(sessionId)).recordingActive).toBe(true);
  });

  it('stops the recorder the moment either party withdraws consent', async () => {
    const { sessionId, providerId } = await consentingSession();
    await sessions.setRecording(sessionId, true);
    await sessions.recordConsent(sessionId, providerId, false);
    expect(recorder.stops).toBe(1);
    expect((await sessions.get(sessionId)).recordingActive).toBe(false);
  });

  it('stops the recorder when the session ends, and still ends if the vendor is down', async () => {
    const { sessionId } = await consentingSession();
    await sessions.start(sessionId);
    await sessions.setRecording(sessionId, true);
    recorder.failStop = true;
    const ended = await sessions.end(sessionId);
    expect(ended.status).toBe('completed');
    // The run stays open, visibly, rather than claiming a stop that did not happen.
    expect((await runs(sessionId))[0].stopped_at).toBeNull();
  });

  describe('POST /sessions/:id/room', () => {
    it('returns the session plus join credentials for the caller, and the same room for both', async () => {
      const { sessionId, seekerId, providerId } = await consentingSession();
      const seeker = await authenticateExistingUser(app, seekerId);
      const provider = await authenticateExistingUser(app, providerId);

      const a = await request(app.getHttpServer()).post(`/sessions/${sessionId}/room`).set('Authorization', seeker.bearer);
      const b = await request(app.getHttpServer()).post(`/sessions/${sessionId}/room`).set('Authorization', provider.bearer);
      expect(a.status).toBe(201);
      expect(a.body.id).toBe(sessionId);
      expect(a.body.join).toMatchObject({ provider: '100ms_sandbox', token: null });
      expect(b.body.join.roomReference).toBe(a.body.join.roomReference);
      expect(Date.parse(a.body.join.expiresAt)).toBeGreaterThan(Date.now() + 59 * 60_000);
    });

    it('GET /sessions/:id reads flat, with consent by side, and keeps the nested keys', async () => {
      const { sessionId, seekerId } = await consentingSession();
      const seeker = await authenticateExistingUser(app, seekerId);
      const res = await request(app.getHttpServer()).get(`/sessions/${sessionId}`).set('Authorization', seeker.bearer);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(sessionId);
      expect(res.body.mode).toBe('video');
      expect(res.body.consent).toEqual({ seeker: true, provider: true });
      expect(res.body.session.id).toBe(sessionId);
      expect(Array.isArray(res.body.consents)).toBe(true);
    });

    it('refuses a room for a session that is over', async () => {
      const { sessionId, seekerId } = await consentingSession();
      await sessions.cancel(sessionId);
      const seeker = await authenticateExistingUser(app, seekerId);
      const res = await request(app.getHttpServer()).post(`/sessions/${sessionId}/room`).set('Authorization', seeker.bearer);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ROOM_NOT_JOINABLE');
    });
  });
});
