export type LedgerAccountType =
  | 'seeker_wallet'
  | 'provider_wallet'
  | 'escrow'
  | 'platform_fee_revenue'
  | 'payment_aggregator'
  | 'payout_clearing'
  | 'reserve'
  | 'tax_payable';

export interface LedgerAccountKey {
  type: LedgerAccountType;
  /** null for platform-level accounts (fee revenue, PA mirror, reserve, tax) */
  ownerUserId: string | null;
  currency: string;
}

export interface LedgerEntryInput {
  accountId: string;
  currency: string;
  /** Signed: positive increases the account, negative decreases it. */
  amountPaise: bigint;
}

export interface PostTransactionInput {
  idempotencyKey: string;
  reason: string;
  referenceType?: string;
  referenceId?: string;
  entries: LedgerEntryInput[];
}

export interface PostTransactionResult {
  transactionId: string;
  /** true if this idempotency key had already been used — entries were not re-inserted */
  deduped: boolean;
}

export type EscrowStatus = 'pending' | 'held' | 'released' | 'refunded' | 'disputed_hold' | 'settled_split';

export interface EscrowRow {
  id: string;
  engagementId: string;
  seekerId: string;
  providerId: string;
  currency: string;
  amountPaise: bigint;
  feeScheduleId: string | null;
  platformFeePaise: bigint | null;
  status: EscrowStatus;
  holdTransactionId: string | null;
  resolutionTransactionId: string | null;
  /**
   * Null for the engagement's own escrow; set for a paid session
   * extension, which is charged as its own transaction so it can be
   * refunded on its own.
   */
  sessionExtensionId: string | null;
}

export interface FeeSchedule {
  id: string;
  currency: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  platformFeeBps: number;
}
