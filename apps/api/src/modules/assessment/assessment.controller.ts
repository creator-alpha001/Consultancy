import { BadRequestException, Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { EngagementAccessService } from '../engagements/engagement-access.service';
import { CurrentActor } from '../identity/auth.guard';
import { Actor } from '../identity/types';
import { EvaluationService } from './evaluation.service';
import { SubmissionService } from './submission.service';
import { EvaluationRow, SubmissionRow } from './types';

/**
 * Submissions and evaluations over HTTP.
 *
 * Like sessions/, these services have been real and tested since M3 with
 * no route to reach them. The asymmetry in this controller is the point:
 * the SEEKER submits work and the PROVIDER evaluates it, and each route
 * asserts the specific side rather than merely "a party", because the
 * two roles must never be interchangeable on an assessment.
 */
@Controller()
export class AssessmentController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(SubmissionService) private readonly submissions: SubmissionService,
    @Inject(EvaluationService) private readonly evaluations: EvaluationService,
    @Inject(EngagementAccessService) private readonly access: EngagementAccessService,
  ) {}

  /**
   * `contentRef` is a plain text pointer standing in for real private
   * storage. Object storage, `attachment_grants` and signed URLs
   * (CLAUDE.md #29) do not exist yet — see TRACKER.md. This route does
   * not pretend otherwise by accepting a file.
   */
  @Post('engagements/:engagementId/submissions')
  async submit(
    @Param('engagementId') engagementId: string,
    @CurrentActor() actor: Actor,
    @Body() body: { contentRef?: string; note?: string },
  ): Promise<SubmissionRow> {
    await this.access.assertSeeker(engagementId, actor);
    if (!body.contentRef) throw new BadRequestException('contentRef is required');
    return this.submissions.submit({
      engagementId,
      seekerId: actor.userId,
      contentRef: body.contentRef,
      note: body.note,
    });
  }

  @Get('engagements/:engagementId/submissions/latest')
  async latest(
    @Param('engagementId') engagementId: string,
    @CurrentActor() actor: Actor,
  ): Promise<SubmissionRow | null> {
    await this.access.assertParty(engagementId, actor);
    return this.submissions.getLatestForEngagement(engagementId);
  }

  /** Opening an evaluation is the provider's act — they are the assessor. */
  @Post('engagements/:engagementId/evaluations')
  async open(
    @Param('engagementId') engagementId: string,
    @CurrentActor() actor: Actor,
    @Body() body: { submissionId?: string },
  ): Promise<EvaluationRow> {
    await this.access.assertProvider(engagementId, actor);
    const submissionId =
      body.submissionId ?? (await this.submissions.getLatestForEngagement(engagementId))?.id;
    if (!submissionId) throw new BadRequestException('there is nothing submitted to evaluate');
    return this.evaluations.open({ engagementId, providerId: actor.userId, submissionId });
  }

  /** Both parties may read it; only one of them can have written it. */
  @Get('engagements/:engagementId/evaluations/latest')
  async latestEvaluation(
    @Param('engagementId') engagementId: string,
    @CurrentActor() actor: Actor,
  ): Promise<EvaluationRow | null> {
    await this.access.assertParty(engagementId, actor);
    const res = await this.pool.query<{ id: string }>(
      `SELECT id FROM evaluations WHERE engagement_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [engagementId],
    );
    return res.rows[0] ? this.evaluations.get(res.rows[0].id) : null;
  }

  /**
   * Scoring one dimension. The dimension code must belong to the
   * template bound to this evaluation — a provider cannot invent a
   * dimension (CLAUDE.md #16), and the service rejects an unknown code
   * rather than storing it.
   */
  @Post('evaluations/:id/scores')
  async score(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Body() body: { dimensionCode?: string; score?: number; comment?: string },
  ): Promise<{ scored: true }> {
    await this.assertEvaluator(id, actor);
    if (!body.dimensionCode) throw new BadRequestException('dimensionCode is required');
    if (typeof body.score !== 'number' || !Number.isInteger(body.score)) {
      throw new BadRequestException('score must be an integer');
    }
    await this.evaluations.addScore({
      evaluationId: id,
      dimensionCode: body.dimensionCode,
      score: body.score,
      comment: body.comment,
    });
    return { scored: true };
  }

  @Get('evaluations/:id')
  async get(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<EvaluationRow> {
    const evaluation = await this.evaluations.get(id);
    await this.access.assertParty(evaluation.engagementId, actor);
    return evaluation;
  }

  /**
   * Returning is refused unless every dimension of the bound template is
   * scored — pre-checked here for a typed error, enforced by a trigger
   * regardless. A category with no template has nothing to complete, and
   * that is a legitimate case, not a failure (hard rule #3).
   */
  @Post('evaluations/:id/return')
  async return_(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Body() body: { annotatedRef?: string; overallNote?: string },
  ): Promise<EvaluationRow> {
    await this.assertEvaluator(id, actor);
    return this.evaluations.return_(id, { annotatedRef: body.annotatedRef, overallNote: body.overallNote });
  }

  private async assertEvaluator(evaluationId: string, actor: Actor): Promise<void> {
    const evaluation = await this.evaluations.get(evaluationId);
    await this.access.assertProvider(evaluation.engagementId, actor);
  }
}
