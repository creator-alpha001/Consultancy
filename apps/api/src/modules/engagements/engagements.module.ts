import { Module } from '@nestjs/common';
import { MoneyModule } from '../money/money.module';
import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { VerificationModule } from '../verification/verification.module';
import { EngagementAccessService } from './engagement-access.service';
import { EngagementsController } from './engagements.controller';
import { EngagementsService } from './engagements.service';

/**
 * Engagement lifecycle across all four types. M3 drives document_review
 * end to end; live_session/written_qa/async_task share this spine but
 * need sessions/ (M5) or board/ (M6) to actually be usable.
 */
@Module({
  imports: [TaxonomyModule, MoneyModule, VerificationModule],
  controllers: [EngagementsController],
  providers: [EngagementsService, EngagementAccessService],
  exports: [EngagementsService, EngagementAccessService],
})
export class EngagementsModule {}
