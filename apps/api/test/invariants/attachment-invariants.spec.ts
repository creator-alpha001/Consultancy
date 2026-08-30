import { Pool, PoolClient } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, resetDatabase, seedUsers } from '../test-utils';

/**
 * "Any DB invariant touched has a test that attempts violation in raw
 * SQL and asserts failure" (CLAUDE.md, Definition of done).
 *
 * These tables hold the pointer to someone's identity document and the
 * list of who may read it. The rules worth enforcing in the database are
 * the ones an application bug would otherwise break silently: a key
 * cannot be reused across two rows, and there cannot be two live grants
 * to the same person that revocation would have to choose between.
 */
describe('attachment invariants (raw SQL)', () => {
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

  async function seedAttachment(ownerId: string, key = 'k/one'): Promise<string> {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO attachments (owner_id, storage_key, content_type, byte_size, sha256)
       VALUES ($1, $2, 'application/pdf', 1024, repeat('a', 64))
       RETURNING id`,
      [ownerId, key],
    );
    return res.rows[0].id;
  }

  it('refuses two attachments sharing a storage key', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    await seedAttachment(seekerId, 'shared/key');
    const err = await expectRejected(async (c) => {
      await c.query(
        `INSERT INTO attachments (owner_id, storage_key, content_type, byte_size, sha256)
         VALUES ($1, 'shared/key', 'application/pdf', 10, repeat('b', 64))`,
        [providerId],
      );
    });
    expect(err.message).toMatch(/storage_key/);
  });

  it('refuses an empty file and a malformed hash', async () => {
    const { seekerId } = await seedUsers(pool);
    const empty = await expectRejected(async (c) => {
      await c.query(
        `INSERT INTO attachments (owner_id, storage_key, content_type, byte_size, sha256)
         VALUES ($1, 'k/empty', 'application/pdf', 0, repeat('a', 64))`,
        [seekerId],
      );
    });
    expect(empty.message).toMatch(/byte_size/);

    const badHash = await expectRejected(async (c) => {
      await c.query(
        `INSERT INTO attachments (owner_id, storage_key, content_type, byte_size, sha256)
         VALUES ($1, 'k/hash', 'application/pdf', 10, 'not-a-sha')`,
        [seekerId],
      );
    });
    expect(badHash.message).toMatch(/sha256/);
  });

  it('allows only one live grant per person, and another once revoked', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const attachmentId = await seedAttachment(seekerId);

    await pool.query(
      `INSERT INTO attachment_grants (attachment_id, grantee_id, reason) VALUES ($1, $2, 'first')`,
      [attachmentId, providerId],
    );

    const err = await expectRejected(async (c) => {
      await c.query(
        `INSERT INTO attachment_grants (attachment_id, grantee_id, reason) VALUES ($1, $2, 'second')`,
        [attachmentId, providerId],
      );
    });
    expect(err.message).toMatch(/attachment_grants_one_live/);

    // Revoked, a fresh grant is possible — re-granting after a
    // revocation is a real thing that happens, and it must not require
    // resurrecting the old row.
    await pool.query(`UPDATE attachment_grants SET revoked_at = now() WHERE attachment_id = $1`, [attachmentId]);
    await pool.query(
      `INSERT INTO attachment_grants (attachment_id, grantee_id, reason) VALUES ($1, $2, 'again')`,
      [attachmentId, providerId],
    );
    const live = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM attachment_grants WHERE attachment_id = $1 AND revoked_at IS NULL`,
      [attachmentId],
    );
    expect(Number(live.rows[0].n)).toBe(1);
  });

  it('refuses a grant with no stated reason', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const attachmentId = await seedAttachment(seekerId);
    const err = await expectRejected(async (c) => {
      await c.query(
        `INSERT INTO attachment_grants (attachment_id, grantee_id, reason) VALUES ($1, $2, '   ')`,
        [attachmentId, providerId],
      );
    });
    expect(err.message).toMatch(/reason/);
  });
});
