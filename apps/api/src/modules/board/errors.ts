import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';

export const BoardErrorCode = {
  BOARD_POST_NOT_FOUND: 'BOARD_POST_NOT_FOUND',
  BOARD_POST_WRONG_STATUS: 'BOARD_POST_WRONG_STATUS',
  BOARD_POST_CATEGORY_DOMAIN_MISMATCH: 'BOARD_POST_CATEGORY_DOMAIN_MISMATCH',
  NOT_POST_OWNER: 'NOT_POST_OWNER',
  PROPOSAL_NOT_FOUND: 'PROPOSAL_NOT_FOUND',
  PROPOSAL_WRONG_STATUS: 'PROPOSAL_WRONG_STATUS',
  PROPOSAL_QUOTA_EXCEEDED: 'PROPOSAL_QUOTA_EXCEEDED',
  PROPOSAL_NOT_ELIGIBLE: 'PROPOSAL_NOT_ELIGIBLE',
  QUESTION_QUOTA_EXCEEDED: 'QUESTION_QUOTA_EXCEEDED',
  QUESTION_NOT_FOUND: 'QUESTION_NOT_FOUND',
} as const;

export function boardPostNotFound(id: string): AppError {
  return new AppError(BoardErrorCode.BOARD_POST_NOT_FOUND, `no board post ${id}`, {
    status: HttpStatus.NOT_FOUND,
    detail: { id },
  });
}

export function boardPostWrongStatus(id: string, status: string, expected: string[]): AppError {
  return new AppError(
    BoardErrorCode.BOARD_POST_WRONG_STATUS,
    `board post ${id} is ${status}, expected one of: ${expected.join(', ')}`,
    { status: HttpStatus.CONFLICT, detail: { id, status, expected } },
  );
}

export function boardPostCategoryDomainMismatch(categoryId: string, domainCode: string): AppError {
  return new AppError(
    BoardErrorCode.BOARD_POST_CATEGORY_DOMAIN_MISMATCH,
    `category ${categoryId} does not belong to domain ${domainCode}`,
    { detail: { categoryId, domainCode } },
  );
}

export function notPostOwner(postId: string, seekerId: string): AppError {
  return new AppError(BoardErrorCode.NOT_POST_OWNER, `seeker ${seekerId} does not own board post ${postId}`, {
    status: HttpStatus.FORBIDDEN,
    detail: { postId, seekerId },
  });
}

export function proposalNotFound(id: string): AppError {
  return new AppError(BoardErrorCode.PROPOSAL_NOT_FOUND, `no proposal ${id}`, {
    status: HttpStatus.NOT_FOUND,
    detail: { id },
  });
}

export function proposalWrongStatus(id: string, status: string, expected: string[]): AppError {
  return new AppError(
    BoardErrorCode.PROPOSAL_WRONG_STATUS,
    `proposal ${id} is ${status}, expected one of: ${expected.join(', ')}`,
    { status: HttpStatus.CONFLICT, detail: { id, status, expected } },
  );
}

export function proposalQuotaExceeded(providerId: string, quota: number): AppError {
  return new AppError(
    BoardErrorCode.PROPOSAL_QUOTA_EXCEEDED,
    `provider ${providerId} has reached the weekly proposal quota of ${quota}`,
    { status: HttpStatus.TOO_MANY_REQUESTS, detail: { providerId, quota } },
  );
}

export function proposalNotEligible(providerId: string, boardPostId: string): AppError {
  return new AppError(
    BoardErrorCode.PROPOSAL_NOT_ELIGIBLE,
    `provider ${providerId} does not meet the required skill/tier/language bar for board post ${boardPostId}`,
    { status: HttpStatus.FORBIDDEN, detail: { providerId, boardPostId } },
  );
}

export function questionQuotaExceeded(seekerId: string, quota: number): AppError {
  return new AppError(
    BoardErrorCode.QUESTION_QUOTA_EXCEEDED,
    `seeker ${seekerId} has reached the daily free-question quota of ${quota}`,
    { status: HttpStatus.TOO_MANY_REQUESTS, detail: { seekerId, quota } },
  );
}

export function questionNotFound(id: string): AppError {
  return new AppError(BoardErrorCode.QUESTION_NOT_FOUND, `no question ${id}`, {
    status: HttpStatus.NOT_FOUND,
    detail: { id },
  });
}
