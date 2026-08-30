import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';

export const VerificationErrorCode = {
  CREDENTIAL_TYPE_NOT_FOUND: 'CREDENTIAL_TYPE_NOT_FOUND',
  UNKNOWN_SKILL_CODES: 'UNKNOWN_SKILL_CODES',
  CREDENTIAL_NOT_FOUND: 'CREDENTIAL_NOT_FOUND',
  CREDENTIAL_WRONG_STATUS: 'CREDENTIAL_WRONG_STATUS',
  UNKNOWN_VERIFIER: 'UNKNOWN_VERIFIER',
} as const;

export function credentialTypeNotFound(code: string): AppError {
  return new AppError(VerificationErrorCode.CREDENTIAL_TYPE_NOT_FOUND, `no credential type "${code}"`, {
    status: HttpStatus.NOT_FOUND,
    detail: { code },
  });
}

export function unknownSkillCodes(codes: string[]): AppError {
  return new AppError(VerificationErrorCode.UNKNOWN_SKILL_CODES, `unknown skill code(s): ${codes.join(', ')}`, {
    detail: { codes },
  });
}

export function credentialNotFound(credentialId: string): AppError {
  return new AppError(VerificationErrorCode.CREDENTIAL_NOT_FOUND, `no credential ${credentialId}`, {
    status: HttpStatus.NOT_FOUND,
    detail: { credentialId },
  });
}

export function credentialWrongStatus(credentialId: string, status: string, expected: string[]): AppError {
  return new AppError(
    VerificationErrorCode.CREDENTIAL_WRONG_STATUS,
    `credential ${credentialId} is ${status}, expected one of: ${expected.join(', ')}`,
    { status: HttpStatus.CONFLICT, detail: { credentialId, status, expected } },
  );
}

/**
 * The credential carries no uploaded document — either it is a type
 * verified some other way (a result list lookup), or the provider
 * submitted a text reference from before storage existed.
 */
export function credentialHasNoDocument(credentialId: string): AppError {
  return new AppError('CREDENTIAL_HAS_NO_DOCUMENT', `credential ${credentialId} has no uploaded document`, {
    status: HttpStatus.NOT_FOUND,
    detail: { credentialId },
  });
}

export function unknownVerifier(verifier: string): AppError {
  return new AppError(VerificationErrorCode.UNKNOWN_VERIFIER, `no verifier implementation for "${verifier}"`, {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    detail: { verifier },
  });
}
