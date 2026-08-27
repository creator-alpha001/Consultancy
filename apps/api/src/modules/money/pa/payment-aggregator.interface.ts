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

export interface PaymentAggregator {
  readonly code: PaymentAggregatorCode;
  captureOrder(input: CaptureOrderInput): Promise<PaymentAggregatorResult>;
  transferToProvider(input: TransferToProviderInput): Promise<PaymentAggregatorResult>;
  refundToSeeker(input: RefundToSeekerInput): Promise<PaymentAggregatorResult>;
}

export const PAYMENT_AGGREGATOR = 'PAYMENT_AGGREGATOR';
