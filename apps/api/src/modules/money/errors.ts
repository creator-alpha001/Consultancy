import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';

/**
 * Every error code the money module can return. `code` is the stable
 * contract clients switch on (CLAUDE.md — Errors); `message` is
 * human-readable and never parsed.
 *
 * A money path must never fail with an untyped Error: a caller that
 * cannot distinguish "this escrow was already refunded" from "the
 * server crashed" will retry a payment it should not retry. Anything
 * throwing out of this module goes through one of these.
 */
export const MoneyErrorCode = {
  /** No escrow with that id. */
  ESCROW_NOT_FOUND: 'ESCROW_NOT_FOUND',
  /** Escrow exists but its current status forbids release. Not retryable. */
  ESCROW_NOT_RELEASABLE: 'ESCROW_NOT_RELEASABLE',
  /** Escrow exists but its current status forbids refund. Not retryable. */
  ESCROW_NOT_REFUNDABLE: 'ESCROW_NOT_REFUNDABLE',
  /** No fee schedule covers this currency at this instant — a config gap, not caller error. */
  NO_FEE_SCHEDULE: 'NO_FEE_SCHEDULE',
  /** The payment aggregator declined or failed the capture. Retryable with the same Idempotency-Key. */
  PAYMENT_CAPTURE_FAILED: 'PAYMENT_CAPTURE_FAILED',
  /** A ledger transaction was assembled that could never balance. Always a bug in our code. */
  LEDGER_TRANSACTION_INVALID: 'LEDGER_TRANSACTION_INVALID',
  /** Lost an account-creation race and the row still wasn't there. Always a bug in our code. */
  LEDGER_ACCOUNT_UNRESOLVABLE: 'LEDGER_ACCOUNT_UNRESOLVABLE',
  /** Escrow exists but its status forbids freezing it for a dispute. Not retryable. */
  ESCROW_NOT_FREEZABLE: 'ESCROW_NOT_FREEZABLE',
  /** A split settlement was asked for that isn't strictly inside (0, escrow amount). Always a caller bug. */
  ESCROW_SPLIT_OUT_OF_RANGE: 'ESCROW_SPLIT_OUT_OF_RANGE',
  /** A webhook did not carry a valid signature for the configured aggregator. Never retryable. */
  PA_WEBHOOK_SIGNATURE_INVALID: 'PA_WEBHOOK_SIGNATURE_INVALID',
  /** Signature was valid but the body is not a settlement event we act on. */
  PA_WEBHOOK_MALFORMED: 'PA_WEBHOOK_MALFORMED',
  /** The webhook names a payout/refund that does not exist. Investigate; never guess at which row was meant. */
  SETTLEMENT_TARGET_NOT_FOUND: 'SETTLEMENT_TARGET_NOT_FOUND',
  /** The row already settled or failed, and the webhook says otherwise. Needs a human, not a redelivery. */
  SETTLEMENT_ALREADY_TERMINAL: 'SETTLEMENT_ALREADY_TERMINAL',
} as const;

export type MoneyErrorCode = (typeof MoneyErrorCode)[keyof typeof MoneyErrorCode];

export function escrowNotFound(escrowId: string): AppError {
  return new AppError(MoneyErrorCode.ESCROW_NOT_FOUND, `no escrow ${escrowId}`, {
    status: HttpStatus.NOT_FOUND,
    detail: { escrowId },
  });
}

export function escrowNotReleasable(escrowId: string, status: string): AppError {
  return new AppError(
    MoneyErrorCode.ESCROW_NOT_RELEASABLE,
    `cannot release escrow ${escrowId} from status ${status}`,
    { status: HttpStatus.CONFLICT, detail: { escrowId, escrowStatus: status } },
  );
}

export function escrowNotRefundable(escrowId: string, status: string): AppError {
  return new AppError(
    MoneyErrorCode.ESCROW_NOT_REFUNDABLE,
    `cannot refund escrow ${escrowId} from status ${status}`,
    { status: HttpStatus.CONFLICT, detail: { escrowId, escrowStatus: status } },
  );
}

export function escrowNotFreezable(escrowId: string, status: string): AppError {
  return new AppError(
    MoneyErrorCode.ESCROW_NOT_FREEZABLE,
    `cannot freeze escrow ${escrowId} for a dispute from status ${status}`,
    { status: HttpStatus.CONFLICT, detail: { escrowId, escrowStatus: status } },
  );
}

export function escrowSplitOutOfRange(escrowId: string, seekerRefundPaise: bigint, amountPaise: bigint): AppError {
  return new AppError(
    MoneyErrorCode.ESCROW_SPLIT_OUT_OF_RANGE,
    `split of ${seekerRefundPaise} is not strictly inside (0, ${amountPaise}) for escrow ${escrowId} — a full award is a release or a refund, not a split`,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      detail: {
        escrowId,
        seekerRefundPaise: seekerRefundPaise.toString(),
        amountPaise: amountPaise.toString(),
      },
    },
  );
}

export function noFeeSchedule(currency: string, at: Date): AppError {
  return new AppError(
    MoneyErrorCode.NO_FEE_SCHEDULE,
    `no fee schedule covers ${currency} at ${at.toISOString()}`,
    { status: HttpStatus.INTERNAL_SERVER_ERROR, detail: { currency, at: at.toISOString() } },
  );
}

export function paymentCaptureFailed(escrowId: string): AppError {
  return new AppError(
    MoneyErrorCode.PAYMENT_CAPTURE_FAILED,
    `payment aggregator capture failed for escrow ${escrowId}`,
    { status: HttpStatus.BAD_GATEWAY, detail: { escrowId } },
  );
}

export function ledgerTransactionInvalid(reason: string): AppError {
  return new AppError(MoneyErrorCode.LEDGER_TRANSACTION_INVALID, reason, {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
  });
}

export function ledgerAccountUnresolvable(description: string): AppError {
  return new AppError(
    MoneyErrorCode.LEDGER_ACCOUNT_UNRESOLVABLE,
    `ledger account ${description} not found after insert race`,
    { status: HttpStatus.INTERNAL_SERVER_ERROR },
  );
}

export function paWebhookSignatureInvalid(): AppError {
  return new AppError(
    MoneyErrorCode.PA_WEBHOOK_SIGNATURE_INVALID,
    'webhook signature could not be verified',
    { status: HttpStatus.UNAUTHORIZED },
  );
}

export function paWebhookMalformed(detail: string): AppError {
  return new AppError(MoneyErrorCode.PA_WEBHOOK_MALFORMED, `unusable webhook body: ${detail}`, {
    status: HttpStatus.BAD_REQUEST,
  });
}

export function settlementTargetNotFound(targetType: string, targetId: string): AppError {
  return new AppError(
    MoneyErrorCode.SETTLEMENT_TARGET_NOT_FOUND,
    `no ${targetType} ${targetId} to settle`,
    { status: HttpStatus.NOT_FOUND, detail: { targetType, targetId } },
  );
}

export function settlementAlreadyTerminal(
  targetType: string,
  targetId: string,
  status: string,
  attempted: string,
): AppError {
  return new AppError(
    MoneyErrorCode.SETTLEMENT_ALREADY_TERMINAL,
    `${targetType} ${targetId} is already ${status}; refusing to record ${attempted}`,
    { status: HttpStatus.CONFLICT, detail: { targetType, targetId, status, attempted } },
  );
}
