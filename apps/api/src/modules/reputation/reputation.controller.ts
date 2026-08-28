import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { EngagementAccessService } from '../engagements/engagement-access.service';
import { CurrentActor } from '../identity/auth.guard';
import { Actor } from '../identity/types';
import { RankingService } from './ranking.service';
import { ReviewService } from './review.service';
import { ProviderSkillStats, ReviewRow } from './types';

/**
 * Reviews and per-skill stats.
 *
 * There is deliberately no "top providers" or leaderboard route here,
 * and `ProviderSkillStats` carries no rank or percentile (CLAUDE.md
 * #17). A provider can read their OWN history; nothing exposes where
 * they stand relative to anyone else.
 */
@Controller()
export class ReputationController {
  constructor(
    @Inject(ReviewService) private readonly reviews: ReviewService,
    @Inject(RankingService) private readonly ranking: RankingService,
    @Inject(EngagementAccessService) private readonly access: EngagementAccessService,
  ) {}

  @Post('engagements/:engagementId/reviews')
  async leave(
    @Param('engagementId') engagementId: string,
    @CurrentActor() actor: Actor,
    @Body()
    body: {
      direction: 'seeker_on_provider' | 'provider_on_seeker';
      rating: number;
      bodyOriginal?: string;
      bodyLang: string;
      dimensionScores?: Array<{ dimensionCode: string; score: number }>;
    },
  ): Promise<ReviewRow> {
    await this.access.assertParty(engagementId, actor);
    // The subject is derived from the engagement inside the service — a
    // client cannot nominate who its review is about.
    return this.reviews.leave({ engagementId, reviewerId: actor.userId, ...body });
  }

  /**
   * The right of reply. Only the person a review is about may use it,
   * once, and never edit it afterwards — enforced by triggers in 0031.
   */
  @Post('reviews/:id/reply')
  async reply(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Body() body: { bodyOriginal?: string; bodyLang?: string },
  ): Promise<unknown> {
    return this.reviews.reply({
      reviewId: id,
      authorId: actor.userId,
      bodyOriginal: body.bodyOriginal ?? '',
      bodyLang: body.bodyLang ?? 'en',
    });
  }

  @Get('engagements/:engagementId/reviews')
  async listForEngagement(
    @Param('engagementId') engagementId: string,
    @CurrentActor() actor: Actor,
  ): Promise<ReviewRow[]> {
    await this.access.assertParty(engagementId, actor);
    return this.reviews.listForEngagement(engagementId);
  }

  /** Reviews written about one user. Recency order — never sorted by rating. */
  @Get('users/:userId/reviews')
  async listAboutUser(@Param('userId') userId: string): Promise<ReviewRow[]> {
    return this.reviews.listAboutUser(userId);
  }

  /** A provider's own history, per skill. No comparison to anyone else (#17). */
  @Get('me/skill-stats')
  async myStats(@CurrentActor() actor: Actor): Promise<ProviderSkillStats[]> {
    return this.ranking.getProviderStats(actor.userId);
  }
}
