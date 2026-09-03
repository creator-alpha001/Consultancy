import { Module } from '@nestjs/common';
import { DomainsModule } from '../domains/domains.module';
import { EngagementsModule } from '../engagements/engagements.module';
import { SafetyModule } from '../safety/safety.module';
import { VerificationModule } from '../verification/verification.module';
import { BoardController } from './board.controller';
import { BoardPostService } from './board-post.service';
import { BoardViewService } from './board-view.service';
import { ProposalService } from './proposal.service';
import { QuestionService } from './question.service';

/** Public questions, answers, screening (via safety/), quotas, proposals. */
@Module({
  imports: [DomainsModule, EngagementsModule, SafetyModule, VerificationModule],
  controllers: [BoardController],
  providers: [BoardViewService, BoardPostService, ProposalService, QuestionService],
  exports: [BoardViewService, BoardPostService, ProposalService, QuestionService],
})
export class BoardModule {}
