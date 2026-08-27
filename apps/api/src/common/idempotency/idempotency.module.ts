import { Global, Module } from '@nestjs/common';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyService } from './idempotency.service';

/**
 * Backs the `Idempotency-Key` header CLAUDE.md requires on every
 * mutating endpoint — not just money's. Global so any module can
 * `@UseInterceptors(IdempotencyInterceptor)` without importing this
 * module explicitly.
 */
@Global()
@Module({
  providers: [IdempotencyService, IdempotencyInterceptor],
  exports: [IdempotencyService, IdempotencyInterceptor],
})
export class IdempotencyModule {}
