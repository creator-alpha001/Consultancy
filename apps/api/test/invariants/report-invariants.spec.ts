import { Pool, PoolClient } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, resetDatabase, seedUsers } from '../test-utils';

/**
 * "Any DB invariant touched has a test that attempts violation in raw
 * SQL and asserts failure" (CLAUDE.md, Definition of done).
 *
 * Reports are evidence in exactly the situations that end badly, so the
 * rules that matter are the ones an application bug could otherwise
 * quietly break: you cannot report yourself, a resolution is complete or
 * absent, a resolved report cannot be re-opened and re-decided, and one
 * person cannot stack live reports on the same thing.
 */
describe('reports invariants (raw SQL)', () => {
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

  async function seedFamily(): Promise<string> {
    await pool.query(
      `INSERT INTO domain_families (code, manifest_version, manifest)
       VALUES ('test_family', '1.0.0', '{"code":"test_family"}'::jsonb)
       ON CONFLICT (code) DO NOTHING`,
    );
    return 'test_family';
  }

  async function insertReport(
    client: PoolClient | Pool,
    values: Record<string, unknown>,
  ): Promise<string> {
    const res = await client.query<{ id: string }>(
      `INSERT INTO reports (reporter_id, subject_type, subject_id, subject_owner_id, family_code, reason_code, status, holds_content, resolved_by, resolved_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'open')::report_status, COALESCE($8, false), $9, $10)
       RETURNING id`,
      [
        values.reporterId,
        values.subjectType ?? 'question',
        values.subjectId,
        values.subjectOwnerId ?? null,
        values.familyCode,
        values.reasonCode ?? 'harassment',
        values.status ?? null,
        values.holdsContent ?? null,
        values.resolvedBy ?? null,
        values.resolvedAt ?? null,
      ],
    );
    return res.rows[0].id;
  }

  it('refuses a report whose subject owner is the reporter', async () => {
    const { seekerId } = await seedUsers(pool);
    const familyCode = await seedFamily();
    const err = await expectRejected(async (c) => {
      await insertReport(c, {
        reporterId: seekerId,
        subjectId: seekerId,
        subjectType: 'user',
        subjectOwnerId: seekerId,
        familyCode,
      });
    });
    expect(err.message).toMatch(/report_is_not_self/);
  });

  it('refuses a half-resolved report — a resolver without a time, or a time without a resolver', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const familyCode = await seedFamily();

    const noTime = await expectRejected(async (c) => {
      await c.query(
        `INSERT INTO reports (reporter_id, subject_type, subject_id, subject_owner_id, family_code, reason_code, status, resolved_by)
         VALUES ($1, 'user', $2, $2, $3, 'harassment', 'actioned', $1)`,
        [seekerId, providerId, familyCode],
      );
    });
    expect(noTime.message).toMatch(/report_resolution_is_complete/);

    // And the mirror: resolved in time but by nobody.
    const noResolver = await expectRejected(async (c) => {
      await c.query(
        `INSERT INTO reports (reporter_id, subject_type, subject_id, subject_owner_id, family_code, reason_code, status, resolved_at)
         VALUES ($1, 'user', $2, $2, $3, 'harassment', 'actioned', now())`,
        [seekerId, providerId, familyCode],
      );
    });
    expect(noResolver.message).toMatch(/report_resolution_is_complete/);
  });

  it('refuses to re-open a resolved report', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const familyCode = await seedFamily();
    const id = await insertReport(pool, {
      reporterId: seekerId,
      subjectType: 'user',
      subjectId: providerId,
      subjectOwnerId: providerId,
      familyCode,
      status: 'dismissed',
      resolvedBy: seekerId,
      resolvedAt: new Date(),
    });

    const err = await expectRejected(async (c) => {
      await c.query(`UPDATE reports SET status = 'open', resolved_at = NULL, resolved_by = NULL WHERE id = $1`, [id]);
    });
    expect(err.message).toMatch(/already resolved/);
  });

  it("refuses to rewrite a report's claim after the fact", async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const familyCode = await seedFamily();
    const id = await insertReport(pool, {
      reporterId: seekerId,
      subjectType: 'user',
      subjectId: providerId,
      subjectOwnerId: providerId,
      familyCode,
      reasonCode: 'harassment',
    });

    const err = await expectRejected(async (c) => {
      await c.query(`UPDATE reports SET reason_code = 'spam' WHERE id = $1`, [id]);
    });
    expect(err.message).toMatch(/identity and claim are immutable/);
  });

  it('allows only one live report per person per subject, and a new one once resolved', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const familyCode = await seedFamily();
    const first = await insertReport(pool, {
      reporterId: seekerId,
      subjectType: 'user',
      subjectId: providerId,
      subjectOwnerId: providerId,
      familyCode,
    });

    const err = await expectRejected(async (c) => {
      await insertReport(c, {
        reporterId: seekerId,
        subjectType: 'user',
        subjectId: providerId,
        subjectOwnerId: providerId,
        familyCode,
      });
    });
    expect(err.message).toMatch(/reports_one_live_per_reporter_subject/);

    // Resolving it frees the slot — which is the deliberate recourse for
    // a report the reporter believes was wrongly dismissed.
    await pool.query(
      `UPDATE reports SET status = 'dismissed', resolved_by = $2, resolved_at = now() WHERE id = $1`,
      [first, providerId],
    );
    const second = await insertReport(pool, {
      reporterId: seekerId,
      subjectType: 'user',
      subjectId: providerId,
      subjectOwnerId: providerId,
      familyCode,
    });
    expect(second).toBeTruthy();
  });

  it('keeps a report after the content it is about is deleted', async () => {
    // subject_id is deliberately not a foreign key: a complaint must
    // outlive the thing complained about, or deleting the content would
    // delete the evidence.
    const { seekerId } = await seedUsers(pool);
    const familyCode = await seedFamily();
    const goneForever = '00000000-0000-4000-8000-0000000000ff';
    const id = await insertReport(pool, {
      reporterId: seekerId,
      subjectType: 'question',
      subjectId: goneForever,
      familyCode,
    });
    const res = await pool.query(`SELECT id FROM reports WHERE id = $1`, [id]);
    expect(res.rows).toHaveLength(1);
  });
});
