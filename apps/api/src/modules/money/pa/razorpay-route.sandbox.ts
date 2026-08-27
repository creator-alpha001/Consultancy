import { Injectable } from '@nestjs/common';
import {
  CaptureOrderInput,
  PaymentAggregator,
  PaymentAggregatorResult,
  RefundToSeekerInput,
  TransferToProviderInput,
} from './payment-aggregator.interface';

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

  async refundToSeeker(input: RefundToSeekerInput): Promise<PaymentAggregatorResult> {
    return { paReference: `rzp_sandbox_refund_${input.idempotencyKey}`, status: 'succeeded' };
  }
}
