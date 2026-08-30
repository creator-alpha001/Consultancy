import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';

export const SafetyErrorCode = {
  REPORT_NOT_FOUND: 'REPORT_NOT_FOUND',
  REPORT_SUBJECT_NOT_FOUND: 'REPORT_SUBJECT_NOT_FOUND',
  REPORT_REASON_UNKNOWN: 'REPORT_REASON_UNKNOWN',
  REPORT_SELF: 'REPORT_SELF',
  REPORT_DOMAIN_REQUIRED: 'REPORT_DOMAIN_REQUIRED',
  REPORT_ALREADY_OPEN: 'REPORT_ALREADY_OPEN',
  REPORT_ALREADY_RESOLVED: 'REPORT_ALREADY_RESOLVED',
} as const;

export function reportNotFound(id: string): AppError {
  return new AppError(SafetyErrorCode.REPORT_NOT_FOUND, `no report ${id}`, {
    status: HttpStatus.NOT_FOUND,
    detail: { id },
  });
}

export function reportSubjectNotFound(subjectType: string, subjectId: string): AppError {
  return new AppError(
    SafetyErrorCode.REPORT_SUBJECT_NOT_FOUND,
    `no ${subjectType} ${subjectId} to report`,
    { status: HttpStatus.NOT_FOUND, detail: { subjectType, subjectId } },
  );
}

/**
 * The reason is not in the family's declared list. Carries the codes it
 * would have accepted, because a client that guessed is a client that
 * needs to be told what the pack actually offers.
 */
export function reportReasonUnknown(familyCode: string, reasonCode: string, accepted: string[]): AppError {
  return new AppError(
    SafetyErrorCode.REPORT_REASON_UNKNOWN,
    `"${reasonCode}" is not a reporting reason declared by family ${familyCode}`,
    { status: HttpStatus.BAD_REQUEST, detail: { familyCode, reasonCode, accepted } },
  );
}

/**
 * The reasons a person may pick come from the family, and the family is
 * reached through a domain. Most subjects carry their own — a question
 * knows its domain — but a *person* does not: a seeker has many (#6).
 * There the caller names the context they are reporting from.
 */
export function reportDomainRequired(subjectType: string): AppError {
  return new AppError(
    SafetyErrorCode.REPORT_DOMAIN_REQUIRED,
    `reporting a ${subjectType} needs a domainCode — it is how the reasons are resolved`,
    { status: HttpStatus.BAD_REQUEST, detail: { subjectType } },
  );
}

export function reportSelf(): AppError {
  return new AppError(SafetyErrorCode.REPORT_SELF, 'you cannot report your own content or account', {
    status: HttpStatus.BAD_REQUEST,
  });
}

export function reportAlreadyOpen(subjectType: string, subjectId: string): AppError {
  return new AppError(
    SafetyErrorCode.REPORT_ALREADY_OPEN,
    'you already have a report open about this — it is with a reviewer',
    { status: HttpStatus.CONFLICT, detail: { subjectType, subjectId } },
  );
}

export function reportAlreadyResolved(id: string, status: string): AppError {
  return new AppError(
    SafetyErrorCode.REPORT_ALREADY_RESOLVED,
    `report ${id} was already resolved (${status}) — raise a new report instead`,
    { status: HttpStatus.CONFLICT, detail: { id, status } },
  );
}
