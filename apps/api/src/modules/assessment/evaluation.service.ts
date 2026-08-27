import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { FamilyManifestService } from '../domains/family-manifest.service';
import {
  evaluationAlreadyReturned,
  evaluationHasNoTemplate,
  evaluationIncomplete,
  evaluationNotFound,
  unknownDimension,
} from './errors';
import { EvaluationRow, TemplateDimension } from './types';

interface EvaluationDbRow {
  id: string;
  engagement_id: string;
  submission_id: string;
  provider_id: string;
  template_id: string | null;
  annotated_ref: string | null;
  overall_note: string;
  returned_at: Date | null;
}

interface ScoreDbRow {
  dimension_code: string;
  score: string;
  comment: string;
}

/**
 * SPEC-PLATFORM.md §10: "An assessment cannot be returned unless every
 * dimension in its bound template is scored." The DB trigger from 0013
 * is the last line of defence; this service pre-checks the same
 * condition so callers get a typed AppError instead of a raw
 * constraint-violation message.
 */
@Injectable()
export class EvaluationService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(FamilyManifestService) private readonly families: FamilyManifestService,
  ) {}

  /** Resolves the template from the engagement's frozen required skills — never from a category directly (hard rule #3: never assume one exists). */
  async open(input: { engagementId: string; providerId: string; submissionId: string }): Promise<EvaluationRow> {
    const skillsRes = await this.pool.query<{ skill_id: string }>(
      `SELECT skill_id FROM engagement_skills WHERE engagement_id = $1`,
      [input.engagementId],
    );
    const templateId = await this.families.resolveTemplateForSkillIds(skillsRes.rows.map((r) => r.skill_id));

    const res = await this.pool.query<EvaluationDbRow>(
      `INSERT INTO evaluations (engagement_id, submission_id, provider_id, template_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.engagementId, input.submissionId, input.providerId, templateId],
    );
    return this.hydrate(res.rows[0]);
  }

  async get(evaluationId: string): Promise<EvaluationRow> {
    const res = await this.pool.query<EvaluationDbRow>(`SELECT * FROM evaluations WHERE id = $1`, [evaluationId]);
    if (!res.rows[0]) throw evaluationNotFound(evaluationId);
    return this.hydrate(res.rows[0]);
  }

  async addScore(input: { evaluationId: string; dimensionCode: string; score: number; comment?: string }): Promise<void> {
    const evaluation = await this.mustBeOpen(input.evaluationId);
    if (!evaluation.template_id) throw evaluationHasNoTemplate(input.evaluationId);

    const dimensions = await this.templateDimensions(evaluation.template_id);
    if (!dimensions.some((d) => d.code === input.dimensionCode)) {
      throw unknownDimension(input.dimensionCode, input.evaluationId);
    }

    await this.pool.query(
      `INSERT INTO assessment_scores (evaluation_id, dimension_code, score, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (evaluation_id, dimension_code) DO UPDATE SET score = EXCLUDED.score, comment = EXCLUDED.comment`,
      [input.evaluationId, input.dimensionCode, input.score, input.comment ?? ''],
    );
  }

  /** Sets returned_at, which the DB trigger promotes into the engagement's 'assessed' state. */
  async return_(evaluationId: string, options?: { annotatedRef?: string; overallNote?: string }): Promise<EvaluationRow> {
    const evaluation = await this.mustBeOpen(evaluationId);

    if (evaluation.template_id) {
      const dimensions = await this.templateDimensions(evaluation.template_id);
      const scoresRes = await this.pool.query<{ dimension_code: string }>(
        `SELECT dimension_code FROM assessment_scores WHERE evaluation_id = $1`,
        [evaluationId],
      );
      const scored = new Set(scoresRes.rows.map((r) => r.dimension_code));
      const missing = dimensions.filter((d) => !scored.has(d.code)).map((d) => d.code);
      if (missing.length > 0) {
        throw evaluationIncomplete(evaluationId, scored.size, dimensions.length, missing);
      }
    }

    const res = await this.pool.query<EvaluationDbRow>(
      `UPDATE evaluations
          SET returned_at = now(), annotated_ref = COALESCE($2, annotated_ref), overall_note = COALESCE($3, overall_note)
        WHERE id = $1
        RETURNING *`,
      [evaluationId, options?.annotatedRef ?? null, options?.overallNote ?? null],
    );
    return this.hydrate(res.rows[0]);
  }

  private async mustBeOpen(evaluationId: string): Promise<EvaluationDbRow> {
    const res = await this.pool.query<EvaluationDbRow>(`SELECT * FROM evaluations WHERE id = $1`, [evaluationId]);
    const evaluation = res.rows[0];
    if (!evaluation) throw evaluationNotFound(evaluationId);
    if (evaluation.returned_at) throw evaluationAlreadyReturned(evaluationId);
    return evaluation;
  }

  private async templateDimensions(templateId: string): Promise<TemplateDimension[]> {
    const res = await this.pool.query<{ dimensions: TemplateDimension[] }>(
      `SELECT dimensions FROM assessment_templates WHERE id = $1`,
      [templateId],
    );
    return res.rows[0]?.dimensions ?? [];
  }

  private async hydrate(row: EvaluationDbRow): Promise<EvaluationRow> {
    const scoresRes = await this.pool.query<ScoreDbRow>(
      `SELECT dimension_code, score, comment FROM assessment_scores WHERE evaluation_id = $1`,
      [row.id],
    );
    return {
      id: row.id,
      engagementId: row.engagement_id,
      submissionId: row.submission_id,
      providerId: row.provider_id,
      templateId: row.template_id,
      annotatedRef: row.annotated_ref,
      overallNote: row.overall_note,
      returnedAt: row.returned_at,
      scores: scoresRes.rows.map((r) => ({ dimensionCode: r.dimension_code, score: Number(r.score), comment: r.comment })),
    };
  }
}
