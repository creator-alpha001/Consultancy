import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';

export type ReconciliationSeverity = 'critical' | 'warning' | 'info';

export interface ReconciliationFinding {
  /** Stable code, switched on by alerting. Never parsed from the message. */
  code: string;
  severity: ReconciliationSeverity;
  /** Human-readable, for the ops console. */
  summary: string;
  /** The offending rows, capped — enough to investigate, not a data dump. */
  samples: Record<string, unknown>[];
  count: number;
}

export interface ReconciliationReport {
  ranAt: Date;
  ok: boolean;
  criticalCount: number;
  warningCount: number;
  findings: ReconciliationFinding[];
}

/** Never return an unbounded result set to an ops screen. */
const SAMPLE_LIMIT = 20;

/**
 * SPEC-PLATFORM.md §18, M9: "reconciliation."
 *
 * Every check here answers one question: **does the money in the
 * database still tell a consistent story?** The ledger's own triggers
 * make each individual transaction balance; nothing until now looked
 * across transactions for the shapes that mean something has gone wrong
 * anyway — a released escrow whose engagement never completed, a payout
 * that has sat at `initiated` for a week (TRACKER.md D4), a reserve
 * account quietly going deeper into the red (D7).
 *
 * Deliberately READ-ONLY. It reports; it never "fixes." An automated
 * correction to a money table is exactly the thing that turns a
 * detectable problem into an undetectable one, and CLAUDE.md is explicit
 * that corrections are reversing entries made by a human who understands
 * what happened.
 */
@Injectable()
export class ReconciliationService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async run(options: { staleAfterHours?: number } = {}): Promise<ReconciliationReport> {
    const staleHours = options.staleAfterHours ?? 24;

    const findings = (
      await Promise.all([
        this.ledgerBalancesToZero(),
        this.everyTransactionBalances(),
        this.escrowMatchesLedger(),
        this.stalePayouts(staleHours),
        this.staleRefunds(staleHours),
        this.negativeReserve(),
        this.escrowStatusVsEngagementStatus(),
        this.heldEscrowOnEndedEngagement(),
        this.unrelayedOutbox(staleHours),
        this.orphanedProviderBalances(),
        this.stuckIdempotencyKeys(staleHours),
      ])
    ).filter((f): f is ReconciliationFinding => f !== null);

    const criticalCount = findings.filter((f) => f.severity === 'critical').length;
    const warningCount = findings.filter((f) => f.severity === 'warning').length;

    return {
      ranAt: new Date(),
      ok: criticalCount === 0,
      criticalCount,
      warningCount,
      findings,
    };
  }

  private async check(
    code: string,
    severity: ReconciliationSeverity,
    summary: (count: number) => string,
    sql: string,
    params: unknown[] = [],
  ): Promise<ReconciliationFinding | null> {
    const res = await this.pool.query<Record<string, unknown>>(sql, params);
    if (res.rows.length === 0) return null;
    return {
      code,
      severity,
      summary: summary(res.rows.length),
      samples: res.rows.slice(0, SAMPLE_LIMIT),
      count: res.rows.length,
    };
  }

  /**
   * The single most important check in the system. Double-entry means
   * every currency's entries must sum to exactly zero across ALL
   * accounts; if this ever fails, money has been created or destroyed.
   */
  private ledgerBalancesToZero(): Promise<ReconciliationFinding | null> {
    return this.check(
      'LEDGER_DOES_NOT_SUM_TO_ZERO',
      'critical',
      (n) => `${n} currency/currencies where all ledger entries do not sum to zero — money was created or destroyed`,
      `SELECT currency, sum(amount_paise)::text AS total_paise
         FROM ledger_entries
        GROUP BY currency
       HAVING sum(amount_paise) <> 0`,
    );
  }

  /** Per-transaction balance, in case a deferred constraint was ever bypassed. */
  private everyTransactionBalances(): Promise<ReconciliationFinding | null> {
    return this.check(
      'TRANSACTION_DOES_NOT_BALANCE',
      'critical',
      (n) => `${n} ledger transaction(s) whose entries do not sum to zero per currency`,
      `SELECT transaction_id, currency, sum(amount_paise)::text AS total_paise
         FROM ledger_entries
        GROUP BY transaction_id, currency
       HAVING sum(amount_paise) <> 0`,
    );
  }

  /**
   * An escrow's recorded status must match what the ledger actually did.
   * A 'held' escrow with no hold transaction, or a resolved one with no
   * resolution transaction, means the two records have diverged.
   */
  private escrowMatchesLedger(): Promise<ReconciliationFinding | null> {
    return this.check(
      'ESCROW_LEDGER_MISMATCH',
      'critical',
      (n) => `${n} escrow(s) whose status does not match their ledger transactions`,
      `SELECT id, status, hold_transaction_id, resolution_transaction_id
         FROM escrows
        WHERE (status IN ('held', 'disputed_hold') AND hold_transaction_id IS NULL)
           OR (status IN ('released', 'refunded', 'settled_split')
               AND (hold_transaction_id IS NULL OR resolution_transaction_id IS NULL))`,
    );
  }

  /**
   * TRACKER.md D4 made visible: nothing transitions a payout off
   * `initiated`, so in our DB money looks paid when it has not moved.
   * Until the PA webhook handler exists, this is the check that stops
   * that being invisible.
   */
  private stalePayouts(hours: number): Promise<ReconciliationFinding | null> {
    return this.check(
      'PAYOUT_STUCK_INITIATED',
      'warning',
      (n) => `${n} payout(s) still 'initiated' after ${hours}h — no settlement confirmation has ever arrived (D4)`,
      `SELECT id, escrow_id, provider_id, amount_paise::text, created_at
         FROM payouts
        WHERE status = 'initiated' AND created_at < now() - ($1 || ' hours')::interval
        ORDER BY created_at`,
      [String(hours)],
    );
  }

  private staleRefunds(hours: number): Promise<ReconciliationFinding | null> {
    return this.check(
      'REFUND_STUCK_INITIATED',
      'warning',
      (n) => `${n} refund(s) still 'initiated' after ${hours}h — the seeker may not have their money (D4)`,
      `SELECT id, escrow_id, seeker_id, amount_paise::text, created_at
         FROM refunds
        WHERE status = 'initiated' AND created_at < now() - ($1 || ' hours')::interval
        ORDER BY created_at`,
      [String(hours)],
    );
  }

  /**
   * TRACKER.md D7. `reserve` is *expected* to run negative — that is
   * what a reserve is, and refusing to make a wronged provider whole
   * would be the worse failure. But nobody was watching how negative.
   */
  private negativeReserve(): Promise<ReconciliationFinding | null> {
    return this.check(
      'RESERVE_NEGATIVE',
      'warning',
      (n) => `reserve account is negative in ${n} currency/currencies — top-up needed (D7)`,
      `SELECT la.currency, b.balance_paise::text
         FROM ledger_accounts la
         JOIN ledger_account_balances b ON b.account_id = la.id AND b.currency = la.currency
        WHERE la.type = 'reserve' AND b.balance_paise < 0`,
    );
  }

  /** An engagement and its escrow disagreeing about whether work is finished. */
  private escrowStatusVsEngagementStatus(): Promise<ReconciliationFinding | null> {
    return this.check(
      'ESCROW_ENGAGEMENT_STATUS_DIVERGED',
      'critical',
      (n) => `${n} engagement(s) whose status contradicts their escrow's`,
      `SELECT e.id AS engagement_id, e.status AS engagement_status, es.status AS escrow_status
         FROM engagements e
         JOIN escrows es ON es.engagement_id = e.id
        WHERE (e.status = 'completed' AND es.status NOT IN ('released', 'settled_split'))
           OR (e.status = 'refunded' AND es.status <> 'refunded')
           OR (e.status = 'working' AND es.status NOT IN ('held', 'disputed_hold'))`,
    );
  }

  /** Money still held for an engagement that ended — nobody is going to get it. */
  private heldEscrowOnEndedEngagement(): Promise<ReconciliationFinding | null> {
    return this.check(
      'ESCROW_HELD_ON_ENDED_ENGAGEMENT',
      'critical',
      (n) => `${n} escrow(s) still holding money for an engagement that has already ended`,
      `SELECT es.id AS escrow_id, es.amount_paise::text, e.id AS engagement_id, e.status
         FROM escrows es
         JOIN engagements e ON e.id = es.engagement_id
        WHERE es.status IN ('held', 'disputed_hold')
          AND e.status IN ('completed', 'cancelled', 'refunded')`,
    );
  }

  /**
   * The outbox is written transactionally and, today, read by nothing
   * (see TRACKER.md). Every row here is an external effect — a payout
   * instruction, a notification — that never fired.
   */
  private unrelayedOutbox(hours: number): Promise<ReconciliationFinding | null> {
    return this.check(
      'OUTBOX_UNRELAYED',
      'warning',
      (n) => `${n} outbox event(s) older than ${hours}h have never been dispatched — no relay is running`,
      `SELECT id, aggregate_type, aggregate_id, event_type, created_at
         FROM outbox
        WHERE dispatched_at IS NULL AND created_at < now() - ($1 || ' hours')::interval
        ORDER BY created_at
        LIMIT 100`,
      [String(hours)],
    );
  }

  /**
   * A provider wallet holding a balance with no payout row to explain
   * it: money owed that nothing is arranging to send.
   */
  private orphanedProviderBalances(): Promise<ReconciliationFinding | null> {
    return this.check(
      'PROVIDER_BALANCE_WITHOUT_PAYOUT',
      'warning',
      (n) => `${n} provider wallet(s) hold a positive balance with no corresponding payout row`,
      `SELECT la.owner_user_id AS provider_id, la.currency, b.balance_paise::text
         FROM ledger_accounts la
         JOIN ledger_account_balances b ON b.account_id = la.id AND b.currency = la.currency
        WHERE la.type = 'provider_wallet'
          AND b.balance_paise > 0
          AND NOT EXISTS (
            SELECT 1 FROM payouts p WHERE p.provider_id = la.owner_user_id AND p.currency = la.currency
          )`,
    );
  }

  /**
   * An idempotency key stranded `in_flight`: the process died between
   * claiming it and recording an outcome, so nothing will ever complete
   * or fail it. Every retry of that request now gets
   * IDEMPOTENCY_REQUEST_IN_FLIGHT forever, which on a money endpoint
   * leaves the caller choosing between abandoning the request and
   * retrying under a NEW key — the thing that double-charges.
   *
   * Reported, never auto-released. Whether the original handler moved
   * money before it died is exactly what a human has to establish; a
   * timeout that flipped the row back to `failed` on its own would hand
   * a second caller permission to run the handler again on the strength
   * of a guess. See TRACKER.md D27.
   */
  private stuckIdempotencyKeys(hours: number): Promise<ReconciliationFinding | null> {
    return this.check(
      'IDEMPOTENCY_KEY_STUCK_IN_FLIGHT',
      'warning',
      (n) =>
        `${n} idempotency key(s) claimed over ${hours}h ago and never completed or failed — ` +
        `every retry of those requests is being refused (D27)`,
      `SELECT actor_id, key, endpoint, attempts, claimed_at
         FROM idempotency_keys
        WHERE state = 'in_flight' AND claimed_at < now() - ($1 || ' hours')::interval
        ORDER BY claimed_at
        LIMIT 100`,
      [String(hours)],
    );
  }
}
