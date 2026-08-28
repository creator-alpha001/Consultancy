import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, from } from 'rxjs';
import { idempotencyActorUnresolved, idempotencyKeyRequired } from './errors';
import { IdempotencyService } from './idempotency.service';

/**
 * Enforces the `Idempotency-Key` header (CLAUDE.md hard rule #10) on the
 * route it decorates.
 *
 * The actor comes from `req.actor`, set by `AuthGuard` from a real
 * session. The `x-actor-id` header this once accepted is GONE: it let a
 * client claim any identity, violating CLAUDE.md #28, and scoping
 * idempotency keys by a caller-chosen id would also have let one caller
 * collide with (or replay) another's key.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(IdempotencyService) private readonly idempotency: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { actor?: { userId: string } }>();
    const res = context.switchToHttp().getResponse<Response>();

    const key = req.header('idempotency-key');
    if (!key) {
      throw idempotencyKeyRequired();
    }
    // Authenticated actor only. No header fallback — see the note above.
    const actorId = req.actor?.userId;
    if (!actorId) {
      throw idempotencyActorUnresolved();
    }

    const requestHash = IdempotencyService.hashRequest(req.body);

    return from(
      this.idempotency.runOnce(
        { actorId, key, endpoint: `${req.method} ${req.route?.path ?? req.path}`, requestHash },
        () =>
          new Promise((resolve, reject) => {
            next.handle().subscribe({
              next: (body) => resolve({ status: res.statusCode, body }),
              error: reject,
            });
          }),
      ).then((result) => {
        res.status(result.status);
        return result.body;
      }),
    );
  }
}
