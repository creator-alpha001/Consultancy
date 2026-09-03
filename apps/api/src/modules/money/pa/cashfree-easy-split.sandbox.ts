import { Injectable } from '@nestjs/common';
import {
  CaptureOrderInput,
  PaWebhookEvent,
  PaymentAggregator,
  PaymentAggregatorResult,
  RefundToSeekerInput,
  TransferToProviderInput,
  PayoutDestinationResult,
  RegisterPayoutDestinationInput
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


  /**
   * Sandbox penny-drop.
   *
   * Returns `verified` immediately, which a real aggregator does NOT —
   * a genuine penny-drop takes minutes to hours and can fail on a name
   * mismatch. The verification STATE is modelled honestly even though
   * this implementation always succeeds, so the code that reads it is
   * already written for the case where it does not.
   *
   * The account number is used to derive the last four and then dropped.
   * It is never returned, stored or logged here.
   */
  async registerPayoutDestination(input: RegisterPayoutDestinationInput): Promise<PayoutDestinationResult> {
    return {
      beneficiaryRef: `cf_sandbox_beneficiary_${input.providerId}`,
      verification: 'verified',
      note: 'sandbox penny-drop: no real deposit was made',
    };
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
