import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, resetDatabase, seedEngagement, seedUsers } from '../test-utils';

/**
 * Raw-SQL invariant tests for M5's session lifecycle and the recording
 * consent gate (CLAUDE.md #21).
 */
describe('session invariants (raw SQL)', () => {
  const pool = createPool();

  beforeEach(async () => {
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedSession(seekerId: string, providerId: string): Promise<string> {
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    const res = await pool.query<{ id: string }>(
      `INSERT INTO sessions (engagement_id, scheduled_start, scheduled_end, timezone)
       VALUES ($1, now() + interval '1 day', now() + interval '1 day 1 hour', 'Asia/Kolkata')
       RETURNING id`,
      [engagementId],
    );
    return res.rows[0].id;
  }

  it('rejects a session whose scheduled_end is before scheduled_start', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    await expect(
      pool.query(
        `INSERT INTO sessions (engagement_id, scheduled_start, scheduled_end, timezone)
         VALUES ($1, now() + interval '2 hours', now() + interval '1 hour', 'Asia/Kolkata')`,
        [engagementId],
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it('rejects an invalid session transition (scheduled -> completed, skipping in_progress)', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const sessionId = await seedSession(seekerId, providerId);
    await expect(
      pool.query(`UPDATE sessions SET status = 'completed' WHERE id = $1`, [sessionId]),
    ).rejects.toThrow(/invalid session transition/);
  });

  it('allows the full scheduled -> in_progress -> completed path', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const sessionId = await seedSession(seekerId, providerId);
    await pool.query(`UPDATE sessions SET status = 'in_progress' WHERE id = $1`, [sessionId]);
    await pool.query(`UPDATE sessions SET status = 'completed' WHERE id = $1`, [sessionId]);
    const res = await pool.query<{ status: string }>(`SELECT status FROM sessions WHERE id = $1`, [sessionId]);
    expect(res.rows[0].status).toBe('completed');
  });

  it('rejects turning recording on with zero participants', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const sessionId = await seedSession(seekerId, providerId);
    await expect(
      pool.query(`UPDATE sessions SET recording_active = true WHERE id = $1`, [sessionId]),
    ).rejects.toThrow(/cannot record/);
  });

  it('rejects turning recording on when only one of two participants consented', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const sessionId = await seedSession(seekerId, providerId);
    await pool.query(`INSERT INTO session_participants (session_id, user_id) VALUES ($1, $2), ($1, $3)`, [
      sessionId, seekerId, providerId,
    ]);
    await pool.query(`INSERT INTO session_consents (session_id, user_id, consent_given) VALUES ($1, $2, true)`, [
      sessionId, seekerId,
    ]);
    // Provider has NOT decided at all — a missing row, not even a refusal.
    await expect(
      pool.query(`UPDATE sessions SET recording_active = true WHERE id = $1`, [sessionId]),
    ).rejects.toThrow(/cannot record/);
  });

  it('rejects turning recording on when one participant explicitly refused', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const sessionId = await seedSession(seekerId, providerId);
    await pool.query(`INSERT INTO session_participants (session_id, user_id) VALUES ($1, $2), ($1, $3)`, [
      sessionId, seekerId, providerId,
    ]);
    await pool.query(
      `INSERT INTO session_consents (session_id, user_id, consent_given) VALUES ($1, $2, true), ($1, $3, false)`,
      [sessionId, seekerId, providerId],
    );
    await expect(
      pool.query(`UPDATE sessions SET recording_active = true WHERE id = $1`, [sessionId]),
    ).rejects.toThrow(/cannot record/);
  });

  it('allows recording once BOTH participants have explicitly consented', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const sessionId = await seedSession(seekerId, providerId);
    await pool.query(`INSERT INTO session_participants (session_id, user_id) VALUES ($1, $2), ($1, $3)`, [
      sessionId, seekerId, providerId,
    ]);
    await pool.query(
      `INSERT INTO session_consents (session_id, user_id, consent_given) VALUES ($1, $2, true), ($1, $3, true)`,
      [sessionId, seekerId, providerId],
    );
    await pool.query(`UPDATE sessions SET recording_active = true WHERE id = $1`, [sessionId]);
    const res = await pool.query<{ recording_active: boolean }>(`SELECT recording_active FROM sessions WHERE id = $1`, [sessionId]);
    expect(res.rows[0].recording_active).toBe(true);
  });

  it('rejects a duplicate transcript for the same session', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const sessionId = await seedSession(seekerId, providerId);
    await pool.query(`INSERT INTO transcripts (session_id, language, content_ref) VALUES ($1, 'hi', 'ref-1')`, [sessionId]);
    await expect(
      pool.query(`INSERT INTO transcripts (session_id, language, content_ref) VALUES ($1, 'hi', 'ref-2')`, [sessionId]),
    ).rejects.toThrow(/duplicate key/);
  });
});
