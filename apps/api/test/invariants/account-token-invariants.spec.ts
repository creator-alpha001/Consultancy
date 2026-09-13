import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, resetDatabase, seedUsers } from '../test-utils';

/**
 * Raw-SQL invariants for emailed account tokens (migration 0054): a
 * token is spent once and its identity cannot be rewritten. These are
 * the guarantees that make a reset link single-use even for a code path
 * that forgot to check.
 */
describe('account token invariants (raw SQL)', () => {
  const pool = createPool();

  beforeEach(async () => {
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function token(): Promise<string> {
    const { seekerId } = await seedUsers(pool);
    const res = await pool.query<{ id: string }>(
      `INSERT INTO account_tokens (user_id, purpose, token_hash, expires_at)
       VALUES ($1, 'password_reset', repeat('a', 64), now() + interval '30 minutes')
       RETURNING id`,
      [seekerId],
    );
    return res.rows[0].id;
  }

  it('rejects spending a token twice', async () => {
    const id = await token();
    await pool.query(`UPDATE account_tokens SET used_at = now() WHERE id = $1`, [id]);
    await expect(pool.query(`UPDATE account_tokens SET used_at = now() WHERE id = $1`, [id])).rejects.toThrow(
      /already used/,
    );
  });

  it('rejects extending a token or pointing it at another hash', async () => {
    const id = await token();
    await expect(
      pool.query(`UPDATE account_tokens SET expires_at = now() + interval '30 days' WHERE id = $1`, [id]),
    ).rejects.toThrow(/immutable/);
    await expect(
      pool.query(`UPDATE account_tokens SET token_hash = repeat('b', 64) WHERE id = $1`, [id]),
    ).rejects.toThrow(/immutable/);
  });

  it('rejects a token that expires before it was created', async () => {
    const { seekerId } = await seedUsers(pool);
    await expect(
      pool.query(
        `INSERT INTO account_tokens (user_id, purpose, token_hash, expires_at)
         VALUES ($1, 'email_verification', repeat('c', 64), now() - interval '1 minute')`,
        [seekerId],
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it('rejects a display name that is blank or too long', async () => {
    const { seekerId } = await seedUsers(pool);
    await expect(pool.query(`UPDATE users SET display_name = '   ' WHERE id = $1`, [seekerId])).rejects.toThrow(
      /check constraint/,
    );
    await expect(
      pool.query(`UPDATE users SET display_name = repeat('x', 81) WHERE id = $1`, [seekerId]),
    ).rejects.toThrow(/check constraint/);
  });
});
