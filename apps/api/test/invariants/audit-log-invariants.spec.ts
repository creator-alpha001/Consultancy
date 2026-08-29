import { Pool, PoolClient } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, resetDatabase, seedUsers } from '../test-utils';

/**
 * "Any DB invariant touched has a test that attempts violation in raw
 * SQL and asserts failure" (CLAUDE.md, Definition of done).
 *
 * A log that can be edited is not evidence of anything, so the
 * append-only rule is the whole value of this table — it is the reason
 * rule #14 names it alongside the ledger.
 */
describe('audit_log invariants (raw SQL)', () => {
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

  async function seedEntry(): Promise<string> {
    const { seekerId } = await seedUsers(pool);
    const res = await pool.query<{ id: string }>(
      `INSERT INTO audit_log (actor_id, actor_role, action, subject_type, subject_id, detail)
       VALUES ($1, 'admin', 'dispute.ruled', 'dispute', gen_random_uuid(), '{"outcome":"split"}'::jsonb)
       RETURNING id`,
      [seekerId],
    );
    return res.rows[0].id;
  }

  it('refuses to rewrite an entry', async () => {
    const id = await seedEntry();
    const err = await expectRejected(async (c) => {
      await c.query(`UPDATE audit_log SET action = 'dispute.withdrawn' WHERE id = $1`, [id]);
    });
    expect(err.message).toMatch(/append-only|immutable|cannot be/i);
  });

  it('refuses to delete an entry', async () => {
    const id = await seedEntry();
    const err = await expectRejected(async (c) => {
      await c.query(`DELETE FROM audit_log WHERE id = $1`, [id]);
    });
    expect(err.message).toMatch(/append-only|immutable|cannot be/i);
  });

  it('refuses an entry with no action or no subject type', async () => {
    for (const [action, subjectType] of [['', 'dispute'], ['   ', 'dispute'], ['x', '  ']]) {
      const err = await expectRejected(async (c) => {
        await c.query(
          `INSERT INTO audit_log (action, subject_type) VALUES ($1, $2)`,
          [action, subjectType],
        );
      });
      expect(err.message).toMatch(/action|subject_type/);
    }
  });

  it('allows a null actor, because the platform itself acts', async () => {
    // A relay dispatching a payout has no human behind it. That must be
    // recordable and distinguishable from "we did not record who".
    await pool.query(
      `INSERT INTO audit_log (action, subject_type, detail)
       VALUES ('payout.instructed', 'payout', '{}'::jsonb)`,
    );
    const res = await pool.query<{ actor_id: string | null }>(
      `SELECT actor_id FROM audit_log WHERE action = 'payout.instructed'`,
    );
    expect(res.rows[0].actor_id).toBeNull();
  });

  it('survives the subject it describes being deleted', async () => {
    // Deliberately not a foreign key: the log must outlive the record,
    // or a deletion would erase the history of what was done to it.
    const { seekerId } = await seedUsers(pool);
    await pool.query(
      `INSERT INTO audit_log (actor_id, action, subject_type, subject_id)
       VALUES ($1, 'credential.verified', 'provider_credential', gen_random_uuid())`,
      [seekerId],
    );
    const before = await pool.query(`SELECT count(*)::int AS n FROM audit_log`);
    expect(before.rows[0].n).toBe(1);

    // The subject_id points at nothing; the row stands.
    const orphan = await pool.query<{ subject_id: string }>(
      `SELECT subject_id FROM audit_log LIMIT 1`,
    );
    expect(orphan.rows[0].subject_id).toBeTruthy();
  });
});
