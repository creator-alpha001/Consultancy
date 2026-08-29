import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { PAYMENT_AGGREGATOR, PaymentAggregator } from './pa/payment-aggregator.interface';

/**
 * Instructing the aggregator to actually move money.
 *
 * This is the outbound half of settlement. `release()` credits a
 * provider's wallet in the ledger and writes `payout.initiated` to the
 * outbox; until this existed, nothing read that, so no transfer was ever
 * instructed and no settlement webhook could ever arrive. The books said
 * a provider was owed and nothing was arranging to pay them.
 *
 * It lives in money/ because only money/ writes to `payouts` and
 * `refunds` (CLAUDE.md module boundaries). The relay in notifications/
 * decides WHEN to call this; it never touches those tables itself.
 *
 * Every method here is safe to call twice with the same event. The relay
 * is at-least-once by construction — a process that dies after
 * instructing the aggregator but before recording the reference will try
 * again — so "already instructed" is normal traffic, not an error.
 */
@Injectable()
export class PayoutDispatchService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(PAYMENT_AGGREGATOR) private readonly pa: PaymentAggregator,
  ) {}

  /**
   * Instructs a transfer for the payout belonging to this escrow.
   *
   * The aggregator call happens OUTSIDE any transaction (hard rule #9),
   * and the reference is recorded afterwards in its own statement. The
   * ordering is deliberate: recording first would claim a transfer that
   * might never have been instructed, which is the one direction of
   * error that loses money silently.
   */
  async dispatchPayout(escrowId: string): Promise<'instructed' | 'already_instructed' | 'gone'> {
    const res = await this.pool.query<{
      id: string;
      provider_id: string;
      currency: string;
      amount_paise: string;
      bank_account_last4: string | null;
      bank_ifsc: string | null;
      pa_reference: string | null;
      status: string;
    }>(
      `SELECT id, provider_id, currency, amount_paise, bank_account_last4, bank_ifsc, pa_reference, status
         FROM payouts WHERE escrow_id = $1`,
      [escrowId],
    );
    const payout = res.rows[0];
    // No payout row means the release was rolled back after the event was
    // written, which cannot happen — they share a transaction — or the
    // row was removed by hand. Either way there is nothing to instruct.
    if (!payout) return 'gone';
    if (payout.pa_reference) return 'already_instructed';
    // Already settled or failed by a webhook that beat us here.
    if (payout.status !== 'initiated') return 'already_instructed';

    const result = await this.pa.transferToProvider({
      amountPaise: BigInt(payout.amount_paise),
      currency: payout.currency,
      providerId: payout.provider_id,
      bankAccountLast4: payout.bank_account_last4 ?? undefined,
      bankIfsc: payout.bank_ifsc ?? undefined,
      // Our payout id, so a retry after a lost response is recognised by
      // the aggregator as the same instruction rather than a second one.
      idempotencyKey: `payout:${payout.id}`,
    });

    if (result.status === 'failed') {
      throw new Error(`aggregator refused the transfer for payout ${payout.id}`);
    }

    // Conditional on the reference still being absent: if a concurrent
    // relay recorded one first, its value stands and this is a no-op
    // rather than an overwrite.
    await this.pool.query(
      `UPDATE payouts SET pa_reference = $2 WHERE id = $1 AND pa_reference IS NULL`,
      [payout.id, result.paReference],
    );
    return 'instructed';
  }

  /** The same shape for a refund. */
  async dispatchRefund(escrowId: string): Promise<'instructed' | 'already_instructed' | 'gone'> {
    const res = await this.pool.query<{
      id: string;
      seeker_id: string;
      currency: string;
      amount_paise: string;
      pa_reference: string | null;
      status: string;
    }>(
      `SELECT id, seeker_id, currency, amount_paise, pa_reference, status
         FROM refunds WHERE escrow_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [escrowId],
    );
    const refund = res.rows[0];
    if (!refund) return 'gone';
    if (refund.pa_reference) return 'already_instructed';
    if (refund.status !== 'initiated') return 'already_instructed';

    const result = await this.pa.refundToSeeker({
      amountPaise: BigInt(refund.amount_paise),
      currency: refund.currency,
      seekerId: refund.seeker_id,
      idempotencyKey: `refund:${refund.id}`,
    });

    if (result.status === 'failed') {
      throw new Error(`aggregator refused the refund ${refund.id}`);
    }

    await this.pool.query(
      `UPDATE refunds SET pa_reference = $2 WHERE id = $1 AND pa_reference IS NULL`,
      [refund.id, result.paReference],
    );
    return 'instructed';
  }
}
