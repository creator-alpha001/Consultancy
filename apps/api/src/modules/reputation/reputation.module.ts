import { Module } from '@nestjs/common';
import { EngagementsModule } from '../engagements/engagements.module';
import { VerificationModule } from '../verification/verification.module';
import { ProvidersController } from './providers.controller';
import { RankingService } from './ranking.service';
import { ReputationController } from './reputation.controller';
import { ReviewService } from './review.service';

/**
 * Reviews, per-skill stats, and search ordering. Deliberately contains
 * no leaderboard, streak, badge, or peer-comparison surface of any kind
 * (CLAUDE.md #17) — see `ranking.service.ts` for what that rules out.
 */
@Module({
  imports: [EngagementsModule, VerificationModule],
  controllers: [ReputationController, ProvidersController],
  providers: [ReviewService, RankingService],
  exports: [ReviewService, RankingService],
})
export class ReputationModule {}
