import { Pool, PoolClient } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, resetDatabase, seedUsers } from '../test-utils';

/**
 * "Any DB invariant touched has a test that attempts violation in raw
 * SQL and asserts failure" (CLAUDE.md, Definition of done).
 *
 * Migration 0029 gave `idempotency_keys` an explicit state and tied the
 * stored response to it. These go at the database directly, so they
 * prove Postgres refuses the bad shapes rather than that
 * IdempotencyService happens to avoid writing them.
 */
describe('idempotency_keys invariants (raw SQL)', () => {
  const pool = createPool();
  let actorId: string;

  beforeEach(async () => {
    await resetDatabase(pool);
    actorId = (await seedUsers(pool)).seekerId;
  });

  afterAll(async () => {
    await pool.end();
  });

  async function expectRejected(fn: (client: PoolClient) => Promise<void>): Promise<Error> {
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

  it('refuses a completed row with no stored response', async () => {
    const err = await expectRejected(async (client) => {
      await client.query(
        `INSERT INTO idempotency_keys (key, actor_id, endpoint, request_hash, state, completed_at)
         VALUES ('no-body', $1, 'POST /t', 'hash', 'completed', now())`,
        [actorId],
      );
    });
    // A completed row with a null body would replay `null` to every
    // retry of a money request as though it were the real answer.
    expect(err.message).toMatch(/idempotency_response_matches_state/);
  });

  it('refuses a completed row with a body but no completed_at', async () => {
    const err = await expectRejected(async (client) => {
      await client.query(
        `INSERT INTO idempotency_keys
           (key, actor_id, endpoint, request_hash, state, response_status, response_body)
         VALUES ('no-timestamp', $1, 'POST /t', 'hash', 'completed', 201, '{}'::jsonb)`,
        [actorId],
      );
    });
    expect(err.message).toMatch(/idempotency_response_matches_state/);
  });

  it('refuses an in-flight row that already carries a response', async () => {
    const err = await expectRejected(async (client) => {
      await client.query(
        `INSERT INTO idempotency_keys
           (key, actor_id, endpoint, request_hash, state, response_status, response_body, completed_at)
         VALUES ('inflight-with-body', $1, 'POST /t', 'hash', 'in_flight', 201, '{}'::jsonb, now())`,
        [actorId],
      );
    });
    expect(err.message).toMatch(/idempotency_response_matches_state/);
  });

  it('refuses a failed row that carries a response', async () => {
    const err = await expectRejected(async (client) => {
      await client.query(
        `INSERT INTO idempotency_keys
           (key, actor_id, endpoint, request_hash, state, failed_at, response_status, response_body, completed_at)
         VALUES ('failed-with-body', $1, 'POST /t', 'hash', 'failed', now(), 500, '{}'::jsonb, now())`,
        [actorId],
      );
    });
    expect(err.message).toMatch(/idempotency_response_matches_state/);
  });

  it('refuses a failed row with no failed_at, and a non-failed row that has one', async () => {
    const missing = await expectRejected(async (client) => {
      await client.query(
        `INSERT INTO idempotency_keys (key, actor_id, endpoint, request_hash, state)
         VALUES ('failed-no-when', $1, 'POST /t', 'hash', 'failed')`,
        [actorId],
      );
    });
    expect(missing.message).toMatch(/idempotency_failed_at_matches_state/);

    const spurious = await expectRejected(async (client) => {
      await client.query(
        `INSERT INTO idempotency_keys (key, actor_id, endpoint, request_hash, state, failed_at)
         VALUES ('inflight-failed-when', $1, 'POST /t', 'hash', 'in_flight', now())`,
        [actorId],
      );
    });
    expect(spurious.message).toMatch(/idempotency_failed_at_matches_state/);
  });

  it('refuses a non-positive attempt count', async () => {
    const err = await expectRejected(async (client) => {
      await client.query(
        `INSERT INTO idempotency_keys (key, actor_id, endpoint, request_hash, attempts)
         VALUES ('zero-attempts', $1, 'POST /t', 'hash', 0)`,
        [actorId],
      );
    });
    expect(err.message).toMatch(/attempts/);
  });

  it('defaults a row that does not name its state to in_flight, the stricter value', async () => {
    // As in 0027's session scope: an INSERT that forgets must land on the
    // value that REFUSES a concurrent caller, never the one that admits one.
    await pool.query(
      `INSERT INTO idempotency_keys (key, actor_id, endpoint, request_hash)
       VALUES ('defaulted', $1, 'POST /t', 'hash')`,
      [actorId],
    );
    const res = await pool.query<{ state: string; attempts: number; claimed_at: Date }>(
      `SELECT state, attempts, claimed_at FROM idempotency_keys WHERE key = 'defaulted'`,
    );
    expect(res.rows[0].state).toBe('in_flight');
    expect(res.rows[0].attempts).toBe(1);
    expect(res.rows[0].claimed_at).not.toBeNull();
  });

  it('still scopes the primary key to (actor_id, key)', async () => {
    const other = (await seedUsers(pool)).providerId;
    await pool.query(
      `INSERT INTO idempotency_keys (key, actor_id, endpoint, request_hash)
       VALUES ('same', $1, 'POST /t', 'hash'), ('same', $2, 'POST /t', 'hash')`,
      [actorId, other],
    );

    const err = await expectRejected(async (client) => {
      await client.query(
        `INSERT INTO idempotency_keys (key, actor_id, endpoint, request_hash)
         VALUES ('same', $1, 'POST /t', 'hash')`,
        [actorId],
      );
    });
    expect(err.message).toMatch(/idempotency_keys_pkey|duplicate key/);
  });
});
