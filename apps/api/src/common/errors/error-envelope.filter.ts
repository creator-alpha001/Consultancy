import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { AppError } from './app-error';

/**
 * Renders every error — ours or Nest's built-in HttpExceptions — as the
 * one envelope CLAUDE.md specifies:
 * { error: { code, message, detail, requestId } }.
 */
@Catch()
export class ErrorEnvelopeFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = req.header('x-request-id') ?? randomUUID();

    if (exception instanceof AppError) {
      res.status(exception.getStatus()).json({
        error: { code: exception.code, message: exception.message, detail: exception.detail, requestId },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const rawMessage = typeof body === 'string' ? body : (body as { message?: unknown }).message;
      const message = Array.isArray(rawMessage) ? rawMessage.join('; ') : (rawMessage as string) ?? exception.message;
      res.status(status).json({
        error: { code: httpStatusToCode(status), message, detail: {}, requestId },
      });
      return;
    }

    // eslint-disable-next-line no-console
    console.error(exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: 'INTERNAL_ERROR', message: 'an unexpected error occurred', detail: {}, requestId },
    });
  }
}

function httpStatusToCode(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'BAD_REQUEST';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    default:
      return 'ERROR';
  }
}
