import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * Global, like idempotency: every module records decisions and none
 * should have to import a module to do it.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
