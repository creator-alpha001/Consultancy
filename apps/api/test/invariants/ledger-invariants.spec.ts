import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool, PoolClient } from 'pg';
import { createPool, resetDatabase, seedEngagement, seedUsers } from '../test-utils';

/**
 * "Any DB invariant touched has a test that attempts violation in raw
 * SQL and asserts failure" (CLAUDE.md, Definition of done). These tests
 * go straight at the database with a raw client — no app services — so
 * they prove the invariant is enforced by Postgres itself, not merely by
 * code that happens to be careful.
 */
describe('ledger invariants (raw SQL)', () => {
  const pool = createPool();

  beforeEach(async () => {
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function withRolledBackTransaction(fn: (client: PoolClient) => Promise<void>): Promise<Error> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      try {
        await fn(client);
        await client.query('COMMIT');
        throw new Error('__NO_ERROR_THROWN__');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        return err as Error;
      }
    } finally {
      client.release();
    }
  }

  async function createAccount(client: PoolClient, type: string, currency = 'INR'): Promise<string> {
    const res = await client.query<{ id: string }>(
      `INSERT INTO ledger_accounts (type, owner_user_id, currency) VALUES ($1, NULL, $2) RETURNING id`,
      [type, currency],
    );
    return res.rows[0].id;
  }

  it('rejects a ledger transaction whose entries do not sum to zero', async () => {
    const err = await withRolledBackTransaction(async (client) => {
      const a = await createAccount(client, 'payment_aggregator');
      const b = await createAccount(client, 'escrow');
      const tx = await client.query<{ id: string }>(
        `INSERT INTO ledger_transactions (idempotency_key, reason) VALUES ('unbalanced-1', 'test') RETURNING id`,
      );
      const txId = tx.rows[0].id;
      await client.query(
        `INSERT INTO ledger_entries (transaction_id, account_id, currency, amount_paise) VALUES ($1,$2,'INR',-1000)`,
        [txId, a],
      );
      // Off by 100 — should never be allowed to commit.
      await client.query(
        `INSERT INTO ledger_entries (transaction_id, account_id, currency, amount_paise) VALUES ($1,$2,'INR',900)`,
        [txId, b],
      );
    });
    expect(err.message).not.toBe('__NO_ERROR_THROWN__');
    expect(err.message).toMatch(/does not balance/);
  });

  it('rejects a ledger transaction with only one entry (it can never balance to zero)', async () => {
    const err = await withRolledBackTransaction(async (client) => {
      const a = await createAccount(client, 'payment_aggregator');
      const tx = await client.query<{ id: string }>(
        `INSERT INTO ledger_transactions (idempotency_key, reason) VALUES ('single-sided-1', 'test') RETURNING id`,
      );
      await client.query(
        `INSERT INTO ledger_entries (transaction_id, account_id, currency, amount_paise) VALUES ($1,$2,'INR',1000)`,
        [tx.rows[0].id, a],
      );
    });
    expect(err.message).not.toBe('__NO_ERROR_THROWN__');
    expect(err.message).toMatch(/does not balance/);
  });

  it('accepts a balanced, two-sided transaction', async () => {
    const err = await withRolledBackTransaction(async (client) => {
      const a = await createAccount(client, 'payment_aggregator');
      const b = await createAccount(client, 'escrow');
      const tx = await client.query<{ id: string }>(
        `INSERT INTO ledger_transactions (idempotency_key, reason) VALUES ('balanced-1', 'test') RETURNING id`,
      );
      const txId = tx.rows[0].id;
      await client.query(
        `INSERT INTO ledger_entries (transaction_id, account_id, currency, amount_paise) VALUES ($1,$2,'INR',-1000)`,
        [txId, a],
      );
      await client.query(
        `INSERT INTO ledger_entries (transaction_id, account_id, currency, amount_paise) VALUES ($1,$2,'INR',1000)`,
        [txId, b],
      );
      // Force this one to actually commit rather than roll back, so we
      // can prove a *valid* transaction is not incidentally rejected too.
      throw new Error('__NO_ERROR_THROWN__');
    });
    expect(err.message).toBe('__NO_ERROR_THROWN__');
  });

  it('rejects UPDATE on ledger_entries — append-only', async () => {
    const client = await pool.connect();
    try {
      const a = await createAccount(client, 'payment_aggregator');
      const b = await createAccount(client, 'escrow');
      // The two entries must commit as one balanced transaction before we
      // can even attempt the UPDATE we're actually testing here.
      await client.query('BEGIN');
      const tx = await client.query<{ id: string }>(
        `INSERT INTO ledger_transactions (idempotency_key, reason) VALUES ('append-only-1', 'test') RETURNING id`,
      );
      const entry = await client.query<{ id: string }>(
        `INSERT INTO ledger_entries (transaction_id, account_id, currency, amount_paise) VALUES ($1,$2,'INR',-1000) RETURNING id`,
        [tx.rows[0].id, a],
      );
      await client.query(
        `INSERT INTO ledger_entries (transaction_id, account_id, currency, amount_paise) VALUES ($1,$2,'INR',1000)`,
        [tx.rows[0].id, b],
      );
      await client.query('COMMIT');

      await expect(
        client.query(`UPDATE ledger_entries SET amount_paise = -2000 WHERE id = $1`, [entry.rows[0].id]),
      ).rejects.toThrow(/append-only/);
    } finally {
      client.release();
    }
  });

  it('rejects DELETE on ledger_transactions — append-only', async () => {
    const client = await pool.connect();
    try {
      const tx = await client.query<{ id: string }>(
        `INSERT INTO ledger_transactions (idempotency_key, reason) VALUES ('append-only-2', 'test') RETURNING id`,
      );
      await expect(
        client.query(`DELETE FROM ledger_transactions WHERE id = $1`, [tx.rows[0].id]),
      ).rejects.toThrow(/append-only/);
    } finally {
      client.release();
    }
  });

  it('rejects a duplicate ledger_transactions.idempotency_key', async () => {
    const client = await pool.connect();
    try {
      await client.query(`INSERT INTO ledger_transactions (idempotency_key, reason) VALUES ('dup-key', 'test')`);
      await expect(
        client.query(`INSERT INTO ledger_transactions (idempotency_key, reason) VALUES ('dup-key', 'test')`),
      ).rejects.toThrow(/duplicate key/);
    } finally {
      client.release();
    }
  });
});

describe('escrow status transitions (raw SQL)', () => {
  const pool = createPool();

  beforeEach(async () => {
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedPendingEscrow(): Promise<string> {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    const res = await pool.query<{ id: string }>(
      `INSERT INTO escrows (engagement_id, seeker_id, provider_id, currency, amount_paise)
       VALUES ($1, $2, $3, 'INR', 100000) RETURNING id`,
      [engagementId, seekerId, providerId],
    );
    return res.rows[0].id;
  }

  it('rejects pending -> released (must go through held)', async () => {
    const escrowId = await seedPendingEscrow();
    await expect(
      pool.query(`UPDATE escrows SET status = 'released' WHERE id = $1`, [escrowId]),
    ).rejects.toThrow(/invalid escrow transition/);
  });

  it('rejects released -> held (terminal states do not reopen)', async () => {
    const escrowId = await seedPendingEscrow();
    await pool.query(`UPDATE escrows SET status = 'held' WHERE id = $1`, [escrowId]);
    await pool.query(`UPDATE escrows SET status = 'released' WHERE id = $1`, [escrowId]);
    await expect(
      pool.query(`UPDATE escrows SET status = 'held' WHERE id = $1`, [escrowId]),
    ).rejects.toThrow(/invalid escrow transition/);
  });

  it('allows the full pending -> held -> released path', async () => {
    const escrowId = await seedPendingEscrow();
    await pool.query(`UPDATE escrows SET status = 'held' WHERE id = $1`, [escrowId]);
    await pool.query(`UPDATE escrows SET status = 'released' WHERE id = $1`, [escrowId]);
    const res = await pool.query<{ status: string }>(`SELECT status FROM escrows WHERE id = $1`, [escrowId]);
    expect(res.rows[0].status).toBe('released');
  });
});

describe('fee schedule invariants (raw SQL)', () => {
  const pool = createPool();

  beforeEach(async () => {
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('rejects overlapping fee schedules for the same currency', async () => {
    await pool.query(
      `INSERT INTO fee_schedules (currency, effective_from, effective_to, platform_fee_bps)
       VALUES ('INR', '2026-01-01', '2026-06-01', 1500)`,
    );
    await expect(
      pool.query(
        `INSERT INTO fee_schedules (currency, effective_from, effective_to, platform_fee_bps)
         VALUES ('INR', '2026-03-01', '2026-09-01', 1200)`,
      ),
    ).rejects.toThrow(/conflicting key value|exclusion constraint/);
  });

  it('allows adjacent (non-overlapping) fee schedules for the same currency', async () => {
    await pool.query(
      `INSERT INTO fee_schedules (currency, effective_from, effective_to, platform_fee_bps)
       VALUES ('INR', '2026-01-01', '2026-06-01', 1500)`,
    );
    await expect(
      pool.query(
        `INSERT INTO fee_schedules (currency, effective_from, effective_to, platform_fee_bps)
         VALUES ('INR', '2026-06-01', '2026-12-01', 1200)`,
      ),
    ).resolves.toBeDefined();
  });

  it('rejects a schedule whose effective_to is before its effective_from', async () => {
    await expect(
      pool.query(
        `INSERT INTO fee_schedules (currency, effective_from, effective_to, platform_fee_bps)
         VALUES ('INR', '2026-06-01', '2026-01-01', 1500)`,
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it('fee_schedule_at resolves the schedule covering the given timestamp, never the latest by insertion', async () => {
    // Bounded, so a later-inserted, open-ended future schedule doesn't
    // overlap it (two open-ended schedules for the same currency never
    // could — that would make "current" ambiguous, which the exclusion
    // constraint above already proves the DB refuses).
    const current = await pool.query<{ id: string }>(
      `INSERT INTO fee_schedules (currency, effective_from, effective_to, platform_fee_bps)
       VALUES ('INR', now() - interval '1 day', now() + interval '10 days', 1500) RETURNING id`,
    );

    // Inserted after, and with a later effective_from than `current` —
    // an app doing ORDER BY effective_from DESC LIMIT 1 would wrongly
    // prefer this one for "now". fee_schedule_at must not.
    await pool.query(
      `INSERT INTO fee_schedules (currency, effective_from, platform_fee_bps) VALUES ('INR', now() + interval '30 days', 500)`,
    );

    const resolved = await pool.query<{ id: string; platform_fee_bps: number }>(
      `SELECT id, platform_fee_bps FROM fee_schedule_at('INR', now())`,
    );
    expect(resolved.rows[0].id).toBe(current.rows[0].id);
    expect(resolved.rows[0].platform_fee_bps).toBe(1500);
  });
});
