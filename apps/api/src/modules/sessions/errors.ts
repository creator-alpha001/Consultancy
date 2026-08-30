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

/**
 * A recurrence rule outside the supported subset.
 *
 * Refused rather than partially understood: a rule quietly misread
 * books sessions at times the provider never offered, and nobody finds
 * out until a seeker turns up to an empty room.
 */
export function invalidRrule(rrule: string): AppError {
  return new AppError(
    'AVAILABILITY_RRULE_UNSUPPORTED',
    `only FREQ=WEEKLY;BYDAY=... is supported, got "${rrule}"`,
    { status: HttpStatus.BAD_REQUEST, detail: { rrule, supported: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU' } },
  );
}

export function invalidAvailabilityWindow(startMinute: number, endMinute: number, why?: string): AppError {
  return new AppError(
    'AVAILABILITY_WINDOW_INVALID',
    why ?? `availability must end after it starts (got ${startMinute}-${endMinute})`,
    { status: HttpStatus.BAD_REQUEST, detail: { startMinute, endMinute } },
  );
}

export function slotNotAvailable(providerId: string, startIso: string): AppError {
  return new AppError(
    'SESSION_SLOT_NOT_AVAILABLE',
    'that time is not available — it may have just been taken, or it falls outside the hours offered',
    { status: HttpStatus.CONFLICT, detail: { providerId, start: startIso } },
  );
}

export function extensionNotFound(id: string): AppError {
  return new AppError('SESSION_EXTENSION_NOT_FOUND', `no session extension ${id}`, {
    status: HttpStatus.NOT_FOUND,
    detail: { id },
  });
}

export function extensionNotProposed(id: string, status: string): AppError {
  return new AppError(
    'SESSION_EXTENSION_WRONG_STATUS',
    `extension ${id} is ${status} — only a proposed extension can be accepted or declined`,
    { status: HttpStatus.CONFLICT, detail: { id, status } },
  );
}

/** It is the seeker's money, so it is the seeker's decision. */
export function extensionNotSeeker(id: string): AppError {
  return new AppError('SESSION_EXTENSION_NOT_SEEKER', 'only the person paying can accept an extension', {
    status: HttpStatus.FORBIDDEN,
    detail: { id },
  });
}

export function extensionSessionNotLive(sessionId: string, status: string): AppError {
  return new AppError(
    'SESSION_EXTENSION_SESSION_NOT_LIVE',
    `session ${sessionId} is ${status} — time can only be added while it is running`,
    { status: HttpStatus.CONFLICT, detail: { sessionId, status } },
  );
}
