import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';

export const AgendaErrorCode = {
  AGENDA_NOT_FOUND: 'AGENDA_NOT_FOUND',
  AGENDA_ALREADY_LOCKED: 'AGENDA_ALREADY_LOCKED',
  AGENDA_INVALID: 'AGENDA_INVALID',
  AGENDA_NOT_LOCKED: 'AGENDA_NOT_LOCKED',
} as const;

export function agendaNotFound(agendaId: string): AppError {
  return new AppError(AgendaErrorCode.AGENDA_NOT_FOUND, `no agenda ${agendaId}`, {
    status: HttpStatus.NOT_FOUND,
    detail: { agendaId },
  });
}

export function agendaAlreadyLocked(agendaId: string): AppError {
  return new AppError(AgendaErrorCode.AGENDA_ALREADY_LOCKED, `agenda ${agendaId} is already locked`, {
    status: HttpStatus.CONFLICT,
    detail: { agendaId },
  });
}

export function agendaNotLocked(agendaId: string): AppError {
  return new AppError(
    AgendaErrorCode.AGENDA_NOT_LOCKED,
    `agenda ${agendaId} is not locked — edit it directly instead of raising a change order`,
    { status: HttpStatus.CONFLICT, detail: { agendaId } },
  );
}

export function agendaInvalid(reason: string, detail?: Record<string, unknown>): AppError {
  return new AppError(AgendaErrorCode.AGENDA_INVALID, reason, { detail });
}
