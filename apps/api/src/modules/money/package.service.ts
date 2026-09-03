import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { AppError } from '../../common/errors/app-error';
import { PG_POOL } from '../../database/db.module';
import { LedgerAccountsService } from './ledger-accounts.service';
import { LedgerService } from './ledger.service';
import { PAYMENT_AGGREGATOR, PaymentAggregator } from './pa/payment-aggregator.interface';

export interface ProviderPackage {
  id: string;
  providerId: string;
  engagementType: string;
  skillId: string | null;
  title: string;
  sessionCount: number;
  amountPaise: string;
  /** Derived, never stored — see migration 0048. */
  perSessionPaise: string;
  currency: string;
  durationMinutes: number | null;
  turnaroundHours: number | null;
}

export interface PackagePurchase {
  id: string;
  packageId: string;
  title: string;
  seekerId: string;
  providerId: string;
  sessionsTotal: number;
  sessionsUsed: number;
  sessionsLeft: number;
  amountPaise: string;
  perSessionPaise: string;
  currency: string;
  engagementType: string;
  skillId: string | null;
  createdAt: Date;
}

/**
 * Buying several sessions at once.
 *
 * The money model is the whole design, and it is deliberately boring: a
 * purchase captures once into the seeker's `seeker_wallet`, and each
 * session drawn from it is an ORDINARY engagement whose escrow is funded
 * from that wallet instead of from a fresh card charge.
 *
 * What that buys is that nothing downstream has to know packages exist.
 * Agendas, assessment, disputes, payouts and reconciliation all see the
 * same engagements they always did. The alternative — one escrow released
 * a fifth at a time — would need partial release, and an escrow that can
 * be drained in pieces needs its remaining balance tracked somewhere
 * other than the ledger, which is how books stop agreeing with each other.
 */
@Injectable()
export class PackageService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(LedgerService) private readonly ledger: LedgerService,
    @Inject(LedgerAccountsService) private readonly ledgerAccounts: LedgerAccountsService,
    @Inject(PAYMENT_AGGREGATOR) private readonly paymentAggregator: PaymentAggregator,
  ) {}

  /** Per-session price, rounded DOWN so the parts never exceed the whole. */
  private perSession(amountPaise: string, sessionCount: number): string {
    return (BigInt(amountPaise) / BigInt(sessionCount)).toString();
  }

  async listForProvider(providerId: string): Promise<ProviderPackage[]> {
    const res = await this.pool.query<PackageDbRow>(
      `SELECT * FROM provider_packages WHERE provider_id = $1 AND active
        ORDER BY engagement_type, session_count`,
      [providerId],
    );
    return res.rows.map((r) => this.mapPackage(r));
  }

  async publish(input: {
    providerId: string;
    engagementType: string;
    skillId?: string | null;
    title: string;
    sessionCount: number;
    amountPaise: string;
    commitment?: number | null;
  }): Promise<ProviderPackage> {
    if (!Number.isInteger(input.sessionCount) || input.sessionCount < 2) {
      // One session is a service, not a package. Allowing it would give
      // two ways to sell the same thing at two different prices.
      throw new AppError('PACKAGE_INVALID', 'a package is two or more sessions', {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
    let amount: bigint;
    try {
      amount = BigInt(input.amountPaise);
    } catch {
      throw new AppError('PACKAGE_INVALID', 'that is not an amount', {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
    if (amount <= 0n) {
      throw new AppError('PACKAGE_INVALID', 'a package has to cost more than zero', {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }

    const live = input.engagementType === 'live_session';
    const res = await this.pool.query<PackageDbRow>(
      `INSERT INTO provider_packages
         (provider_id, engagement_type, skill_id, title, session_count, amount_paise,
          duration_minutes, turnaround_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.providerId,
        input.engagementType,
        input.skillId ?? null,
        input.title.trim(),
        input.sessionCount,
        amount.toString(),
        live ? input.commitment ?? null : null,
        live ? null : input.commitment ?? null,
      ],
    );
    return this.mapPackage(res.rows[0]);
  }

  async withdraw(providerId: string, packageId: string): Promise<void> {
    // Soft, so a purchase already made stays explicable.
    await this.pool.query(
      `UPDATE provider_packages SET active = false, updated_at = now()
        WHERE id = $1 AND provider_id = $2`,
      [packageId, providerId],
    );
  }

  /**
   * Buy a package.
   *
   * One capture, then one ledger transaction moving the money into the
   * seeker's wallet. Nothing is escrowed yet — escrow is per session and
   * happens when each is drawn, because escrow means "held against agreed
   * goals" and no goals have been agreed for session four.
   */
  async purchase(input: {
    packageId: string;
    seekerId: string;
    idempotencyKey: string;
  }): Promise<PackagePurchase> {
    const pkgRes = await this.pool.query<PackageDbRow>(
      `SELECT * FROM provider_packages WHERE id = $1 AND active`,
      [input.packageId],
    );
    const pkg = pkgRes.rows[0];
    if (!pkg) {
      throw new AppError('PACKAGE_NOT_FOUND', 'that package is no longer offered', {
        status: HttpStatus.NOT_FOUND,
      });
    }

    // Outside any transaction (#9).
    const capture = await this.paymentAggregator.captureOrder({
      amountPaise: BigInt(pkg.amount_paise),
      currency: pkg.currency,
      seekerId: input.seekerId,
      idempotencyKey: input.idempotencyKey,
    });
    if (capture.status !== 'succeeded') {
      throw new AppError('PACKAGE_PAYMENT_FAILED', 'that payment did not go through', {
        status: HttpStatus.PAYMENT_REQUIRED,
      });
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const paAccountId = await this.ledgerAccounts.getOrCreate(client, {
        type: 'payment_aggregator',
        ownerUserId: null,
        currency: pkg.currency,
      });
      const walletAccountId = await this.ledgerAccounts.getOrCreate(client, {
        type: 'seeker_wallet',
        ownerUserId: input.seekerId,
        currency: pkg.currency,
      });

      const ledgerResult = await this.ledger.postTransaction(client, {
        idempotencyKey: input.idempotencyKey,
        reason: 'package_purchase',
        referenceType: 'package',
        referenceId: input.packageId,
        entries: [
          { accountId: paAccountId, currency: pkg.currency, amountPaise: -BigInt(pkg.amount_paise) },
          { accountId: walletAccountId, currency: pkg.currency, amountPaise: BigInt(pkg.amount_paise) },
        ],
      });

      const purchase = await client.query<{ id: string; created_at: Date }>(
        `INSERT INTO package_purchases
           (package_id, seeker_id, provider_id, sessions_total, amount_paise, currency, capture_transaction_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, created_at`,
        [
          pkg.id,
          input.seekerId,
          pkg.provider_id,
          pkg.session_count,
          pkg.amount_paise,
          pkg.currency,
          ledgerResult.transactionId,
        ],
      );

      await client.query('COMMIT');

      return {
        id: purchase.rows[0].id,
        packageId: pkg.id,
        title: pkg.title,
        seekerId: input.seekerId,
        providerId: pkg.provider_id,
        sessionsTotal: pkg.session_count,
        sessionsUsed: 0,
        sessionsLeft: pkg.session_count,
        amountPaise: pkg.amount_paise,
        perSessionPaise: this.perSession(pkg.amount_paise, pkg.session_count),
        currency: pkg.currency,
        engagementType: pkg.engagement_type,
        skillId: pkg.skill_id,
        createdAt: purchase.rows[0].created_at,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * What a seeker has bought and how much of it is left.
   *
   * `sessionsUsed` is COUNTED from the draws, never stored. A cancelled
   * or refunded engagement gives the session back — the seeker paid for
   * five usable sessions, not five attempts — and a stored counter would
   * have to remember to decrement, which is the kind of thing that gets
   * forgotten exactly once.
   */
  async purchasesFor(seekerId: string): Promise<PackagePurchase[]> {
    const res = await this.pool.query<
      PackageDbRow & {
        purchase_id: string;
        sessions_total: number;
        purchase_amount_paise: string;
        purchase_currency: string;
        purchased_at: Date;
        sessions_used: string;
      }
    >(
      `SELECT p.*,
              pu.id AS purchase_id,
              pu.sessions_total,
              pu.amount_paise AS purchase_amount_paise,
              pu.currency AS purchase_currency,
              pu.created_at AS purchased_at,
              (SELECT count(*)
                 FROM package_draws d
                 JOIN engagements e ON e.id = d.engagement_id
                WHERE d.purchase_id = pu.id
                  AND e.status NOT IN ('cancelled', 'refunded'))::text AS sessions_used
         FROM package_purchases pu
         JOIN provider_packages p ON p.id = pu.package_id
        WHERE pu.seeker_id = $1
        ORDER BY pu.created_at DESC`,
      [seekerId],
    );

    return res.rows.map((r) => {
      const used = Number(r.sessions_used);
      return {
        id: r.purchase_id,
        packageId: r.id,
        title: r.title,
        seekerId,
        providerId: r.provider_id,
        sessionsTotal: r.sessions_total,
        sessionsUsed: used,
        sessionsLeft: r.sessions_total - used,
        amountPaise: r.purchase_amount_paise,
        perSessionPaise: this.perSession(r.purchase_amount_paise, r.sessions_total),
        currency: r.purchase_currency,
        engagementType: r.engagement_type,
        skillId: r.skill_id,
        createdAt: r.purchased_at,
      };
    });
  }

  async purchase_(purchaseId: string): Promise<PackagePurchase | null> {
    const all = await this.pool.query<{ seeker_id: string }>(
      `SELECT seeker_id FROM package_purchases WHERE id = $1`,
      [purchaseId],
    );
    if (!all.rows[0]) return null;
    const list = await this.purchasesFor(all.rows[0].seeker_id);
    return list.find((p) => p.id === purchaseId) ?? null;
  }

  /** Records that an engagement was drawn against a purchase. The trigger refuses an over-draw. */
  async recordDraw(purchaseId: string, engagementId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO package_draws (purchase_id, engagement_id) VALUES ($1, $2)`,
      [purchaseId, engagementId],
    );
  }

  private mapPackage(r: PackageDbRow): ProviderPackage {
    return {
      id: r.id,
      providerId: r.provider_id,
      engagementType: r.engagement_type,
      skillId: r.skill_id,
      title: r.title,
      sessionCount: r.session_count,
      amountPaise: r.amount_paise,
      perSessionPaise: this.perSession(r.amount_paise, r.session_count),
      currency: r.currency,
      durationMinutes: r.duration_minutes,
      turnaroundHours: r.turnaround_hours,
    };
  }
}

interface PackageDbRow {
  id: string;
  provider_id: string;
  engagement_type: string;
  skill_id: string | null;
  title: string;
  session_count: number;
  amount_paise: string;
  currency: string;
  duration_minutes: number | null;
  turnaround_hours: number | null;
}
