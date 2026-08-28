import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';

export const ReputationErrorCode = {
  REVIEW_NOT_FOUND: 'REVIEW_NOT_FOUND',
  REVIEW_ALREADY_EXISTS: 'REVIEW_ALREADY_EXISTS',
  REVIEW_ENGAGEMENT_NOT_ENDED: 'REVIEW_ENGAGEMENT_NOT_ENDED',
  REVIEW_NOT_A_PARTY: 'REVIEW_NOT_A_PARTY',
  REVIEW_RATING_OUT_OF_RANGE: 'REVIEW_RATING_OUT_OF_RANGE',
} as const;

export type ReputationErrorCode = (typeof ReputationErrorCode)[keyof typeof ReputationErrorCode];

export function reviewNotFound(id: string): AppError {
  return new AppError(ReputationErrorCode.REVIEW_NOT_FOUND, `no review ${id}`, {
    status: HttpStatus.NOT_FOUND,
    detail: { id },
  });
}

export function reviewAlreadyExists(engagementId: string, direction: string): AppError {
  return new AppError(
    ReputationErrorCode.REVIEW_ALREADY_EXISTS,
    `engagement ${engagementId} already has a ${direction} review — reviews are immutable`,
    { status: HttpStatus.CONFLICT, detail: { engagementId, direction } },
  );
}

export function reviewEngagementNotEnded(engagementId: string, status: string): AppError {
  return new AppError(
    ReputationErrorCode.REVIEW_ENGAGEMENT_NOT_ENDED,
    `engagement ${engagementId} is ${status} — it can only be reviewed once it has ended`,
    { status: HttpStatus.CONFLICT, detail: { engagementId, status } },
  );
}

export function reviewNotAParty(engagementId: string, reviewerId: string, direction: string): AppError {
  return new AppError(
    ReputationErrorCode.REVIEW_NOT_A_PARTY,
    `user ${reviewerId} cannot leave a ${direction} review on engagement ${engagementId}`,
    { status: HttpStatus.FORBIDDEN, detail: { engagementId, reviewerId, direction } },
  );
}

export function reviewRatingOutOfRange(rating: number): AppError {
  return new AppError(
    ReputationErrorCode.REVIEW_RATING_OUT_OF_RANGE,
    `rating ${rating} is outside the permitted range of 1–5`,
    { status: HttpStatus.UNPROCESSABLE_ENTITY, detail: { rating } },
  );
}
