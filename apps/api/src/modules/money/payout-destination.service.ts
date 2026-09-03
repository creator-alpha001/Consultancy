import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { AppError } from '../../common/errors/app-error';
import { AuditService } from '../../common/audit/audit.service';
import { PG_POOL } from '../../database/db.module';
import { PAYMENT_AGGREGATOR, PaymentAggregator } from './pa/payment-aggregator.interface';

export interface PayoutDestination {
  accountHolderName: string;
  bankAccountLast4: string;
  bankIfsc: string;
  verifiedAt: Date | null;
  verificationNote: string | null;
  updatedAt: Date;
}

/**
 * Where a provider's money goes.
 *
 * This is the only place in the platform that ever handles a full bank
 * account number, and it does not keep it. The number arrives, is handed
 * to the licensed aggregator in exchange for a beneficiary token, and the
 * local variable holding it goes out of scope. What persists is the token,
 * the IFSC and the last four digits — CLAUDE.md #31.
 *
 * Nothing here logs the number. Not on success, not in an error path, not
 * "temporarily while debugging": a log line is a copy, and a copy in a log
 * is the copy that leaks.
 *
 * Why this exists at all: `payouts.bank_account_last4` and `bank_ifsc`
 * have been columns since the first money migration and have always been
 * NULL, because they were optional arguments to `complete()` and the only
 * caller is the seeker — who has no business knowing a provider's bank
 * details. Every payout ever written named no destination.
 */
@Injectable()
export class PayoutDestinationService {
  private readonly log = new Logger(PayoutDestinationService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(PAYMENT_AGGREGATOR) private readonly paymentAggregator: PaymentAggregator,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async get(providerId: string): Promise<PayoutDestination | null> {
    const res = await this.pool.query<{
      account_holder_name: string;
      bank_account_last4: string;
      bank_ifsc: string;
      verified_at: Date | null;
      verification_note: string | null;
      updated_at: Date;
    }>(
      `SELECT account_holder_name, bank_account_last4, bank_ifsc, verified_at, verification_note, updated_at
         FROM provider_payout_details WHERE provider_id = $1`,
      [providerId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      accountHolderName: row.account_holder_name,
      bankAccountLast4: row.bank_account_last4,
      bankIfsc: row.bank_ifsc,
      verifiedAt: row.verified_at,
      verificationNote: row.verification_note,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Register or replace a destination.
   *
   * The aggregator call happens OUTSIDE any transaction (#9) and BEFORE
   * anything is written: if the aggregator refuses the account, nothing
   * should have been stored, and a provider should not be left believing
   * a rejected account is on file.
   */
  async set(input: {
    providerId: string;
    accountHolderName: string;
    accountNumber: string;
    ifsc: string;
    ipPrefix?: string;
  }): Promise<PayoutDestination> {
    const accountNumber = input.accountNumber.replace(/\s/g, '');
    const ifsc = input.ifsc.trim().toUpperCase();
    const holder = input.accountHolderName.trim();

    if (!/^[0-9]{6,20}$/.test(accountNumber)) {
      throw new AppError('PAYOUT_ACCOUNT_INVALID', 'that does not look like an account number', {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      // The shape is fixed and public: four letters, a zero, six
      // alphanumerics. Checking it here turns a failed transfer weeks
      // later into a corrected typo now.
      throw new AppError('PAYOUT_IFSC_INVALID', 'that is not a valid IFSC code', {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
    if (!holder) {
      throw new AppError('PAYOUT_HOLDER_REQUIRED', 'the account holder name is required', {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }

    const registered = await this.paymentAggregator.registerPayoutDestination({
      providerId: input.providerId,
      accountHolderName: holder,
      accountNumber,
      ifsc,
    });

    if (registered.verification === 'failed') {
      throw new AppError(
        'PAYOUT_DESTINATION_REJECTED',
        registered.note ?? 'the bank could not confirm that account',
        { status: HttpStatus.UNPROCESSABLE_ENTITY },
      );
    }

    // Only the last four survive. `accountNumber` is not written anywhere
    // below and is not referenced again.
    const last4 = accountNumber.slice(-4);

    await this.pool.query(
      `INSERT INTO provider_payout_details
         (provider_id, account_holder_name, bank_account_last4, bank_ifsc,
          pa_provider, pa_beneficiary_ref, verified_at, verification_note, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (provider_id) DO UPDATE SET
         account_holder_name = EXCLUDED.account_holder_name,
         bank_account_last4  = EXCLUDED.bank_account_last4,
         bank_ifsc           = EXCLUDED.bank_ifsc,
         pa_provider         = EXCLUDED.pa_provider,
         pa_beneficiary_ref  = EXCLUDED.pa_beneficiary_ref,
         verified_at         = EXCLUDED.verified_at,
         verification_note   = EXCLUDED.verification_note,
         updated_at          = now()`,
      [
        input.providerId,
        holder,
        last4,
        ifsc,
        this.paymentAggregator.code,
        registered.beneficiaryRef,
        registered.verification === 'verified' ? new Date() : null,
        registered.note,
      ],
    );

    // Recorded with the last four only — an audit entry is a copy too.
    await this.audit.record({
      actorId: input.providerId,
      actorRole: 'provider',
      action: 'payout_destination.set',
      subjectType: 'user',
      subjectId: input.providerId,
      detail: { bankAccountLast4: last4, bankIfsc: ifsc, verification: registered.verification },
      ipPrefix: input.ipPrefix,
    });

    this.log.log(`payout destination set for provider ${input.providerId} (…${last4})`);

    const saved = await this.get(input.providerId);
    return saved!;
  }

  /**
   * What a transfer should be addressed to, read at release time.
   *
   * Returns nulls rather than throwing when there is no destination. A
   * release must not be blocked by a missing bank account: the money is
   * genuinely owed the moment the work is accepted, the ledger says so,
   * and the payout sits `initiated` until someone can send it. Refusing
   * the release instead would leave the seeker unable to close an
   * engagement because of a form the PROVIDER never filled in.
   */
  async forRelease(providerId: string): Promise<{ bankAccountLast4?: string; bankIfsc?: string }> {
    const destination = await this.get(providerId);
    if (!destination) return {};
    return { bankAccountLast4: destination.bankAccountLast4, bankIfsc: destination.bankIfsc };
  }
}
