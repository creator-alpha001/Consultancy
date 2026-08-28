import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import {
  escrowNotFound,
  escrowNotFreezable,
  escrowNotRefundable,
  escrowNotReleasable,
  escrowSplitOutOfRange,
  paymentCaptureFailed,
} from './errors';
import { LedgerAccountsService } from './ledger-accounts.service';
import { LedgerService } from './ledger.service';
import { FeeScheduleService } from './fee-schedule.service';
import { OutboxService } from './outbox.service';
import { PAYMENT_AGGREGATOR, PaymentAggregator } from './pa/payment-aggregator.interface';
import { EscrowRow } from './types';

export interface HoldEscrowInput {
  engagementId: string;
  seekerId: string;
  providerId: string;
  currency: string;
  amountPaise: bigint;
  idempotencyKey: string;
}

export interface ReleaseEscrowInput {
  escrowId: string;
  idempotencyKey: string;
  bankAccountLast4?: string;
  bankIfsc?: string;
}

export interface RefundEscrowInput {
  escrowId: string;
  idempotencyKey: string;
  reason: string;
}

export interface SettleSplitInput {
  escrowId: string;
  idempotencyKey: string;
  /** Strictly inside (0, escrow amount) — a full award either way is a release or a refund, and must be recorded as one. */
  seekerRefundPaise: bigint;
  /** The ruling this carries out. Recorded on the refund row so a split is never mistaken for an ordinary refund. */
  reason: string;
  bankAccountLast4?: string;
  bankIfsc?: string;
}

export interface PlatformFailureInput {
  escrowId: string;
  idempotencyKey: string;
  /** What broke on our side — recorded for the evidence packet, never shown as blame to either party. */
  failureDetail: string;
  bankAccountLast4?: string;
  bankIfsc?: string;
}

interface EscrowDbRow {
  id: string;
  engagement_id: string;
  seeker_id: string;
  provider_id: string;
  currency: string;
  amount_paise: bigint;
  fee_schedule_id: string | null;
  platform_fee_paise: bigint | null;
  status: EscrowRow['status'];
  hold_transaction_id: string | null;
  resolution_transaction_id: string | null;
}

function mapEscrowRow(row: EscrowDbRow): EscrowRow {
  return {
    id: row.id,
    engagementId: row.engagement_id,
    seekerId: row.seeker_id,
    providerId: row.provider_id,
    currency: row.currency,
    amountPaise: row.amount_paise,
    feeScheduleId: row.fee_schedule_id,
    platformFeePaise: row.platform_fee_paise,
    status: row.status,
    holdTransactionId: row.hold_transaction_id,
    resolutionTransactionId: row.resolution_transaction_id,
  };
}

/**
 * Award (hold) and release/refund, per CLAUDE.md hard rule #12: no
 * engagement enters a working state without escrow held AND agenda
 * locked. This module only owns the escrow half — agenda locking is
 * M3's `agenda/` module; the two preconditions are combined where the
 * engagement lifecycle actually enforces the transition, not here.
 *
 * Every external payment-aggregator call happens outside a DB
 * transaction (hard rule #9); every DB write it depends on happens
 * inside one, guarded by row locks so a retry is safe.
 */
@Injectable()
export class EscrowService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(LedgerService) private readonly ledger: LedgerService,
    @Inject(LedgerAccountsService) private readonly ledgerAccounts: LedgerAccountsService,
    @Inject(FeeScheduleService) private readonly feeSchedule: FeeScheduleService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(PAYMENT_AGGREGATOR) private readonly paymentAggregator: PaymentAggregator,
  ) {}

  /**
   * Read-only lookup for other modules — e.g. engagements/ needs an
   * escrow id to release, but must never query `escrows` directly
   * (CLAUDE.md — only money/ writes ledger, escrow, payout and refund tables).
   */
  async findByEngagementId(engagementId: string): Promise<EscrowRow | null> {
    const res = await this.pool.query<EscrowDbRow>(`SELECT * FROM escrows WHERE engagement_id = $1`, [engagementId]);
    return res.rows[0] ? mapEscrowRow(res.rows[0]) : null;
  }

  async hold(input: HoldEscrowInput): Promise<EscrowRow> {
    let escrowId: string;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<EscrowDbRow>(
        `SELECT * FROM escrows WHERE engagement_id = $1`,
        [input.engagementId],
      );
      if (existing.rows[0]) {
        escrowId = existing.rows[0].id;
        if (existing.rows[0].status !== 'pending') {
          await client.query('COMMIT');
          return mapEscrowRow(existing.rows[0]); // already held or resolved — idempotent no-op
        }
      } else {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO escrows (engagement_id, seeker_id, provider_id, currency, amount_paise)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [input.engagementId, input.seekerId, input.providerId, input.currency, input.amountPaise.toString()],
        );
        escrowId = inserted.rows[0].id;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Outside any DB transaction — this may be a real network call in
    // production against the licensed aggregator's sandbox.
    const capture = await this.paymentAggregator.captureOrder({
      amountPaise: input.amountPaise,
      currency: input.currency,
      seekerId: input.seekerId,
      idempotencyKey: input.idempotencyKey,
    });
    if (capture.status !== 'succeeded') {
      throw paymentCaptureFailed(escrowId);
    }

    const client2 = await this.pool.connect();
    try {
      await client2.query('BEGIN');

      const fee = await this.feeSchedule.getCurrent(client2, input.currency);
      const platformFeePaise = (input.amountPaise * BigInt(fee.platformFeeBps)) / 10000n;

      const paAccountId = await this.ledgerAccounts.getOrCreate(client2, {
        type: 'payment_aggregator',
        ownerUserId: null,
        currency: input.currency,
      });
      const escrowAccountId = await this.ledgerAccounts.getOrCreate(client2, {
        type: 'escrow',
        ownerUserId: null,
        currency: input.currency,
      });

      const ledgerResult = await this.ledger.postTransaction(client2, {
        idempotencyKey: input.idempotencyKey,
        reason: 'escrow_hold',
        referenceType: 'escrow',
        referenceId: escrowId,
        entries: [
          { accountId: paAccountId, currency: input.currency, amountPaise: -input.amountPaise },
          { accountId: escrowAccountId, currency: input.currency, amountPaise: input.amountPaise },
        ],
      });

      const updated = await client2.query<EscrowDbRow>(
        `UPDATE escrows
            SET status = 'held', fee_schedule_id = $2, platform_fee_paise = $3, hold_transaction_id = $4
          WHERE id = $1 AND status = 'pending'
          RETURNING *`,
        [escrowId, fee.id, platformFeePaise.toString(), ledgerResult.transactionId],
      );

      let row = updated.rows[0];
      if (!row) {
        const current = await client2.query<EscrowDbRow>(`SELECT * FROM escrows WHERE id = $1`, [escrowId]);
        row = current.rows[0];
      } else {
        await this.outbox.append(client2, {
          aggregateType: 'escrow',
          aggregateId: escrowId,
          eventType: 'escrow.held',
          payload: {
            engagementId: input.engagementId,
            amountPaise: input.amountPaise,
            paReference: capture.paReference,
          },
        });
      }

      await client2.query('COMMIT');
      return mapEscrowRow(row);
    } catch (err) {
      await client2.query('ROLLBACK');
      throw err;
    } finally {
      client2.release();
    }
  }

  async release(input: ReleaseEscrowInput): Promise<EscrowRow> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query<EscrowDbRow>(`SELECT * FROM escrows WHERE id = $1 FOR UPDATE`, [input.escrowId]);
      const escrow = res.rows[0];
      if (!escrow) throw escrowNotFound(input.escrowId);

      if (escrow.status === 'released') {
        await client.query('COMMIT');
        return mapEscrowRow(escrow); // idempotent no-op
      }
      if (escrow.status !== 'held' && escrow.status !== 'disputed_hold') {
        throw escrowNotReleasable(escrow.id, escrow.status);
      }

      const amountPaise = BigInt(escrow.amount_paise);
      const platformFeePaise = BigInt(escrow.platform_fee_paise ?? 0n);
      const netPaise = amountPaise - platformFeePaise;

      const escrowAccountId = await this.ledgerAccounts.getOrCreate(client, {
        type: 'escrow',
        ownerUserId: null,
        currency: escrow.currency,
      });
      const providerAccountId = await this.ledgerAccounts.getOrCreate(client, {
        type: 'provider_wallet',
        ownerUserId: escrow.provider_id,
        currency: escrow.currency,
      });
      const feeAccountId = await this.ledgerAccounts.getOrCreate(client, {
        type: 'platform_fee_revenue',
        ownerUserId: null,
        currency: escrow.currency,
      });

      const ledgerResult = await this.ledger.postTransaction(client, {
        idempotencyKey: input.idempotencyKey,
        reason: 'escrow_release',
        referenceType: 'escrow',
        referenceId: escrow.id,
        entries: [
          { accountId: escrowAccountId, currency: escrow.currency, amountPaise: -amountPaise },
          { accountId: providerAccountId, currency: escrow.currency, amountPaise: netPaise },
          { accountId: feeAccountId, currency: escrow.currency, amountPaise: platformFeePaise },
        ],
      });

      const updated = await client.query<EscrowDbRow>(
        `UPDATE escrows SET status = 'released', resolution_transaction_id = $2 WHERE id = $1 RETURNING *`,
        [escrow.id, ledgerResult.transactionId],
      );

      await client.query(
        `INSERT INTO payouts (escrow_id, provider_id, currency, amount_paise, release_transaction_id, pa_provider, bank_account_last4, bank_ifsc)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (escrow_id) DO NOTHING`,
        [
          escrow.id,
          escrow.provider_id,
          escrow.currency,
          netPaise.toString(),
          ledgerResult.transactionId,
          this.paymentAggregator.code,
          input.bankAccountLast4 ?? null,
          input.bankIfsc ?? null,
        ],
      );

      // The relay (notifications/, later milestone) picks this up and
      // instructs the PA to actually transfer funds — never done inline
      // inside this transaction.
      await this.outbox.append(client, {
        aggregateType: 'escrow',
        aggregateId: escrow.id,
        eventType: 'payout.initiated',
        payload: { providerId: escrow.provider_id, amountPaise: netPaise, currency: escrow.currency },
      });

      await client.query('COMMIT');
      return mapEscrowRow(updated.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async refund(input: RefundEscrowInput): Promise<EscrowRow> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query<EscrowDbRow>(`SELECT * FROM escrows WHERE id = $1 FOR UPDATE`, [input.escrowId]);
      const escrow = res.rows[0];
      if (!escrow) throw escrowNotFound(input.escrowId);

      if (escrow.status === 'refunded') {
        await client.query('COMMIT');
        return mapEscrowRow(escrow); // idempotent no-op
      }
      if (escrow.status !== 'held' && escrow.status !== 'disputed_hold') {
        throw escrowNotRefundable(escrow.id, escrow.status);
      }

      const amountPaise = BigInt(escrow.amount_paise);

      const escrowAccountId = await this.ledgerAccounts.getOrCreate(client, {
        type: 'escrow',
        ownerUserId: null,
        currency: escrow.currency,
      });
      const paAccountId = await this.ledgerAccounts.getOrCreate(client, {
        type: 'payment_aggregator',
        ownerUserId: null,
        currency: escrow.currency,
      });

      const ledgerResult = await this.ledger.postTransaction(client, {
        idempotencyKey: input.idempotencyKey,
        reason: 'escrow_refund',
        referenceType: 'escrow',
        referenceId: escrow.id,
        entries: [
          { accountId: escrowAccountId, currency: escrow.currency, amountPaise: -amountPaise },
          { accountId: paAccountId, currency: escrow.currency, amountPaise: amountPaise },
        ],
      });

      const updated = await client.query<EscrowDbRow>(
        `UPDATE escrows SET status = 'refunded', resolution_transaction_id = $2 WHERE id = $1 RETURNING *`,
        [escrow.id, ledgerResult.transactionId],
      );

      await client.query(
        `INSERT INTO refunds (escrow_id, seeker_id, currency, amount_paise, reason, refund_transaction_id, pa_provider)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (escrow_id) DO NOTHING`,
        [escrow.id, escrow.seeker_id, escrow.currency, amountPaise.toString(), input.reason, ledgerResult.transactionId, this.paymentAggregator.code],
      );

      await this.outbox.append(client, {
        aggregateType: 'escrow',
        aggregateId: escrow.id,
        eventType: 'refund.initiated',
        payload: { seekerId: escrow.seeker_id, amountPaise, currency: escrow.currency, reason: input.reason },
      });

      await client.query('COMMIT');
      return mapEscrowRow(updated.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * CLAUDE.md #23: "Never penalise a provider for a platform-side
   * failure. Refund the seeker and pay the provider from reserve."
   *
   * So this is deliberately NOT `refund()` with a different reason — the
   * postings differ. The seeker is made whole out of escrow, the provider
   * is paid what they would have earned out of `reserve`, and the
   * platform takes **no fee**: we failed, we do not bill for it. All four
   * entries are one balanced transaction, so a crash can never refund the
   * seeker without also paying the provider.
   *
   * The reserve account is expected to run negative — that is what a
   * reserve is. Monitoring and top-up are an ops concern (M9); nothing
   * here blocks on its balance, because refusing to make a wronged
   * provider whole would be the worse failure.
   */
  /**
   * Freezes a held escrow while a dispute is adjudicated. No ledger
   * movement — the money stays exactly where it is; only its status
   * changes, so neither `release()` nor `refund()` can be called
   * casually while a ruling is pending. Both still accept
   * `disputed_hold`, because carrying out a ruling is precisely what
   * they are for.
   *
   * Idempotent: freezing an already-frozen escrow is a no-op, so a
   * retried dispute-raise cannot fail on the money leg.
   */
  async freezeForDispute(escrowId: string): Promise<EscrowRow> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query<EscrowDbRow>(`SELECT * FROM escrows WHERE id = $1 FOR UPDATE`, [escrowId]);
      const escrow = res.rows[0];
      if (!escrow) throw escrowNotFound(escrowId);

      if (escrow.status === 'disputed_hold') {
        await client.query('COMMIT');
        return mapEscrowRow(escrow); // idempotent no-op
      }
      if (escrow.status !== 'held') {
        throw escrowNotFreezable(escrow.id, escrow.status);
      }

      const updated = await client.query<EscrowDbRow>(
        `UPDATE escrows SET status = 'disputed_hold' WHERE id = $1 RETURNING *`,
        [escrow.id],
      );
      await client.query('COMMIT');
      return mapEscrowRow(updated.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Carries out a partial dispute ruling: part of the escrow goes back
   * to the seeker, the rest to the provider.
   *
   * The platform fee is charged **pro rata on the portion the provider
   * actually earned**, never on the whole engagement — billing a full
   * fee on half-delivered work would take the platform's cut out of the
   * seeker's refund. `providerNet = providerGross - fee` by construction,
   * so the four entries balance exactly with no rounding remainder to
   * lose: integer division truncates the fee downward, and the
   * difference stays with the provider rather than evaporating.
   *
   * Reachable only from `disputed_hold` (enforced by the escrow
   * transition trigger, 0024): there is no such thing as partially
   * settling an engagement nobody disputed.
   */
  async settleSplit(input: SettleSplitInput): Promise<EscrowRow> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query<EscrowDbRow>(`SELECT * FROM escrows WHERE id = $1 FOR UPDATE`, [input.escrowId]);
      const escrow = res.rows[0];
      if (!escrow) throw escrowNotFound(input.escrowId);

      if (escrow.status === 'settled_split') {
        await client.query('COMMIT');
        return mapEscrowRow(escrow); // idempotent no-op
      }
      if (escrow.status !== 'disputed_hold') {
        throw escrowNotReleasable(escrow.id, escrow.status);
      }

      const amountPaise = BigInt(escrow.amount_paise);
      const seekerRefundPaise = input.seekerRefundPaise;
      if (seekerRefundPaise <= 0n || seekerRefundPaise >= amountPaise) {
        throw escrowSplitOutOfRange(escrow.id, seekerRefundPaise, amountPaise);
      }

      const fullFeePaise = BigInt(escrow.platform_fee_paise ?? 0n);
      const providerGrossPaise = amountPaise - seekerRefundPaise;
      // Pro-rata fee on the earned portion only. bigint division truncates,
      // which rounds the fee in the provider's favour — deliberate.
      const feePaise = (fullFeePaise * providerGrossPaise) / amountPaise;
      const providerNetPaise = providerGrossPaise - feePaise;

      const escrowAccountId = await this.ledgerAccounts.getOrCreate(client, {
        type: 'escrow',
        ownerUserId: null,
        currency: escrow.currency,
      });
      const paAccountId = await this.ledgerAccounts.getOrCreate(client, {
        type: 'payment_aggregator',
        ownerUserId: null,
        currency: escrow.currency,
      });
      const providerAccountId = await this.ledgerAccounts.getOrCreate(client, {
        type: 'provider_wallet',
        ownerUserId: escrow.provider_id,
        currency: escrow.currency,
      });
      const feeAccountId = await this.ledgerAccounts.getOrCreate(client, {
        type: 'platform_fee_revenue',
        ownerUserId: null,
        currency: escrow.currency,
      });

      const ledgerResult = await this.ledger.postTransaction(client, {
        idempotencyKey: input.idempotencyKey,
        reason: 'escrow_split_settlement',
        referenceType: 'escrow',
        referenceId: escrow.id,
        entries: [
          { accountId: escrowAccountId, currency: escrow.currency, amountPaise: -amountPaise },
          { accountId: paAccountId, currency: escrow.currency, amountPaise: seekerRefundPaise },
          { accountId: providerAccountId, currency: escrow.currency, amountPaise: providerNetPaise },
          { accountId: feeAccountId, currency: escrow.currency, amountPaise: feePaise },
        ],
      });

      const updated = await client.query<EscrowDbRow>(
        `UPDATE escrows SET status = 'settled_split', resolution_transaction_id = $2 WHERE id = $1 RETURNING *`,
        [escrow.id, ledgerResult.transactionId],
      );

      await client.query(
        `INSERT INTO refunds (escrow_id, seeker_id, currency, amount_paise, reason, refund_transaction_id, pa_provider)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (escrow_id) DO NOTHING`,
        [
          escrow.id,
          escrow.seeker_id,
          escrow.currency,
          seekerRefundPaise.toString(),
          input.reason,
          ledgerResult.transactionId,
          this.paymentAggregator.code,
        ],
      );
      await client.query(
        `INSERT INTO payouts (escrow_id, provider_id, currency, amount_paise, release_transaction_id, pa_provider, bank_account_last4, bank_ifsc)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (escrow_id) DO NOTHING`,
        [
          escrow.id,
          escrow.provider_id,
          escrow.currency,
          providerNetPaise.toString(),
          ledgerResult.transactionId,
          this.paymentAggregator.code,
          input.bankAccountLast4 ?? null,
          input.bankIfsc ?? null,
        ],
      );

      await this.outbox.append(client, {
        aggregateType: 'escrow',
        aggregateId: escrow.id,
        eventType: 'refund.initiated',
        payload: {
          seekerId: escrow.seeker_id,
          amountPaise: seekerRefundPaise,
          currency: escrow.currency,
          reason: input.reason,
        },
      });
      await this.outbox.append(client, {
        aggregateType: 'escrow',
        aggregateId: escrow.id,
        eventType: 'payout.initiated',
        payload: {
          providerId: escrow.provider_id,
          amountPaise: providerNetPaise,
          currency: escrow.currency,
        },
      });

      await client.query('COMMIT');
      return mapEscrowRow(updated.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async resolvePlatformFailure(input: PlatformFailureInput): Promise<EscrowRow> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query<EscrowDbRow>(`SELECT * FROM escrows WHERE id = $1 FOR UPDATE`, [input.escrowId]);
      const escrow = res.rows[0];
      if (!escrow) throw escrowNotFound(input.escrowId);

      if (escrow.status === 'refunded') {
        await client.query('COMMIT');
        return mapEscrowRow(escrow); // idempotent no-op
      }
      if (escrow.status !== 'held' && escrow.status !== 'disputed_hold') {
        throw escrowNotRefundable(escrow.id, escrow.status);
      }

      const amountPaise = BigInt(escrow.amount_paise);
      const platformFeePaise = BigInt(escrow.platform_fee_paise ?? 0n);
      // What the provider would have taken home had the platform not failed.
      const providerDuePaise = amountPaise - platformFeePaise;

      const escrowAccountId = await this.ledgerAccounts.getOrCreate(client, {
        type: 'escrow',
        ownerUserId: null,
        currency: escrow.currency,
      });
      const paAccountId = await this.ledgerAccounts.getOrCreate(client, {
        type: 'payment_aggregator',
        ownerUserId: null,
        currency: escrow.currency,
      });
      const reserveAccountId = await this.ledgerAccounts.getOrCreate(client, {
        type: 'reserve',
        ownerUserId: null,
        currency: escrow.currency,
      });
      const providerAccountId = await this.ledgerAccounts.getOrCreate(client, {
        type: 'provider_wallet',
        ownerUserId: escrow.provider_id,
        currency: escrow.currency,
      });

      const ledgerResult = await this.ledger.postTransaction(client, {
        idempotencyKey: input.idempotencyKey,
        reason: 'platform_failure_resolution',
        referenceType: 'escrow',
        referenceId: escrow.id,
        entries: [
          // Seeker made whole, in full — no fee retained.
          { accountId: escrowAccountId, currency: escrow.currency, amountPaise: -amountPaise },
          { accountId: paAccountId, currency: escrow.currency, amountPaise: amountPaise },
          // Provider paid what they were owed, funded by the platform.
          { accountId: reserveAccountId, currency: escrow.currency, amountPaise: -providerDuePaise },
          { accountId: providerAccountId, currency: escrow.currency, amountPaise: providerDuePaise },
        ],
      });

      const updated = await client.query<EscrowDbRow>(
        `UPDATE escrows SET status = 'refunded', resolution_transaction_id = $2 WHERE id = $1 RETURNING *`,
        [escrow.id, ledgerResult.transactionId],
      );

      await client.query(
        `INSERT INTO refunds (escrow_id, seeker_id, currency, amount_paise, reason, refund_transaction_id, pa_provider)
         VALUES ($1, $2, $3, $4, 'platform_failure', $5, $6)
         ON CONFLICT (escrow_id) DO NOTHING`,
        [escrow.id, escrow.seeker_id, escrow.currency, amountPaise.toString(), ledgerResult.transactionId, this.paymentAggregator.code],
      );

      await client.query(
        `INSERT INTO payouts (escrow_id, provider_id, currency, amount_paise, release_transaction_id, pa_provider, bank_account_last4, bank_ifsc)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (escrow_id) DO NOTHING`,
        [
          escrow.id,
          escrow.provider_id,
          escrow.currency,
          providerDuePaise.toString(),
          ledgerResult.transactionId,
          this.paymentAggregator.code,
          input.bankAccountLast4 ?? null,
          input.bankIfsc ?? null,
        ],
      );

      await this.outbox.append(client, {
        aggregateType: 'escrow',
        aggregateId: escrow.id,
        eventType: 'refund.initiated',
        payload: {
          seekerId: escrow.seeker_id,
          amountPaise,
          currency: escrow.currency,
          reason: 'platform_failure',
          failureDetail: input.failureDetail,
        },
      });
      await this.outbox.append(client, {
        aggregateType: 'escrow',
        aggregateId: escrow.id,
        eventType: 'payout.initiated',
        payload: {
          providerId: escrow.provider_id,
          amountPaise: providerDuePaise,
          currency: escrow.currency,
          fundedFrom: 'reserve',
        },
      });

      await client.query('COMMIT');
      return mapEscrowRow(updated.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
