import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../../database/db.module';
import {
  paWebhookMalformed,
  paWebhookSignatureInvalid,
  settlementAlreadyTerminal,
  settlementTargetNotFound,
} from './errors';
import { LedgerAccountsService } from './ledger-accounts.service';
import { LedgerService } from './ledger.service';
import { OutboxService } from './outbox.service';
import { PAYMENT_AGGREGATOR, PaWebhookEvent, PaymentAggregator } from './pa/payment-aggregator.interface';

export interface WebhookResult {
  /** false when this exact aggregator event had already been recorded. */
  applied: boolean;
  targetType: 'payout' | 'refund';
  targetId: string;
  outcome: 'settled' | 'failed';
}

interface PayoutDbRow {
  id: string;
  escrow_id: string;
  provider_id: string;
  currency: string;
  amount_paise: bigint;
  status: 'initiated' | 'settled' | 'failed';
}

interface RefundDbRow {
  id: string;
  escrow_id: string;
  seeker_id: string;
  currency: string;
  amount_paise: bigint;
  status: 'initiated' | 'settled' | 'failed';
}

/**
 * Closes TRACKER.md D4. Payout and refund rows used to be written as
 * `initiated` and stay there forever: our database said a provider had
 * been paid when nothing had ever confirmed it, and there was no way for
 * a failed transfer to become visible at all.
 *
 * A licensed aggregator confirms settlement asynchronously by webhook,
 * so this service is the inbound half of the money spine — the mirror of
 * `EscrowService`'s outbound calls. Two properties matter more than
 * anything else here:
 *
 *  - **The endpoint is authenticated by signature, not by session.** The
 *    caller is a machine, so `@Public()` is correct, and that makes the
 *    HMAC the ONLY thing standing between a stranger and a row that says
 *    money was delivered.
 *  - **A redelivery is not a second event.** Aggregators guarantee
 *    at-least-once, so duplicates are normal traffic, not an anomaly.
 *    Dedupe is by the aggregator's own event id, with the ledger's
 *    `idempotency_key` behind it as the second layer.
 */
@Injectable()
export class SettlementService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(LedgerService) private readonly ledger: LedgerService,
    @Inject(LedgerAccountsService) private readonly ledgerAccounts: LedgerAccountsService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(PAYMENT_AGGREGATOR) private readonly paymentAggregator: PaymentAggregator,
  ) {}

  async handleWebhook(input: { rawBody: Buffer; signature: string | null }): Promise<WebhookResult> {
    if (!this.paymentAggregator.verifyWebhookSignature(input)) {
      throw paWebhookSignatureInvalid();
    }

    const event = this.paymentAggregator.parseWebhookEvent(input.rawBody);
    if (!event) {
      throw paWebhookMalformed('not a settlement event, or a failure with no stated reason');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Recorded before it is acted on, so a webhook that crashes us
      // mid-apply is still evidence that it arrived.
      const recorded = await client.query<{ id: string }>(
        `INSERT INTO pa_webhook_events (pa_provider, pa_event_id, event_type, payload)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (pa_provider, pa_event_id) DO NOTHING
         RETURNING id`,
        [
          this.paymentAggregator.code,
          event.eventId,
          `${event.targetType}.${event.outcome}`,
          input.rawBody.toString('utf8'),
        ],
      );

      if (recorded.rows.length === 0) {
        // A redelivery of an event we already hold. Normal traffic.
        await client.query('COMMIT');
        return {
          applied: false,
          targetType: event.targetType,
          targetId: event.targetId,
          outcome: event.outcome,
        };
      }
      const webhookId = recorded.rows[0].id;

      if (event.targetType === 'payout') {
        await this.applyToPayout(client, event, webhookId);
      } else {
        await this.applyToRefund(client, event, webhookId);
      }

      await client.query(`UPDATE pa_webhook_events SET processed_at = now(), outcome = 'applied' WHERE id = $1`, [
        webhookId,
      ]);

      await client.query('COMMIT');
      return {
        applied: true,
        targetType: event.targetType,
        targetId: event.targetId,
        outcome: event.outcome,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * A settled payout is money that has left our books: `release()`
   * credited `provider_wallet` (what we owe them), and the transfer
   * discharges that liability through the aggregator.
   *
   * A FAILED payout posts nothing. The money never left
   * `provider_wallet`, so it is still owed and the ledger already says
   * so — inventing a reversal for a movement that never happened would
   * put two entries in the record describing nothing.
   */
  private async applyToPayout(client: PoolClient, event: PaWebhookEvent, webhookId: string): Promise<void> {
    const res = await client.query<PayoutDbRow>(`SELECT * FROM payouts WHERE id = $1 FOR UPDATE`, [event.targetId]);
    const payout = res.rows[0];
    if (!payout) throw settlementTargetNotFound('payout', event.targetId);
    if (payout.status !== 'initiated') {
      throw settlementAlreadyTerminal('payout', payout.id, payout.status, event.outcome);
    }

    if (event.outcome === 'failed') {
      await client.query(
        `UPDATE payouts
            SET status = 'failed', failed_at = now(), failure_reason = $2,
                pa_reference = COALESCE($3, pa_reference), settled_by_webhook_id = $4
          WHERE id = $1`,
        [payout.id, event.failureReason, event.paReference, webhookId],
      );
      await this.outbox.append(client, {
        aggregateType: 'payout',
        aggregateId: payout.id,
        eventType: 'payout.failed',
        payload: {
          providerId: payout.provider_id,
          amountPaise: BigInt(payout.amount_paise),
          currency: payout.currency,
          failureReason: event.failureReason,
        },
      });
      return;
    }

    const amountPaise = BigInt(payout.amount_paise);
    const providerAccountId = await this.ledgerAccounts.getOrCreate(client, {
      type: 'provider_wallet',
      ownerUserId: payout.provider_id,
      currency: payout.currency,
    });
    const paAccountId = await this.ledgerAccounts.getOrCreate(client, {
      type: 'payment_aggregator',
      ownerUserId: null,
      currency: payout.currency,
    });

    const ledgerResult = await this.ledger.postTransaction(client, {
      idempotencyKey: `payout-settled:${payout.id}`,
      reason: 'payout_settled',
      referenceType: 'payout',
      referenceId: payout.id,
      entries: [
        { accountId: providerAccountId, currency: payout.currency, amountPaise: -amountPaise },
        { accountId: paAccountId, currency: payout.currency, amountPaise },
      ],
    });

    await client.query(
      `UPDATE payouts
          SET status = 'settled', settled_at = now(), settlement_transaction_id = $2,
              pa_reference = COALESCE($3, pa_reference), settled_by_webhook_id = $4
        WHERE id = $1`,
      [payout.id, ledgerResult.transactionId, event.paReference, webhookId],
    );

    await this.outbox.append(client, {
      aggregateType: 'payout',
      aggregateId: payout.id,
      eventType: 'payout.settled',
      payload: { providerId: payout.provider_id, amountPaise, currency: payout.currency },
    });
  }

  /**
   * A settled refund posts nothing, and that asymmetry with payouts is
   * real rather than an oversight: `refund()` already posted
   * escrow -> payment_aggregator when it was initiated, so the ledger
   * has said "this money is on its way back to the seeker" since then.
   *
   * A FAILED refund is the case that needs a posting. The money is
   * stranded with the aggregator and still owed to the seeker, so it
   * moves to their `seeker_wallet` — an account that has existed since
   * 0003 for exactly this ("funds a seeker has paid in"). Leaving it in
   * `payment_aggregator` would hide a debt to a real person inside a
   * clearing account.
   */
  private async applyToRefund(client: PoolClient, event: PaWebhookEvent, webhookId: string): Promise<void> {
    const res = await client.query<RefundDbRow>(`SELECT * FROM refunds WHERE id = $1 FOR UPDATE`, [event.targetId]);
    const refund = res.rows[0];
    if (!refund) throw settlementTargetNotFound('refund', event.targetId);
    if (refund.status !== 'initiated') {
      throw settlementAlreadyTerminal('refund', refund.id, refund.status, event.outcome);
    }

    if (event.outcome === 'settled') {
      await client.query(
        `UPDATE refunds
            SET status = 'settled', settled_at = now(),
                pa_reference = COALESCE($2, pa_reference), settled_by_webhook_id = $3
          WHERE id = $1`,
        [refund.id, event.paReference, webhookId],
      );
      await this.outbox.append(client, {
        aggregateType: 'refund',
        aggregateId: refund.id,
        eventType: 'refund.settled',
        payload: {
          seekerId: refund.seeker_id,
          amountPaise: BigInt(refund.amount_paise),
          currency: refund.currency,
        },
      });
      return;
    }

    const amountPaise = BigInt(refund.amount_paise);
    const paAccountId = await this.ledgerAccounts.getOrCreate(client, {
      type: 'payment_aggregator',
      ownerUserId: null,
      currency: refund.currency,
    });
    const seekerAccountId = await this.ledgerAccounts.getOrCreate(client, {
      type: 'seeker_wallet',
      ownerUserId: refund.seeker_id,
      currency: refund.currency,
    });

    const ledgerResult = await this.ledger.postTransaction(client, {
      idempotencyKey: `refund-failed:${refund.id}`,
      reason: 'refund_failed',
      referenceType: 'refund',
      referenceId: refund.id,
      entries: [
        { accountId: paAccountId, currency: refund.currency, amountPaise: -amountPaise },
        { accountId: seekerAccountId, currency: refund.currency, amountPaise },
      ],
    });

    await client.query(
      `UPDATE refunds
          SET status = 'failed', failed_at = now(), failure_reason = $2,
              settlement_transaction_id = $3, pa_reference = COALESCE($4, pa_reference),
              settled_by_webhook_id = $5
        WHERE id = $1`,
      [refund.id, event.failureReason, ledgerResult.transactionId, event.paReference, webhookId],
    );

    await this.outbox.append(client, {
      aggregateType: 'refund',
      aggregateId: refund.id,
      eventType: 'refund.failed',
      payload: {
        seekerId: refund.seeker_id,
        amountPaise,
        currency: refund.currency,
        failureReason: event.failureReason,
      },
    });
  }
}
