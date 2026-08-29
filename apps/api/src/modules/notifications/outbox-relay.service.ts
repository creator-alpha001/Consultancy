import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { PayoutDispatchService } from '../money/payout-dispatch.service';

export interface RelayResult {
  claimed: number;
  dispatched: number;
  failed: number;
  deadLettered: number;
}

interface OutboxRow {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
}

/** After this many failures a row stops being retried and starts being reported. */
const MAX_ATTEMPTS = 8;

/** Exponential, capped: 1m, 2m, 4m … 1h. */
function backoffSeconds(attempts: number): number {
  return Math.min(60 * 2 ** Math.max(0, attempts - 1), 3600);
}

/**
 * The outbox relay.
 *
 * `outbox` has been written to correctly since M1 and read by nothing.
 * `release()` credited a provider's wallet and wrote `payout.initiated`;
 * no transfer was ever instructed, so no settlement webhook could ever
 * arrive, and reconciliation reported payouts stuck at `initiated`
 * forever. The books were right and nobody got paid (TRACKER D28).
 *
 * Three properties matter more than throughput here.
 *
 * **Nothing external is called inside a transaction** (hard rule #9).
 * Claiming is a single UPDATE that pushes `next_attempt_at` forward and
 * commits; the aggregator call happens afterwards, holding no lock and
 * no open transaction.
 *
 * **A crash mid-dispatch retries rather than strands.** Because the
 * claim IS the retry schedule, there is no separate in-flight state to
 * get stuck in — the row simply becomes eligible again later. That makes
 * delivery at-least-once, so every handler is written to be safe when
 * called twice with the same event.
 *
 * **Two relays cannot both dispatch one row.** The claim uses
 * `FOR UPDATE SKIP LOCKED`, so a second process selects different rows
 * rather than blocking on or duplicating the first one's.
 *
 * What this is NOT: a scheduler. Something has to call `runOnce()` — an
 * interval, an admin request, or the BullMQ worker the stack calls for
 * and which is still unbuilt (D14/D23). The seam is deliberate.
 */
@Injectable()
export class OutboxRelayService {
  private readonly log = new Logger(OutboxRelayService.name);

  /**
   * Only these are dispatched. An event with no handler is left pending
   * on purpose rather than marked delivered: `escrow.held` and the
   * settlement notifications have no transport yet, and marking them
   * dispatched would silently drop messages people are meant to receive.
   * Reconciliation reports them, which is the honest outcome.
   */
  private readonly handlers: Record<string, (row: OutboxRow) => Promise<void>> = {
    'payout.initiated': async (row) => {
      const outcome = await this.payouts.dispatchPayout(row.aggregate_id);
      this.log.log(`payout.initiated ${row.aggregate_id}: ${outcome}`);
    },
    'refund.initiated': async (row) => {
      const outcome = await this.payouts.dispatchRefund(row.aggregate_id);
      this.log.log(`refund.initiated ${row.aggregate_id}: ${outcome}`);
    },
  };

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(PayoutDispatchService) private readonly payouts: PayoutDispatchService,
  ) {}

  handledEventTypes(): string[] {
    return Object.keys(this.handlers);
  }

  async runOnce(batchSize = 20): Promise<RelayResult> {
    const rows = await this.claim(batchSize);
    const result: RelayResult = { claimed: rows.length, dispatched: 0, failed: 0, deadLettered: 0 };

    for (const row of rows) {
      try {
        await this.handlers[row.event_type](row);
        await this.pool.query(
          `UPDATE outbox SET dispatched_at = now(), last_error = NULL WHERE id = $1`,
          [row.id],
        );
        result.dispatched += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // `attempts` was already incremented by the claim, so it reflects
        // this try. Past the cap the row stops being retried and stays
        // undispatched — a payout that cannot be instructed is not
        // something to stop trying at AND forget.
        const dead = row.attempts >= MAX_ATTEMPTS;
        await this.pool.query(
          `UPDATE outbox
              SET last_error = $2,
                  dead_lettered_at = CASE WHEN $3::boolean THEN now() ELSE dead_lettered_at END
            WHERE id = $1`,
          [row.id, message.slice(0, 2000), dead],
        );
        if (dead) {
          result.deadLettered += 1;
          this.log.error(`outbox ${row.id} (${row.event_type}) dead-lettered after ${row.attempts}: ${message}`);
        } else {
          result.failed += 1;
          this.log.warn(`outbox ${row.id} (${row.event_type}) attempt ${row.attempts} failed: ${message}`);
        }
      }
    }

    return result;
  }

  /**
   * Claims a batch: takes the rows and schedules their next attempt in
   * one statement, so a relay that dies immediately afterwards has
   * already arranged its own retry.
   */
  private async claim(batchSize: number): Promise<OutboxRow[]> {
    const handled = this.handledEventTypes();
    if (handled.length === 0) return [];

    const res = await this.pool.query<OutboxRow>(
      `WITH claimed AS (
         SELECT id, attempts
           FROM outbox
          WHERE dispatched_at IS NULL
            AND dead_lettered_at IS NULL
            AND next_attempt_at <= now()
            AND event_type = ANY($1::text[])
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT $2
       )
       UPDATE outbox o
          SET attempts = o.attempts + 1,
              next_attempt_at = now() + (LEAST(3600, 60 * POWER(2, GREATEST(0, o.attempts)))::int || ' seconds')::interval
         FROM claimed c
        WHERE o.id = c.id
        RETURNING o.id, o.aggregate_type, o.aggregate_id, o.event_type, o.payload, o.attempts`,
      [handled, batchSize],
    );
    return res.rows;
  }
}

export { MAX_ATTEMPTS, backoffSeconds };
