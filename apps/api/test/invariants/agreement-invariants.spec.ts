import { Pool, PoolClient } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, resetDatabase, seedUsers } from '../test-utils';

/**
 * "Any DB invariant touched has a test that attempts violation in raw
 * SQL and asserts failure" (CLAUDE.md, Definition of done).
 *
 * An agreement is the record of what somebody consented to. The rules
 * worth having the database enforce are the ones that make it evidence
 * rather than a note: it cannot be edited afterwards, and an extension
 * cannot be charged without one.
 */
describe('agreement and extension invariants (raw SQL)', () => {
  const pool = createPool();

  beforeEach(async () => {
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function expectRejected(fn: (c: PoolClient) => Promise<void>): Promise<Error> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      try {
        await fn(client);
        await client.query('COMMIT');
        throw new Error('__NO_ERROR_THROWN__');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        expect((err as Error).message).not.toBe('__NO_ERROR_THROWN__');
        return err as Error;
      }
    } finally {
      client.release();
    }
  }

  async function seedAgreement(userId: string): Promise<string> {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO agreements (user_id, document_code, document_version, text_shown, text_hash, lang)
       VALUES ($1, 'terms_of_service', '1', 'The words that were on the screen.', repeat('a', 64), 'en')
       RETURNING id`,
      [userId],
    );
    return res.rows[0].id;
  }

  it('refuses to rewrite or delete an agreement', async () => {
    const { seekerId } = await seedUsers(pool);
    const id = await seedAgreement(seekerId);

    // The whole value of the record is that the words cannot change
    // after the fact — otherwise "you agreed to this" proves nothing.
    const edited = await expectRejected(async (c) => {
      await c.query(`UPDATE agreements SET text_shown = 'something more convenient' WHERE id = $1`, [id]);
    });
    expect(edited.message).toMatch(/append-only/i);

    const deleted = await expectRejected(async (c) => {
      await c.query(`DELETE FROM agreements WHERE id = $1`, [id]);
    });
    expect(deleted.message).toMatch(/append-only/i);
  });

  it('refuses an agreement with no text, or a malformed hash', async () => {
    const { seekerId } = await seedUsers(pool);

    const empty = await expectRejected(async (c) => {
      await c.query(
        `INSERT INTO agreements (user_id, document_code, document_version, text_shown, text_hash, lang)
         VALUES ($1, 'terms_of_service', '1', '   ', repeat('a', 64), 'en')`,
        [seekerId],
      );
    });
    expect(empty.message).toMatch(/text_shown/);

    const badHash = await expectRejected(async (c) => {
      await c.query(
        `INSERT INTO agreements (user_id, document_code, document_version, text_shown, text_hash, lang)
         VALUES ($1, 'terms_of_service', '1', 'words', 'short', 'en')`,
        [seekerId],
      );
    });
    expect(badHash.message).toMatch(/text_hash/);
  });

  it('refuses an accepted extension that has no agreement behind it', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagement = await pool.query<{ id: string }>(
      `INSERT INTO engagements (seeker_id, provider_id, engagement_type, currency, amount_paise, language)
       VALUES ($1, $2, 'live_session', 'INR', 100000, 'hi') RETURNING id`,
      [seekerId, providerId],
    );
    const session = await pool.query<{ id: string }>(
      `INSERT INTO sessions (engagement_id, scheduled_start, scheduled_end, timezone)
       VALUES ($1, now(), now() + interval '1 hour', 'Asia/Kolkata') RETURNING id`,
      [engagement.rows[0].id],
    );

    // Charging for an extension without a recorded agreement is exactly
    // what this feature exists to prevent, so the database refuses the
    // state rather than trusting the service to reach it correctly.
    const err = await expectRejected(async (c) => {
      await c.query(
        `INSERT INTO session_extensions (session_id, proposed_by, minutes, currency, amount_paise, status)
         VALUES ($1, $2, 15, 'INR', 30000, 'accepted')`,
        [session.rows[0].id, providerId],
      );
    });
    expect(err.message).toMatch(/extension_acceptance_is_complete/);
  });

  it('keeps one primary escrow per engagement while allowing extension escrows beside it', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagement = await pool.query<{ id: string }>(
      `INSERT INTO engagements (seeker_id, provider_id, engagement_type, currency, amount_paise, language)
       VALUES ($1, $2, 'live_session', 'INR', 100000, 'hi') RETURNING id`,
      [seekerId, providerId],
    );
    const engagementId = engagement.rows[0].id;
    const session = await pool.query<{ id: string }>(
      `INSERT INTO sessions (engagement_id, scheduled_start, scheduled_end, timezone)
       VALUES ($1, now(), now() + interval '1 hour', 'Asia/Kolkata') RETURNING id`,
      [engagementId],
    );
    const agreementId = await seedAgreement(seekerId);
    const extension = await pool.query<{ id: string }>(
      `INSERT INTO session_extensions
         (session_id, proposed_by, minutes, currency, amount_paise, status, agreement_id, accepted_by, accepted_at)
       VALUES ($1, $2, 15, 'INR', 30000, 'accepted', $3, $4, now()) RETURNING id`,
      [session.rows[0].id, providerId, agreementId, seekerId],
    );

    await pool.query(
      `INSERT INTO escrows (engagement_id, seeker_id, provider_id, currency, amount_paise)
       VALUES ($1, $2, $3, 'INR', 100000)`,
      [engagementId, seekerId, providerId],
    );
    // Beside it, not instead of it.
    await pool.query(
      `INSERT INTO escrows (engagement_id, seeker_id, provider_id, currency, amount_paise, session_extension_id)
       VALUES ($1, $2, $3, 'INR', 30000, $4)`,
      [engagementId, seekerId, providerId, extension.rows[0].id],
    );

    // But still exactly one escrow for the engagement itself: the rule
    // that predates extensions is unchanged, just narrowed to the rows
    // it was always about.
    const err = await expectRejected(async (c) => {
      await c.query(
        `INSERT INTO escrows (engagement_id, seeker_id, provider_id, currency, amount_paise)
         VALUES ($1, $2, $3, 'INR', 50000)`,
        [engagementId, seekerId, providerId],
      );
    });
    expect(err.message).toMatch(/escrows_one_primary_per_engagement/);
  });
});
