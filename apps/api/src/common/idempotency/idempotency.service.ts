import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { idempotencyKeyReused, idempotencyRequestInFlight } from './errors';

function bigintSafe(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

export interface CachedResponse {
  status: number;
  body: unknown;
}

interface KeyRow {
  state: 'in_flight' | 'completed' | 'failed';
  request_hash: string;
  response_status: number | null;
  response_body: unknown;
}

interface RunParams {
  actorId: string;
  key: string;
  endpoint: string;
  requestHash: string;
}

/** The claim either belongs to us (run the handler) or it does not (replay). */
type Claim = { owned: true } | { owned: false; replay: CachedResponse };

/**
 * Bounded, because every iteration means we lost a race to another
 * caller. Two callers can genuinely trade places once; a caller that
 * cannot settle after three reads is contending with something
 * pathological and should be told to retry rather than spin.
 */
const MAX_CLAIM_ATTEMPTS = 3;

/**
 * Backs the `Idempotency-Key` header required on every mutating endpoint
 * (CLAUDE.md hard rule #10). This is a distinct guarantee from
 * LedgerService's own idempotency on ledger_transactions.idempotency_key:
 * this one dedupes at the HTTP boundary (so a retried request never
 * re-runs the handler at all); the ledger's is the last line of defence
 * if a handler somehow runs twice anyway.
 *
 * **The row is never deleted.** An earlier version removed its own key
 * when the handler threw, which left a window in which a concurrent
 * request holding the same key could find no row at all — see migration
 * 0029 and TRACKER.md D5. A failed attempt is now recorded as `failed`
 * and re-claimed by the next retry through a conditional UPDATE, so the
 * key's existence is never in question.
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
   * A call arriving while another attempt is running is refused rather
   * than run alongside it.
   */
  async runOnce(params: RunParams, fn: () => Promise<CachedResponse>): Promise<CachedResponse> {
    const client = await this.pool.connect();
    try {
      const claim = await this.claim(client, params);
      if (!claim.owned) return claim.replay;

      let result: CachedResponse;
      try {
        result = await fn();
      } catch (err) {
        await this.markFailed(client, params);
        throw err;
      }

      await client.query(
        `UPDATE idempotency_keys
            SET state = 'completed',
                response_status = $3,
                response_body = $4::jsonb,
                failed_at = NULL,
                completed_at = now()
          WHERE actor_id = $1 AND key = $2`,
        [params.actorId, params.key, result.status, JSON.stringify(result.body, bigintSafe)],
      );

      return result;
    } finally {
      client.release();
    }
  }

  /**
   * Takes exclusive ownership of (actorId, key), or explains why we
   * cannot have it. Ownership is won in exactly one of two ways, both a
   * single atomic statement:
   *
   *   - the INSERT succeeds, so the key did not exist; or
   *   - the conditional UPDATE off `state = 'failed'` matches one row.
   *
   * Under READ COMMITTED the second is safe against a concurrent
   * re-claim: the loser blocks on the row lock, re-evaluates its WHERE
   * against the winner's committed row, matches nothing, and falls
   * through to the in-flight refusal.
   */
  private async claim(client: PoolClient, params: RunParams): Promise<Claim> {
    for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt += 1) {
      const inserted = await client.query(
        `INSERT INTO idempotency_keys (key, actor_id, endpoint, request_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (actor_id, key) DO NOTHING`,
        [params.key, params.actorId, params.endpoint, params.requestHash],
      );
      if (inserted.rowCount === 1) return { owned: true };

      const existing = await client.query<KeyRow>(
        `SELECT state, request_hash, response_status, response_body
           FROM idempotency_keys WHERE actor_id = $1 AND key = $2`,
        [params.actorId, params.key],
      );
      const row = existing.rows[0];
      // The row cannot vanish under the current code, but an ops purge or
      // a future retention job could remove it between those two
      // statements. Re-inserting is correct and terminates; reading
      // `undefined.request_hash` — what the pre-0029 code did here — is
      // a 500 on a money endpoint.
      if (row === undefined) continue;

      if (row.request_hash !== params.requestHash) {
        throw idempotencyKeyReused(params.key);
      }

      if (row.state === 'completed') {
        return {
          owned: false,
          replay: { status: row.response_status as number, body: row.response_body },
        };
      }

      if (row.state === 'in_flight') {
        throw idempotencyRequestInFlight(params.key);
      }

      // 'failed': a previous attempt threw. Retrying is the whole point
      // of a retryable failure, but only one retry may proceed.
      const reclaimed = await client.query(
        `UPDATE idempotency_keys
            SET state = 'in_flight',
                attempts = attempts + 1,
                claimed_at = now(),
                failed_at = NULL
          WHERE actor_id = $1 AND key = $2 AND state = 'failed' AND request_hash = $3`,
        [params.actorId, params.key, params.requestHash],
      );
      if (reclaimed.rowCount === 1) return { owned: true };
      // Someone else re-claimed it first; loop and read what they made of it.
    }

    throw idempotencyRequestInFlight(params.key);
  }

  /**
   * Records that the attempt threw, releasing the key for a later retry.
   *
   * Deliberately swallows its own failure: the handler's error is what
   * the caller needs to see, and masking it with a bookkeeping error
   * would hide, say, a declined payment behind a connection reset. The
   * cost is that a row can be stranded `in_flight` if this UPDATE (or
   * the process) dies here — see the reconciliation check
   * IDEMPOTENCY_KEY_STUCK_IN_FLIGHT, which is what surfaces that.
   */
  private async markFailed(client: PoolClient, params: RunParams): Promise<void> {
    try {
      await client.query(
        `UPDATE idempotency_keys
            SET state = 'failed', failed_at = now()
          WHERE actor_id = $1 AND key = $2 AND state = 'in_flight'`,
        [params.actorId, params.key],
      );
    } catch {
      // Intentionally ignored; see the note above.
    }
  }
}
