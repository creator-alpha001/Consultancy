import { Module } from '@nestjs/common';
import { EngagementsModule } from '../engagements/engagements.module';
import { RankingService } from './ranking.service';
import { ReputationController } from './reputation.controller';
import { ReviewService } from './review.service';

/**
 * Reviews, per-skill stats, and search ordering. Deliberately contains
 * no leaderboard, streak, badge, or peer-comparison surface of any kind
 * (CLAUDE.md #17) — see `ranking.service.ts` for what that rules out.
 */
@Module({
  imports: [EngagementsModule],
  controllers: [ReputationController],
  providers: [ReviewService, RankingService],
  exports: [ReviewService, RankingService],
})
export class ReputationModule {}
