import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';

export const EngagementErrorCode = {
  ENGAGEMENT_NOT_FOUND: 'ENGAGEMENT_NOT_FOUND',
  ENGAGEMENT_WRONG_STATUS: 'ENGAGEMENT_WRONG_STATUS',
  ENGAGEMENT_CATEGORY_DOMAIN_MISMATCH: 'ENGAGEMENT_CATEGORY_DOMAIN_MISMATCH',
  ENGAGEMENT_ESCROW_MISSING: 'ENGAGEMENT_ESCROW_MISSING',
  PROVIDER_PAID_WORK_BLOCKED: 'PROVIDER_PAID_WORK_BLOCKED',
} as const;

export function engagementNotFound(engagementId: string): AppError {
  return new AppError(EngagementErrorCode.ENGAGEMENT_NOT_FOUND, `no engagement ${engagementId}`, {
    status: HttpStatus.NOT_FOUND,
    detail: { engagementId },
  });
}

export function engagementWrongStatus(engagementId: string, status: string, expected: string[]): AppError {
  return new AppError(
    EngagementErrorCode.ENGAGEMENT_WRONG_STATUS,
    `engagement ${engagementId} is ${status}, expected one of: ${expected.join(', ')}`,
    { status: HttpStatus.CONFLICT, detail: { engagementId, status, expected } },
  );
}

export function categoryDomainMismatch(categoryId: string, domainCode: string): AppError {
  return new AppError(
    EngagementErrorCode.ENGAGEMENT_CATEGORY_DOMAIN_MISMATCH,
    `category ${categoryId} does not belong to domain ${domainCode}`,
    { detail: { categoryId, domainCode } },
  );
}

export function engagementEscrowMissing(engagementId: string): AppError {
  return new AppError(
    EngagementErrorCode.ENGAGEMENT_ESCROW_MISSING,
    `engagement ${engagementId} has no escrow to release`,
    { status: HttpStatus.INTERNAL_SERVER_ERROR, detail: { engagementId } },
  );
}

export function providerPaidWorkBlocked(providerId: string): AppError {
  return new AppError(
    EngagementErrorCode.PROVIDER_PAID_WORK_BLOCKED,
    `provider ${providerId} cannot take paid work pending departmental sanction`,
    { status: HttpStatus.CONFLICT, detail: { providerId } },
  );
}
