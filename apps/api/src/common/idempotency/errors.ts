import { HttpStatus } from '@nestjs/common';
import { AppError } from '../errors/app-error';

/**
 * Every failure the `Idempotency-Key` layer (CLAUDE.md #10) can return.
 *
 * These were previously bare `ConflictException`s, which the envelope
 * filter rendered as `code: "CONFLICT"` — the same code for two
 * situations a client must handle in opposite ways. On a money endpoint
 * that ambiguity is the whole game: "your request is still running, retry
 * this exact call shortly" and "you reused a key for a different body,
 * never retry this" cannot share a code.
 */
export const IdempotencyErrorCode = {
  /** No `Idempotency-Key` header on a mutating endpoint. Caller bug; not retryable as-is. */
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  /** Same key, different request body. Caller bug — retrying will never succeed. */
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  /** Another attempt with this key is running right now. Retryable, unchanged, shortly. */
  IDEMPOTENCY_REQUEST_IN_FLIGHT: 'IDEMPOTENCY_REQUEST_IN_FLIGHT',
  /** The actor could not be resolved, so the key cannot be scoped. Always a bug in our code. */
  IDEMPOTENCY_ACTOR_UNRESOLVED: 'IDEMPOTENCY_ACTOR_UNRESOLVED',
} as const;

export type IdempotencyErrorCode =
  (typeof IdempotencyErrorCode)[keyof typeof IdempotencyErrorCode];

export function idempotencyKeyRequired(): AppError {
  return new AppError(
    IdempotencyErrorCode.IDEMPOTENCY_KEY_REQUIRED,
    'Idempotency-Key header is required on this endpoint',
    { status: HttpStatus.BAD_REQUEST },
  );
}

export function idempotencyKeyReused(key: string): AppError {
  return new AppError(
    IdempotencyErrorCode.IDEMPOTENCY_KEY_REUSED,
    'this Idempotency-Key was already used for a different request body',
    { status: HttpStatus.CONFLICT, detail: { idempotencyKey: key } },
  );
}

export function idempotencyRequestInFlight(key: string): AppError {
  return new AppError(
    IdempotencyErrorCode.IDEMPOTENCY_REQUEST_IN_FLIGHT,
    'a request with this Idempotency-Key is already in flight',
    { status: HttpStatus.CONFLICT, detail: { idempotencyKey: key, retryable: true } },
  );
}

export function idempotencyActorUnresolved(): AppError {
  return new AppError(
    IdempotencyErrorCode.IDEMPOTENCY_ACTOR_UNRESOLVED,
    'actor could not be determined for this request',
    { status: HttpStatus.BAD_REQUEST },
  );
}
