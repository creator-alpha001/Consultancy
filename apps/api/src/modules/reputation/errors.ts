import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';

export const ReputationErrorCode = {
  REVIEW_NOT_FOUND: 'REVIEW_NOT_FOUND',
  REVIEW_ALREADY_EXISTS: 'REVIEW_ALREADY_EXISTS',
  REVIEW_ENGAGEMENT_NOT_ENDED: 'REVIEW_ENGAGEMENT_NOT_ENDED',
  REVIEW_NOT_A_PARTY: 'REVIEW_NOT_A_PARTY',
  REVIEW_RATING_OUT_OF_RANGE: 'REVIEW_RATING_OUT_OF_RANGE',
  /** A dimension code the family's manifest does not define. */
  REVIEW_UNKNOWN_DIMENSION: 'REVIEW_UNKNOWN_DIMENSION',
  /** Only the subject of a review may reply to it. */
  REVIEW_REPLY_NOT_SUBJECT: 'REVIEW_REPLY_NOT_SUBJECT',
  /** One reply per review, and it is append-only. */
  REVIEW_REPLY_ALREADY_EXISTS: 'REVIEW_REPLY_ALREADY_EXISTS',
  /** A reply with nothing in it. */
  REVIEW_REPLY_EMPTY: 'REVIEW_REPLY_EMPTY',
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

export function reviewUnknownDimension(code: string, familyCode: string): AppError {
  return new AppError(
    ReputationErrorCode.REVIEW_UNKNOWN_DIMENSION,
    `"${code}" is not a review dimension in family ${familyCode}`,
    { status: HttpStatus.BAD_REQUEST, detail: { dimensionCode: code, familyCode } },
  );
}

export function reviewReplyNotSubject(reviewId: string): AppError {
  return new AppError(
    ReputationErrorCode.REVIEW_REPLY_NOT_SUBJECT,
    'only the person a review is about may reply to it',
    { status: HttpStatus.FORBIDDEN, detail: { reviewId } },
  );
}

export function reviewReplyAlreadyExists(reviewId: string): AppError {
  return new AppError(
    ReputationErrorCode.REVIEW_REPLY_ALREADY_EXISTS,
    'you have already replied to this review, and a reply cannot be edited',
    { status: HttpStatus.CONFLICT, detail: { reviewId } },
  );
}

export function reviewReplyEmpty(): AppError {
  return new AppError(ReputationErrorCode.REVIEW_REPLY_EMPTY, 'a reply needs something in it', {
    status: HttpStatus.BAD_REQUEST,
  });
}
