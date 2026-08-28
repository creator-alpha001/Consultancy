/**
 * The seam between the money module and a licensed payment aggregator
 * with split settlement (CLAUDE.md — Razorpay Route or Cashfree Easy
 * Split; never build settlement infrastructure ourselves). Escrow/payout
 * services call this OUTSIDE any DB transaction (hard rule #9), then
 * record the result inside one.
 *
 * The sandbox implementations here simulate the gateway's sandbox mode —
 * no network calls, no real money — so the money spine can be built and
 * tested end-to-end before a merchant account exists. Swapping in the
 * real SDK later means a new class behind this same interface, nothing
 * else in money/ changes.
 */
export type PaymentAggregatorCode = 'razorpay_route' | 'cashfree_easy_split';

export interface PaymentAggregatorResult {
  paReference: string;
  status: 'succeeded' | 'failed';
}

export interface CaptureOrderInput {
  amountPaise: bigint;
  currency: string;
  seekerId: string;
  idempotencyKey: string;
}

export interface TransferToProviderInput {
  amountPaise: bigint;
  currency: string;
  providerId: string;
  bankAccountLast4?: string;
  bankIfsc?: string;
  idempotencyKey: string;
}

export interface RefundToSeekerInput {
  amountPaise: bigint;
  currency: string;
  seekerId: string;
  idempotencyKey: string;
}

export const PAYMENT_AGGREGATOR = 'PAYMENT_AGGREGATOR';

/**
 * What a settlement webhook tells us, once the aggregator-specific
 * envelope has been unwrapped. Deliberately small: the four outcomes
 * that move a payout or refund off `initiated`, plus enough to find the
 * row they refer to.
 *
 * `eventId` is the AGGREGATOR's id for the delivery, not ours — it is
 * what makes an at-least-once redelivery detectable.
 */
export interface PaWebhookEvent {
  eventId: string;
  targetType: 'payout' | 'refund';
  /** Our own payouts.id / refunds.id, echoed back by the aggregator. */
  targetId: string;
  outcome: 'settled' | 'failed';
  /** The aggregator's transfer/settlement reference, recorded on the row. */
  paReference: string | null;
  /** Required when outcome is 'failed' — a failure nobody can explain is not investigable. */
  failureReason: string | null;
}

export interface PaymentAggregator {
  readonly code: PaymentAggregatorCode;
  captureOrder(input: CaptureOrderInput): Promise<PaymentAggregatorResult>;
  transferToProvider(input: TransferToProviderInput): Promise<PaymentAggregatorResult>;
  refundToSeeker(input: RefundToSeekerInput): Promise<PaymentAggregatorResult>;

  /**
   * Authenticates a webhook against the shared secret. The RAW body is
   * required, not the parsed object: re-serialising JSON does not
   * reproduce the bytes that were signed.
   *
   * Fails closed — no secret configured means no webhook is trusted.
   * An unauthenticated endpoint that flips payout statuses is a way to
   * make our books say money was delivered when it was not.
   */
  verifyWebhookSignature(input: { rawBody: Buffer; signature: string | null }): boolean;

  /** Returns null when the body is not a settlement event we act on. */
  parseWebhookEvent(rawBody: Buffer): PaWebhookEvent | null;
}
