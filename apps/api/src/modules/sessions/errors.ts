import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';

export const SessionErrorCode = {
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_WRONG_STATUS: 'SESSION_WRONG_STATUS',
  RECORDING_CONSENT_INCOMPLETE: 'RECORDING_CONSENT_INCOMPLETE',
} as const;

export function sessionNotFound(sessionId: string): AppError {
  return new AppError(SessionErrorCode.SESSION_NOT_FOUND, `no session ${sessionId}`, {
    status: HttpStatus.NOT_FOUND,
    detail: { sessionId },
  });
}

export function sessionWrongStatus(sessionId: string, status: string, expected: string[]): AppError {
  return new AppError(
    SessionErrorCode.SESSION_WRONG_STATUS,
    `session ${sessionId} is ${status}, expected one of: ${expected.join(', ')}`,
    { status: HttpStatus.CONFLICT, detail: { sessionId, status, expected } },
  );
}

export function recordingConsentIncomplete(sessionId: string, consenting: number, total: number): AppError {
  return new AppError(
    SessionErrorCode.RECORDING_CONSENT_INCOMPLETE,
    `session ${sessionId} cannot record: ${consenting} of ${total} participants have consented`,
    { status: HttpStatus.CONFLICT, detail: { sessionId, consenting, total } },
  );
}
