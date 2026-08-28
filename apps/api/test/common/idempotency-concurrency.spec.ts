import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../src/common/errors/app-error';
import { IdempotencyErrorCode } from '../../src/common/idempotency/errors';
import { IdempotencyService } from '../../src/common/idempotency/idempotency.service';
import { createPool, resetDatabase, seedUsers } from '../test-utils';

/**
 * TRACKER.md D5: `IdempotencyService` used to DELETE its key when the
 * handler threw, so that a transient failure did not poison the key. The
 * cost was a window in which a concurrent request holding the same key
 * found no row at all — it crashed reading the missing row, and would
 * otherwise have run a second handler alongside the first.
 *
 * These tests drive the service directly rather than over HTTP, because
 * the defect is about what two callers do to one row at the same time,
 * and only a direct handle lets a test hold one attempt open while
 * another arrives.
 */
describe('idempotency: concurrent claims and failed attempts (D5)', () => {
  const pool = createPool();
  const service = new IdempotencyService(pool);
  let actorId: string;

  /** A promise a test resolves by hand, to hold a handler open. */
  function gate(): { promise: Promise<void>; open: () => void } {
    let open!: () => void;
    const promise = new Promise<void>((resolve) => {
      open = resolve;
    });
    return { promise, open };
  }

  function params(key: string, requestHash = 'hash-a') {
    return { actorId, key, endpoint: 'POST /test', requestHash };
  }

  async function ok(): Promise<{ status: number; body: unknown }> {
    return { status: 201, body: { done: true } };
  }

  async function readKey(key: string) {
    const res = await pool.query<{
      state: string;
      attempts: number;
      response_status: number | null;
      completed_at: Date | null;
      failed_at: Date | null;
    }>(
      `SELECT state, attempts, response_status, completed_at, failed_at
         FROM idempotency_keys WHERE actor_id = $1 AND key = $2`,
      [actorId, key],
    );
    return res.rows[0];
  }

  beforeEach(async () => {
    await resetDatabase(pool);
    actorId = (await seedUsers(pool)).seekerId;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('keeps the key after a failed attempt instead of deleting it', async () => {
    await expect(
      service.runOnce(params('k-fail'), async () => {
        throw new Error('handler blew up');
      }),
    ).rejects.toThrow('handler blew up');

    const row = await readKey('k-fail');
    // The pre-0029 code deleted this row outright — that deletion IS D5.
    expect(row).toBeDefined();
    expect(row.state).toBe('failed');
    expect(row.failed_at).not.toBeNull();
    expect(row.completed_at).toBeNull();
    expect(row.response_status).toBeNull();
  });

  it('surfaces the handler\'s own error, not a bookkeeping one', async () => {
    const original = new Error('payment aggregator declined');
    await expect(
      service.runOnce(params('k-original-error'), async () => {
        throw original;
      }),
    ).rejects.toBe(original);
  });

  it('lets a later retry re-claim a failed key and succeed', async () => {
    await expect(
      service.runOnce(params('k-retry'), async () => {
        throw new Error('transient');
      }),
    ).rejects.toThrow('transient');

    const result = await service.runOnce(params('k-retry'), ok);
    expect(result).toEqual({ status: 201, body: { done: true } });

    const row = await readKey('k-retry');
    expect(row.state).toBe('completed');
    expect(row.attempts).toBe(2); // claimed twice, executed twice, recorded once
    expect(row.failed_at).toBeNull();
  });

  it('refuses a second caller while the first attempt is still running', async () => {
    const held = gate();
    let executions = 0;

    const first = service.runOnce(params('k-inflight'), async () => {
      executions += 1;
      await held.promise;
      return { status: 201, body: { done: true } };
    });

    // Give the first call time to claim the row before the second arrives.
    await new Promise((r) => setTimeout(r, 50));

    const second = service.runOnce(params('k-inflight'), async () => {
      executions += 1;
      return { status: 201, body: { done: true } };
    });

    await expect(second).rejects.toMatchObject({
      code: IdempotencyErrorCode.IDEMPOTENCY_REQUEST_IN_FLIGHT,
    });

    held.open();
    await expect(first).resolves.toEqual({ status: 201, body: { done: true } });
    expect(executions).toBe(1);
  });

  /**
   * The heart of D5. Two retries arrive together on a key a previous
   * attempt left `failed`. Both read state='failed'; both try to
   * re-claim. Exactly one may run the handler.
   *
   * This is deterministic, not a timing gamble: the losing UPDATE blocks
   * on the row lock and, under READ COMMITTED, re-evaluates its
   * `WHERE state = 'failed'` against the winner's committed row.
   */
  it('lets exactly one of two simultaneous retries re-claim a failed key', async () => {
    await expect(
      service.runOnce(params('k-race'), async () => {
        throw new Error('first attempt failed');
      }),
    ).rejects.toThrow('first attempt failed');

    const held = gate();
    let executions = 0;

    const slowHandler = async () => {
      executions += 1;
      await held.promise;
      return { status: 201, body: { attempt: executions } };
    };

    // Released once both callers have had time to reach the re-claim; the
    // winner is blocked on this, so it cannot be opened after they settle.
    setTimeout(held.open, 200);

    const outcomes = await Promise.allSettled([
      service.runOnce(params('k-race'), slowHandler),
      service.runOnce(params('k-race'), slowHandler),
    ]);

    // Nothing raced its way into a second execution.
    expect(executions).toBe(1);

    const rejected = outcomes.filter((o) => o.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: IdempotencyErrorCode.IDEMPOTENCY_REQUEST_IN_FLIGHT,
    });

    const row = await readKey('k-race');
    expect(row.attempts).toBe(2); // the original failure, plus the one winner
  });

  it('replays a completed response rather than re-running the handler', async () => {
    let executions = 0;
    const handler = async () => {
      executions += 1;
      return { status: 200, body: { value: executions } };
    };

    const first = await service.runOnce(params('k-replay'), handler);
    const second = await service.runOnce(params('k-replay'), handler);

    expect(second).toEqual(first);
    expect(executions).toBe(1);
    expect((await readKey('k-replay')).attempts).toBe(1);
  });

  it('rejects the same key with a different body, in every state', async () => {
    // ...while completed.
    await service.runOnce(params('k-body', 'hash-a'), ok);
    await expect(service.runOnce(params('k-body', 'hash-b'), ok)).rejects.toMatchObject({
      code: IdempotencyErrorCode.IDEMPOTENCY_KEY_REUSED,
    });

    // ...and while failed, where the row is re-claimable but only by the
    // same request. A retry that has changed its body is not a retry.
    await expect(
      service.runOnce(params('k-body-2', 'hash-a'), async () => {
        throw new Error('nope');
      }),
    ).rejects.toThrow('nope');
    await expect(service.runOnce(params('k-body-2', 'hash-b'), ok)).rejects.toMatchObject({
      code: IdempotencyErrorCode.IDEMPOTENCY_KEY_REUSED,
    });
    expect((await readKey('k-body-2')).state).toBe('failed'); // untouched by the rejected caller
  });

  it('scopes keys to the actor, so two users cannot collide', async () => {
    const other = (await seedUsers(pool)).seekerId;
    let executions = 0;
    const handler = async () => {
      executions += 1;
      return { status: 201, body: { n: executions } };
    };

    await service.runOnce({ actorId, key: 'shared', endpoint: 'POST /t', requestHash: 'h' }, handler);
    await service.runOnce(
      { actorId: other, key: 'shared', endpoint: 'POST /t', requestHash: 'h' },
      handler,
    );

    expect(executions).toBe(2); // two different actors, two different keys
  });

  it('gives the two conflict cases distinct, stable codes', async () => {
    // Both are 409, and a client must treat them oppositely: one is
    // "retry this shortly", the other is "never retry this".
    await service.runOnce(params('k-codes', 'hash-a'), ok);
    const reused = await service
      .runOnce(params('k-codes', 'hash-b'), ok)
      .catch((e: unknown) => e as AppError);

    expect(reused).toBeInstanceOf(AppError);
    expect((reused as AppError).code).toBe(IdempotencyErrorCode.IDEMPOTENCY_KEY_REUSED);
    expect((reused as AppError).getStatus()).toBe(409);
    expect((reused as AppError).detail).not.toHaveProperty('retryable');
  });
});
