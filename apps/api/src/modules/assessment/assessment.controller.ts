import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Post } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { EngagementAccessService } from '../engagements/engagement-access.service';
import { CurrentActor, Roles } from '../identity/auth.guard';
import { Actor } from '../identity/types';
import { evaluationNotFound } from './errors';
import { EvaluationService } from './evaluation.service';
import { ProgressService, SeekerProgress } from './progress.service';
import { SubmissionService } from './submission.service';
import { AnnotationRow, EvaluationRow, SubmissionRow } from './types';

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
    @Inject(ProgressService) private readonly progressService: ProgressService,
  ) {}

  /**
   * Work is submitted either as a private file (`attachmentId`, uploaded
   * first through `POST /attachments`) or as a pointer to something the
   * seeker already has somewhere (`contentRef`). One of the two is
   * required — a submission that is neither is not a submission.
   *
   * Submitting a file grants the provider access to it, and nobody else.
   */
  @Post('engagements/:engagementId/submissions')
  async submit(
    @Param('engagementId') engagementId: string,
    @CurrentActor() actor: Actor,
    @Body() body: { contentRef?: string; attachmentId?: string; note?: string },
  ): Promise<SubmissionRow> {
    await this.access.assertSeeker(engagementId, actor);
    if (!body.contentRef && !body.attachmentId) {
      throw new BadRequestException('either attachmentId or contentRef is required');
    }
    return this.submissions.submit({
      engagementId,
      seekerId: actor.userId,
      contentRef: body.contentRef ?? '',
      attachmentId: body.attachmentId,
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


  /**
   * Place a remark on the work.
   *
   * Only the assessor. A seeker adding remarks to their own marked answer
   * would make the assessment unusable as evidence, and the provider is
   * checked against the evaluation rather than the engagement so a second
   * provider on the same engagement cannot write into someone else's
   * assessment.
   */
  @Post('evaluations/:id/annotations')
  async annotate(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Body() body: { page?: number; anchorX?: number | null; anchorY?: number | null; bodyText?: string; bodyLang?: string },
  ): Promise<AnnotationRow> {
    await this.assertAssessor(id, actor);
    if (!body.bodyText || !body.bodyText.trim()) {
      throw new BadRequestException('bodyText is required');
    }
    return this.evaluations.addAnnotation({
      evaluationId: id,
      page: body.page,
      anchorX: body.anchorX,
      anchorY: body.anchorY,
      bodyText: body.bodyText,
      // The original language is authoritative (#20), so it is recorded
      // rather than inferred at read time.
      bodyLang: body.bodyLang || 'en',
    });
  }

  @Delete('annotations/:id')
  async removeAnnotation(@Param('id') id: string, @CurrentActor() actor: Actor): Promise<{ ok: true }> {
    const evaluationId = await this.evaluations.evaluationIdForAnnotation(id);
    await this.assertAssessor(evaluationId, actor);
    await this.evaluations.removeAnnotation(id);
    return { ok: true };
  }

  /** The assessor is the provider named on the evaluation, and nobody else. */
  private async assertAssessor(evaluationId: string, actor: Actor): Promise<void> {
    const providerId = await this.evaluations.providerOf(evaluationId);
    if (providerId !== actor.userId) {
      // 404, not 403 — an evaluation id is not confirmed to someone who
      // may not write to it.
      throw evaluationNotFound(evaluationId);
    }
  }

  /**
   * A seeker's own progress, and what they were asked to work on.
   *
   * Scoped to the caller with no user id in the route. There is no way to
   * ask this about anyone else, which is deliberate: #17 forbids
   * comparing one seeker to another, and an endpoint that answered about
   * a stranger is the first thing a leaderboard would need.
   */
  @Get('me/progress')
  @Roles('seeker')
  async progress(@CurrentActor() actor: Actor): Promise<SeekerProgress> {
    return this.progressService.forSeeker(actor.userId);
  }

  /** Tick, or un-tick, one thing. Reversible — a one-way tick makes the list lie. */
  @Post('me/action-items/:annotationId')
  @Roles('seeker')
  async setActionDone(
    @Param('annotationId') annotationId: string,
    @CurrentActor() actor: Actor,
    @Body() body: { done?: boolean },
  ): Promise<{ doneAt: Date | null }> {
    return this.progressService.setActionDone({
      annotationId,
      seekerId: actor.userId,
      done: body.done !== false,
    });
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
