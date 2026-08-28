import { Module } from '@nestjs/common';
import { DomainsModule } from '../domains/domains.module';
import { EngagementsModule } from '../engagements/engagements.module';
import { DisputeService } from './dispute.service';
import { EvidenceService } from './evidence.service';

/**
 * Tiers, evidence, rulings, appeals. The tier ladder is family-manifest
 * data (see `dispute.service.ts`), and settlement delegates every rupee
 * to `engagements/` → `money/` — this module never writes an escrow or
 * ledger row.
 */
@Module({
  imports: [DomainsModule, EngagementsModule],
  providers: [DisputeService, EvidenceService],
  exports: [DisputeService, EvidenceService],
})
export class DisputesModule {}
