import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';

export interface EarningsSummary {
  currency: string;
  /** Money a seeker has paid in, on work not yet accepted. Not yours yet. */
  inEscrowPaise: string;
  /** Released and owed to you. Derived from the ledger, never a stored total. */
  owedPaise: string;
  /** Instructed to your bank and confirmed settled. */
  paidOutPaise: string;
  /** Instructed but not yet confirmed by the aggregator. */
  inTransitPaise: string;
  /** A transfer the aggregator refused. Someone has to look at these. */
  failedPaise: string;
  /** Platform fee already taken out of what you have been credited. */
  platformFeePaise: string;
}

export interface EarningsLine {
  payoutId: string | null;
  engagementId: string;
  amountPaise: string;
  currency: string;
  status: string;
  bankAccountLast4: string | null;
  createdAt: Date;
}

/**
 * What a provider has earned, is owed, and has been paid.
 *
 * Every figure is DERIVED. There is no balance column anywhere in this
 * platform (#7), so "owed" is the provider's wallet balance computed from
 * ledger entries, and the escrow and payout figures are sums over their
 * own tables. That is slower than reading a cached total and it is the
 * only version that cannot silently disagree with the books.
 *
 * The distinction the summary exists to draw is `inEscrow` versus `owed`.
 * A provider looking at a number wants to know whether it is theirs. Money
 * a seeker has paid in for work still in progress is neither theirs nor
 * the platform's — it is held, and it can still go back. Collapsing the
 * two into "earnings" would be the single most misleading thing this
 * screen could do.
 */
@Injectable()
export class EarningsService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async summary(providerId: string, currency = 'INR'): Promise<EarningsSummary> {
    const res = await this.pool.query<{
      in_escrow: string;
      owed: string;
      paid_out: string;
      in_transit: string;
      failed: string;
      platform_fee: string;
    }>(
      `SELECT
         COALESCE((
           SELECT sum(e.amount_paise) FROM escrows e
            WHERE e.provider_id = $1 AND e.currency = $2 AND e.status IN ('held', 'disputed_hold')
         ), 0)::text AS in_escrow,

         -- The wallet balance, from the ledger. This is the authoritative
         -- "what are we holding for this person" number.
         COALESCE((
           SELECT b.balance_paise
             FROM ledger_accounts la
             JOIN ledger_account_balances b ON b.account_id = la.id AND b.currency = la.currency
            WHERE la.type = 'provider_wallet' AND la.owner_user_id = $1 AND la.currency = $2
         ), 0)::text AS owed,

         COALESCE((
           SELECT sum(p.amount_paise) FROM payouts p
            WHERE p.provider_id = $1 AND p.currency = $2 AND p.status = 'settled'
         ), 0)::text AS paid_out,

         COALESCE((
           SELECT sum(p.amount_paise) FROM payouts p
            WHERE p.provider_id = $1 AND p.currency = $2 AND p.status = 'initiated'
         ), 0)::text AS in_transit,

         COALESCE((
           SELECT sum(p.amount_paise) FROM payouts p
            WHERE p.provider_id = $1 AND p.currency = $2 AND p.status = 'failed'
         ), 0)::text AS failed,

         COALESCE((
           SELECT sum(e.platform_fee_paise) FROM escrows e
            WHERE e.provider_id = $1 AND e.currency = $2 AND e.status IN ('released', 'settled_split')
         ), 0)::text AS platform_fee`,
      [providerId, currency],
    );

    const row = res.rows[0];
    return {
      currency,
      inEscrowPaise: row.in_escrow,
      owedPaise: row.owed,
      paidOutPaise: row.paid_out,
      inTransitPaise: row.in_transit,
      failedPaise: row.failed,
      platformFeePaise: row.platform_fee,
    };
  }

  /**
   * The individual movements, newest first.
   *
   * A summary without the lines behind it is a number a provider has to
   * take on trust, which is the opposite of what a transparent fee
   * breakdown is for (§13.5). Every row here names the engagement it came
   * from so it can be reconciled against work they remember doing.
   */

  /**
   * What a seeker has, has committed, and has spent.
   *
   * Packages made this necessary rather than merely nice: buying one puts
   * real money into `seeker_wallet`, and until now there was no screen
   * anywhere that admitted the balance existed. A person with unspent
   * credit and no way to see it will reasonably assume it is gone.
   *
   * Derived like everything else — there is no balance column (#7).
   */
  async seekerSummary(seekerId: string, currency = 'INR'): Promise<SeekerMoney> {
    const res = await this.pool.query<{
      wallet: string;
      in_escrow: string;
      spent: string;
      refunded: string;
    }>(
      `SELECT
         COALESCE((
           SELECT b.balance_paise
             FROM ledger_accounts la
             JOIN ledger_account_balances b ON b.account_id = la.id AND b.currency = la.currency
            WHERE la.type = 'seeker_wallet' AND la.owner_user_id = $1 AND la.currency = $2
         ), 0)::text AS wallet,

         COALESCE((
           SELECT sum(e.amount_paise) FROM escrows e
            WHERE e.seeker_id = $1 AND e.currency = $2 AND e.status IN ('held', 'disputed_hold')
         ), 0)::text AS in_escrow,

         -- What actually reached a provider. On a split (a discount, or a
         -- dispute) only the earned part counts as spent; the rest shows
         -- up under refunded below.
         COALESCE((
           SELECT sum(e.amount_paise) FROM escrows e
            WHERE e.seeker_id = $1 AND e.currency = $2 AND e.status = 'released'
         ), 0)::text AS spent,

         COALESCE((
           SELECT sum(r.amount_paise) FROM refunds r
            JOIN escrows e ON e.id = r.escrow_id
            WHERE e.seeker_id = $1 AND e.currency = $2
         ), 0)::text AS refunded`,
      [seekerId, currency],
    );
    const row = res.rows[0];
    return {
      currency,
      walletPaise: row.wallet,
      inEscrowPaise: row.in_escrow,
      spentPaise: row.spent,
      refundedPaise: row.refunded,
    };
  }

  /** Every engagement this seeker has put money behind, newest first. */
  async seekerLines(seekerId: string, limit = 50): Promise<SeekerMoneyLine[]> {
    const res = await this.pool.query<{
      engagement_id: string;
      engagement_type: string;
      amount_paise: string;
      currency: string;
      status: string;
      direction: 'out' | 'back';
      funded_from: string;
      created_at: Date;
    }>(
      // Money out AND money back, in one timeline.
      //
      // The escrow rows alone said what a seeker had paid and never what
      // had come back, so a cancelled engagement and a completed one
      // looked identical on the history — and a discount, which is the
      // thing a seeker most wants to see arrive, appeared nowhere at all.
      `(
         SELECT e.engagement_id,
                en.engagement_type,
                e.amount_paise::text AS amount_paise,
                e.currency,
                'out' AS direction,
                e.status::text AS status,
                e.funded_from,
                e.created_at
           FROM escrows e
           JOIN engagements en ON en.id = e.engagement_id
          WHERE e.seeker_id = $1
       )
       UNION ALL
       (
         SELECT e.engagement_id,
                en.engagement_type,
                r.amount_paise::text AS amount_paise,
                r.currency,
                'back' AS direction,
                -- The refund's own reason, so a discount reads as a
                -- discount rather than as "refunded" — which to a seeker
                -- suggests something went wrong.
                COALESCE(r.reason, r.status::text) AS status,
                e.funded_from,
                r.created_at
           FROM refunds r
           JOIN escrows e ON e.id = r.escrow_id
           JOIN engagements en ON en.id = e.engagement_id
          WHERE e.seeker_id = $1
       )
       ORDER BY created_at DESC
       LIMIT $2`,
      [seekerId, limit],
    );
    return res.rows.map((r) => ({
      engagementId: r.engagement_id,
      engagementType: r.engagement_type,
      amountPaise: r.amount_paise,
      currency: r.currency,
      direction: r.direction,
      amountLabel: r.amount_paise,
      currencyCode: r.currency,
      escrowStatus: r.status,
      fundedFrom: r.funded_from,
      createdAt: r.created_at,
    }));
  }

  async lines(providerId: string, limit = 50): Promise<EarningsLine[]> {
    const res = await this.pool.query<{
      payout_id: string | null;
      engagement_id: string;
      amount_paise: string;
      currency: string;
      status: string;
      bank_account_last4: string | null;
      created_at: Date;
    }>(
      `SELECT p.id AS payout_id,
              e.engagement_id,
              p.amount_paise::text,
              p.currency,
              p.status::text,
              p.bank_account_last4,
              p.created_at
         FROM payouts p
         JOIN escrows e ON e.id = p.escrow_id
        WHERE p.provider_id = $1
        ORDER BY p.created_at DESC
        LIMIT $2`,
      [providerId, limit],
    );
    return res.rows.map((r) => ({
      payoutId: r.payout_id,
      engagementId: r.engagement_id,
      amountPaise: r.amount_paise,
      currency: r.currency,
      status: r.status,
      bankAccountLast4: r.bank_account_last4,
      createdAt: r.created_at,
    }));
  }
}

export interface SeekerMoney {
  currency: string;
  /** Unspent package credit. Real money the seeker has already paid. */
  walletPaise: string;
  /** Committed to work in progress. Comes back if the work is cancelled. */
  inEscrowPaise: string;
  /** Paid out to providers on work this seeker accepted. */
  spentPaise: string;
  /** Returned — cancellations, refunds, and the discount half of a split. */
  refundedPaise: string;
}

export interface SeekerMoneyLine {
  engagementId: string;
  engagementType: string;
  amountPaise: string;
  currency: string;
  /**
   * Which way the money went. `out` is a payment into escrow; `back` is
   * money returned — a refund, or the seeker's half of a split.
   *
   * Kept as its own field rather than inferred from a negative amount,
   * because an amount that is sometimes negative is an amount every
   * reader has to remember to check the sign of.
   */
  direction: 'out' | 'back';
  amountLabel: string;
  currencyCode: string;
  escrowStatus: string;
  fundedFrom: string;
  createdAt: Date;
}
