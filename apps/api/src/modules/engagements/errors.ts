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

/**
 * The agenda has to be locked before money is taken.
 *
 * The database allows the escrow hold and the agenda lock in either
 * order — either party may act first, and `try_promote_engagement_to_working`
 * waits for both. This is a stricter PRODUCT rule on top of that: paying
 * before the goals are fixed means paying for work nobody has defined,
 * and the whole escrow promise ("money is held until what you agreed is
 * delivered") is empty when nothing has been agreed yet.
 */
export function agendaNotLocked(engagementId: string): AppError {
  return new AppError(
    'AGENDA_NOT_LOCKED',
    'the agenda must be agreed and locked before payment',
    { status: HttpStatus.CONFLICT, detail: { engagementId } },
  );
}

/** A free engagement has nothing to hold. */
export function engagementHasNoPrice(engagementId: string): AppError {
  return new AppError('ENGAGEMENT_HAS_NO_PRICE', 'this engagement has no price to pay', {
    status: HttpStatus.CONFLICT,
    detail: { engagementId },
  });
}

export function discountInvalid(reason: string): AppError {
  return new AppError('DISCOUNT_INVALID', reason, { status: HttpStatus.UNPROCESSABLE_ENTITY });
}

export function packagePurchaseNotFound(purchaseId: string): AppError {
  return new AppError('PACKAGE_PURCHASE_NOT_FOUND', `no package purchase ${purchaseId}`, {
    status: HttpStatus.NOT_FOUND,
    detail: { purchaseId },
  });
}

export function packageExhausted(purchaseId: string, total: number): AppError {
  return new AppError(
    'PACKAGE_EXHAUSTED',
    `all ${total} sessions in this package have been used`,
    { status: HttpStatus.CONFLICT, detail: { purchaseId, sessionsTotal: total } },
  );
}
