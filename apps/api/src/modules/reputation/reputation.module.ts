import { Module } from '@nestjs/common';
import { RankingService } from './ranking.service';
import { ReviewService } from './review.service';

/**
 * Reviews, per-skill stats, and search ordering. Deliberately contains
 * no leaderboard, streak, badge, or peer-comparison surface of any kind
 * (CLAUDE.md #17) — see `ranking.service.ts` for what that rules out.
 */
@Module({
  providers: [ReviewService, RankingService],
  exports: [ReviewService, RankingService],
})
export class ReputationModule {}
