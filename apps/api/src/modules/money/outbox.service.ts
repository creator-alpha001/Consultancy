import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';

function bigintSafe(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

export interface OutboxEvent {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

/**
 * Writes to `outbox` in the same DB transaction as the ledger postings
 * that caused the event (CLAUDE.md hard rule #9: never call an external
 * API inside a DB transaction). A relay — built in notifications/ in a
 * later milestone — polls dispatched_at IS NULL rows after commit and
 * makes the actual external call (e.g. instructing the PA to transfer
 * funds to a provider's bank account).
 */
@Injectable()
export class OutboxService {
  async append(client: PoolClient, event: OutboxEvent): Promise<void> {
    await client.query(
      `INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [event.aggregateType, event.aggregateId, event.eventType, JSON.stringify(event.payload, bigintSafe)],
    );
  }
}
