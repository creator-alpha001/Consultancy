import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';

export const DisputeErrorCode = {
  DISPUTE_NOT_FOUND: 'DISPUTE_NOT_FOUND',
  DISPUTE_ALREADY_EXISTS: 'DISPUTE_ALREADY_EXISTS',
  DISPUTE_WRONG_STATUS: 'DISPUTE_WRONG_STATUS',
  DISPUTE_NOT_A_PARTY: 'DISPUTE_NOT_A_PARTY',
  RULING_NOT_FOUND: 'RULING_NOT_FOUND',
  RULING_SPLIT_AMOUNT_REQUIRED: 'RULING_SPLIT_AMOUNT_REQUIRED',
  APPEAL_TIER_IS_FINAL: 'APPEAL_TIER_IS_FINAL',
} as const;

export type DisputeErrorCode = (typeof DisputeErrorCode)[keyof typeof DisputeErrorCode];

export function disputeNotFound(id: string): AppError {
  return new AppError(DisputeErrorCode.DISPUTE_NOT_FOUND, `no dispute ${id}`, {
    status: HttpStatus.NOT_FOUND,
    detail: { id },
  });
}

export function disputeAlreadyExists(engagementId: string): AppError {
  return new AppError(
    DisputeErrorCode.DISPUTE_ALREADY_EXISTS,
    `engagement ${engagementId} already has a dispute — add evidence to it rather than raising a second one`,
    { status: HttpStatus.CONFLICT, detail: { engagementId } },
  );
}

export function disputeWrongStatus(id: string, status: string, expected: string[]): AppError {
  return new AppError(
    DisputeErrorCode.DISPUTE_WRONG_STATUS,
    `dispute ${id} is ${status}, expected one of: ${expected.join(', ')}`,
    { status: HttpStatus.CONFLICT, detail: { id, status, expected } },
  );
}

export function disputeNotAParty(disputeId: string, userId: string): AppError {
  return new AppError(
    DisputeErrorCode.DISPUTE_NOT_A_PARTY,
    `user ${userId} is not a party to dispute ${disputeId}`,
    { status: HttpStatus.FORBIDDEN, detail: { disputeId, userId } },
  );
}

export function rulingNotFound(disputeId: string, tier: number): AppError {
  return new AppError(
    DisputeErrorCode.RULING_NOT_FOUND,
    `dispute ${disputeId} has no ruling at tier ${tier}`,
    { status: HttpStatus.NOT_FOUND, detail: { disputeId, tier } },
  );
}

export function rulingSplitAmountRequired(): AppError {
  return new AppError(
    DisputeErrorCode.RULING_SPLIT_AMOUNT_REQUIRED,
    'a split ruling must state seekerRefundPaise',
    { status: HttpStatus.UNPROCESSABLE_ENTITY },
  );
}

export function appealTierIsFinal(disputeId: string, tier: number, tierCode: string): AppError {
  return new AppError(
    DisputeErrorCode.APPEAL_TIER_IS_FINAL,
    `dispute ${disputeId} is at tier ${tier} (${tierCode}), which the family's ladder marks final — there is nothing further to appeal to`,
    { status: HttpStatus.CONFLICT, detail: { disputeId, tier, tierCode } },
  );
}
