import { createHmac, timingSafeEqual } from 'crypto';
import { PaWebhookEvent } from './payment-aggregator.interface';

/**
 * Shared webhook mechanics for the sandbox aggregators. Unlike
 * `captureOrder` and friends — which are stubs that always succeed —
 * **this is real**: a real HMAC-SHA256 over the real bytes, compared in
 * constant time. There is nothing about signature verification that
 * benefits from being faked, and a sandbox that trusted every caller
 * would train the codebase to accept an endpoint that must not be
 * trusting. Razorpay and Cashfree both sign this way; swapping in the
 * live SDK changes the header name, not the scheme.
 */
export function verifyHmacSignature(input: {
  rawBody: Buffer;
  signature: string | null;
  secret: string | undefined;
}): boolean {
  // Fail closed. No secret configured is not "development convenience" —
  // it is an open endpoint that can mark money as delivered.
  if (!input.secret || !input.signature) return false;

  const expected = createHmac('sha256', input.secret).update(input.rawBody).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(input.signature, 'hex');
  } catch {
    return false;
  }
  // timingSafeEqual throws on a length mismatch, which would itself leak
  // the expected length through the error path.
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/** Test/ops helper: produce the signature a sandbox webhook must carry. */
export function signWebhookBody(rawBody: Buffer, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

interface RawWebhookBody {
  eventId?: unknown;
  targetType?: unknown;
  targetId?: unknown;
  outcome?: unknown;
  paReference?: unknown;
  failureReason?: unknown;
}

/**
 * Parses the sandbox envelope. Returns null rather than throwing for
 * anything we do not act on, so an aggregator sending us event types we
 * never subscribed to is a no-op rather than a 500 and a redelivery
 * storm.
 */
export function parseSandboxWebhookEvent(rawBody: Buffer): PaWebhookEvent | null {
  let parsed: RawWebhookBody;
  try {
    parsed = JSON.parse(rawBody.toString('utf8')) as RawWebhookBody;
  } catch {
    return null;
  }
  const { eventId, targetType, targetId, outcome } = parsed;

  if (typeof eventId !== 'string' || eventId.length === 0) return null;
  if (targetType !== 'payout' && targetType !== 'refund') return null;
  if (typeof targetId !== 'string' || targetId.length === 0) return null;
  if (outcome !== 'settled' && outcome !== 'failed') return null;

  const failureReason = typeof parsed.failureReason === 'string' ? parsed.failureReason : null;
  // A failure we cannot explain is not investigable, and a row recording
  // one would violate the DB's own CHECK anyway. Refuse it here, where
  // the error is legible, rather than at the constraint.
  if (outcome === 'failed' && failureReason === null) return null;

  return {
    eventId,
    targetType,
    targetId,
    outcome,
    paReference: typeof parsed.paReference === 'string' ? parsed.paReference : null,
    failureReason,
  };
}
