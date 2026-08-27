import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * The one error envelope (CLAUDE.md — Errors): every thrown AppError
 * renders as `{ error: { code, message, detail, requestId } }` via
 * ErrorEnvelopeFilter. `code` is stable and meant to be switched on by
 * clients; `message` is human-readable and never parsed.
 */
export class AppError extends HttpException {
  readonly code: string;
  readonly detail: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    options?: { status?: HttpStatus; detail?: Record<string, unknown> },
  ) {
    super(message, options?.status ?? HttpStatus.BAD_REQUEST);
    this.code = code;
    this.detail = options?.detail ?? {};
  }
}
