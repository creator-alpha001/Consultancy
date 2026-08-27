import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, from } from 'rxjs';
import { IdempotencyService } from './idempotency.service';

/**
 * Enforces the `Idempotency-Key` header (CLAUDE.md hard rule #10) on the
 * route it decorates. `actorId` is read from `req.actorId` — populated
 * by auth middleware once identity/ exists; until then a caller may set
 * the `x-actor-id` header directly, which is fine for M1's
 * internal/ops-triggered money endpoints but must not survive past the
 * real auth module landing.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(IdempotencyService) private readonly idempotency: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { actorId?: string }>();
    const res = context.switchToHttp().getResponse<Response>();

    const key = req.header('idempotency-key');
    if (!key) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    const actorId = req.actorId ?? req.header('x-actor-id');
    if (!actorId) {
      throw new BadRequestException('actor could not be determined for this request');
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
