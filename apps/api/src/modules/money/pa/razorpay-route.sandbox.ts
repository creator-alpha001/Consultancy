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
 * Sandbox stand-in for Razorpay Route split settlement. Deterministic and
 * local — no network call, no real money. Every operation "succeeds" so
 * the money spine's happy path is exercisable in CI without live
 * aggregator credentials; failure-path behaviour (declines, PA-side
 * timeouts) is a later milestone once we integrate the real sandbox API.
 */
@Injectable()
export class RazorpayRouteSandbox implements PaymentAggregator {
  readonly code = 'razorpay_route' as const;

  async captureOrder(input: CaptureOrderInput): Promise<PaymentAggregatorResult> {
    return { paReference: `rzp_sandbox_capture_${input.idempotencyKey}`, status: 'succeeded' };
  }

  async transferToProvider(input: TransferToProviderInput): Promise<PaymentAggregatorResult> {
    return { paReference: `rzp_sandbox_transfer_${input.idempotencyKey}`, status: 'succeeded' };
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
      beneficiaryRef: `rzp_sandbox_beneficiary_${input.providerId}`,
      verification: 'verified',
      note: 'sandbox penny-drop: no real deposit was made',
    };
  }

  async refundToSeeker(input: RefundToSeekerInput): Promise<PaymentAggregatorResult> {
    return { paReference: `rzp_sandbox_refund_${input.idempotencyKey}`, status: 'succeeded' };
  }

  /**
   * Real HMAC verification against MONEY_PA_WEBHOOK_SECRET_RAZORPAY — see
   * webhook-signature.ts for why this one is not a stub.
   */
  verifyWebhookSignature(input: { rawBody: Buffer; signature: string | null }): boolean {
    return verifyHmacSignature({ ...input, secret: process.env.MONEY_PA_WEBHOOK_SECRET_RAZORPAY });
  }

  parseWebhookEvent(rawBody: Buffer): PaWebhookEvent | null {
    return parseSandboxWebhookEvent(rawBody);
  }
}
