import { Injectable } from '@nestjs/common';
import {
  CaptureOrderInput,
  PaWebhookEvent,
  PaymentAggregator,
  PaymentAggregatorResult,
  RefundToSeekerInput,
  TransferToProviderInput,
} from './payment-aggregator.interface';
import { parseSandboxWebhookEvent, verifyHmacSignature } from './webhook-signature';

/**
 * Sandbox stand-in for Cashfree Easy Split, mirroring
 * RazorpayRouteSandbox. Kept as a second implementation on purpose: it
 * is the acceptance test for the PaymentAggregator seam actually being
 * pluggable, not a Razorpay-shaped interface with one implementation.
 */
@Injectable()
export class CashfreeEasySplitSandbox implements PaymentAggregator {
  readonly code = 'cashfree_easy_split' as const;

  async captureOrder(input: CaptureOrderInput): Promise<PaymentAggregatorResult> {
    return { paReference: `cf_sandbox_capture_${input.idempotencyKey}`, status: 'succeeded' };
  }

  async transferToProvider(input: TransferToProviderInput): Promise<PaymentAggregatorResult> {
    return { paReference: `cf_sandbox_transfer_${input.idempotencyKey}`, status: 'succeeded' };
  }

  async refundToSeeker(input: RefundToSeekerInput): Promise<PaymentAggregatorResult> {
    return { paReference: `cf_sandbox_refund_${input.idempotencyKey}`, status: 'succeeded' };
  }

  /**
   * Real HMAC verification against MONEY_PA_WEBHOOK_SECRET_CASHFREE — see
   * webhook-signature.ts for why this one is not a stub.
   */
  verifyWebhookSignature(input: { rawBody: Buffer; signature: string | null }): boolean {
    return verifyHmacSignature({ ...input, secret: process.env.MONEY_PA_WEBHOOK_SECRET_CASHFREE });
  }

  parseWebhookEvent(rawBody: Buffer): PaWebhookEvent | null {
    return parseSandboxWebhookEvent(rawBody);
  }
}
