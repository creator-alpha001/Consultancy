import { Module } from '@nestjs/common';
import { DomainsModule } from '../domains/domains.module';
import { PackEditorController } from './pack-editor.controller';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';

/**
 * Queues, audit, config, pack editor — plus M9's reconciliation, which
 * lives here because it is an ops concern that reads across every
 * module rather than belonging to any one of them.
 *
 * Note it only READS money tables. The "only money/ writes to ledger,
 * escrow, payout and refund tables" boundary is intact.
 */
@Module({
  imports: [DomainsModule],
  controllers: [PackEditorController, ReconciliationController],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class AdminModule {}
