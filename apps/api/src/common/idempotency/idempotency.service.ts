import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';

function bigintSafe(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

export interface CachedResponse {
  status: number;
  body: unknown;
}

/**
 * Backs the `Idempotency-Key` header required on every mutating endpoint
 * (CLAUDE.md hard rule #10). This is a distinct guarantee from
 * LedgerService's own idempotency on ledger_transactions.idempotency_key:
 * this one dedupes at the HTTP boundary (so a retried request never
 * re-runs the handler at all); the ledger's is the last line of defence
 * if a handler somehow runs twice anyway.
 */
@Injectable()
export class IdempotencyService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  static hashRequest(body: unknown): string {
    return createHash('sha256').update(JSON.stringify(body ?? null, bigintSafe)).digest('hex');
  }

  /**
   * Runs `fn` at most once per (actorId, key). A second call with the
   * same key and the same request body replays the first call's
   * response. A second call with the same key but a *different* body is
   * rejected — reusing a key across distinct requests is a client bug.
   */
  async runOnce(
    params: { actorId: string; key: string; endpoint: string; requestHash: string },
    fn: () => Promise<CachedResponse>,
  ): Promise<CachedResponse> {
    const client = await this.pool.connect();
    try {
      const inserted = await client.query<{ completed_at: Date | null; request_hash: string; response_status: number | null; response_body: unknown }>(
        `INSERT INTO idempotency_keys (key, actor_id, endpoint, request_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (actor_id, key) DO NOTHING
         RETURNING completed_at, request_hash, response_status, response_body`,
        [params.key, params.actorId, params.endpoint, params.requestHash],
      );

      if (inserted.rows.length === 0) {
        // Key already existed — fetch it instead of relying on RETURNING from a no-op.
        const existing = await client.query<{ completed_at: Date | null; request_hash: string; response_status: number | null; response_body: unknown }>(
          `SELECT completed_at, request_hash, response_status, response_body
             FROM idempotency_keys WHERE actor_id = $1 AND key = $2`,
          [params.actorId, params.key],
        );
        const row = existing.rows[0];
        if (row.request_hash !== params.requestHash) {
          throw new ConflictException('Idempotency-Key reused with a different request body');
        }
        if (row.completed_at === null) {
          throw new ConflictException('a request with this Idempotency-Key is already in flight');
        }
        return { status: row.response_status as number, body: row.response_body };
      }

      try {
        const result = await fn();

        await client.query(
          `UPDATE idempotency_keys
              SET response_status = $3, response_body = $4::jsonb, completed_at = now()
            WHERE actor_id = $1 AND key = $2`,
          [params.actorId, params.key, result.status, JSON.stringify(result.body, bigintSafe)],
        );

        return result;
      } catch (err) {
        // Don't leave a permanently in-flight row behind a failed
        // attempt — that would make every retry bounce off the 409
        // above forever. A genuinely concurrent retry racing this
        // window is a known gap, acceptable at M1's scale (no live
        // traffic yet); revisit if it matters before M6.
        await client.query(`DELETE FROM idempotency_keys WHERE actor_id = $1 AND key = $2`, [params.actorId, params.key]);
        throw err;
      }
    } finally {
      client.release();
    }
  }
}
