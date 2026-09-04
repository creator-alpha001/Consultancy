import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { FamilyManifestService } from '../domains/family-manifest.service';
import {
  annotationAnchorIncomplete,
  annotationNotFound,
  evaluationAlreadyReturned,
  evaluationHasNoTemplate,
  evaluationIncomplete,
  evaluationNotFound,
  unknownDimension,
} from './errors';
import { AnnotationRow, AssessmentTemplateView, EvaluationRow, TemplateDimension } from './types';

interface AnnotationDbRow {
  id: string;
  ordinal: number;
  page: number;
  /** numeric(6,5) arrives as a string from pg — never Number() it implicitly. */
  anchor_x: string | null;
  anchor_y: string | null;
  body_text: string;
  body_lang: string;
}

function mapAnnotation(row: AnnotationDbRow): AnnotationRow {
  return {
    id: row.id,
    ordinal: Number(row.ordinal),
    page: Number(row.page),
    anchorX: row.anchor_x === null ? null : Number(row.anchor_x),
    anchorY: row.anchor_y === null ? null : Number(row.anchor_y),
    bodyText: row.body_text,
    bodyLang: row.body_lang,
  };
}

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

  /**
   * The rubric an engagement will be marked against, resolved from its
   * frozen required skills — the SAME path `open()` takes, deliberately
   * calling the same resolver rather than reimplementing it, so a
   * provider can never be shown one rubric and marked against another.
   *
   * Null when the engagement's skills carry no template. That is a
   * legitimate state (hard rule #3), not a missing row.
   */
  async templateForEngagement(engagementId: string): Promise<AssessmentTemplateView | null> {
    const skillsRes = await this.pool.query<{ skill_id: string }>(
      `SELECT skill_id FROM engagement_skills WHERE engagement_id = $1`,
      [engagementId],
    );
    const templateId = await this.families.resolveTemplateForSkillIds(skillsRes.rows.map((r) => r.skill_id));
    if (templateId === null) return null;

    const res = await this.pool.query<{
      id: string;
      code: string;
      labels: Record<string, string>;
      dimensions: TemplateDimension[];
    }>(
      `SELECT id, code, labels, dimensions FROM assessment_templates WHERE id = $1 AND active`,
      [templateId],
    );
    const row = res.rows[0];
    return row ? { id: row.id, code: row.code, labels: row.labels, dimensions: row.dimensions } : null;
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


  /**
   * Place a remark on the work.
   *
   * The ordinal is assigned HERE, never accepted from the caller. It is
   * what the seeker taps and what a dispute cites, so two clients racing
   * must not both decide they are pin 4 — `MAX(ordinal) + 1` inside the
   * statement, with the unique constraint as the backstop if two arrive
   * at once.
   *
   * Whether the evaluation is still open is enforced by a trigger, not
   * checked here: after the work is returned the remarks are a record of
   * what the seeker read, and a service check is one forgotten call away
   * from not holding. `mustBeOpen` runs anyway so the caller gets the
   * typed error rather than the database's.
   */
  async addAnnotation(input: {
    evaluationId: string;
    page?: number;
    anchorX?: number | null;
    anchorY?: number | null;
    bodyText: string;
    bodyLang: string;
  }): Promise<AnnotationRow> {
    await this.mustBeOpen(input.evaluationId);

    const hasX = input.anchorX !== undefined && input.anchorX !== null;
    const hasY = input.anchorY !== undefined && input.anchorY !== null;
    if (hasX !== hasY) throw annotationAnchorIncomplete();

    const res = await this.pool.query<AnnotationDbRow>(
      `INSERT INTO evaluation_annotations
         (evaluation_id, ordinal, page, anchor_x, anchor_y, body_text, body_lang)
       VALUES (
         $1,
         (SELECT COALESCE(MAX(ordinal), 0) + 1 FROM evaluation_annotations WHERE evaluation_id = $1),
         $2, $3, $4, $5, $6
       )
       RETURNING *`,
      [
        input.evaluationId,
        input.page ?? 1,
        hasX ? input.anchorX : null,
        hasY ? input.anchorY : null,
        input.bodyText,
        input.bodyLang,
      ],
    );
    return mapAnnotation(res.rows[0]);
  }

  /**
   * Remove a remark before the work goes back.
   *
   * Ordinals are deliberately NOT renumbered afterwards. A gap in the
   * pins is honest — the alternative silently changes what "pin 4" refers
   * to for anyone who already had the page open, and pin numbers are
   * cited in disputes.
   */
  async removeAnnotation(annotationId: string): Promise<void> {
    const owner = await this.pool.query<{ evaluation_id: string }>(
      `SELECT evaluation_id FROM evaluation_annotations WHERE id = $1`,
      [annotationId],
    );
    if (!owner.rows[0]) throw annotationNotFound(annotationId);
    await this.mustBeOpen(owner.rows[0].evaluation_id);
    await this.pool.query(`DELETE FROM evaluation_annotations WHERE id = $1`, [annotationId]);
  }

  /** Which evaluation a remark belongs to, so access is checked on the owner. */
  async evaluationIdForAnnotation(annotationId: string): Promise<string> {
    const res = await this.pool.query<{ evaluation_id: string }>(
      `SELECT evaluation_id FROM evaluation_annotations WHERE id = $1`,
      [annotationId],
    );
    if (!res.rows[0]) throw annotationNotFound(annotationId);
    return res.rows[0].evaluation_id;
  }

  /** Who owns this evaluation — the controller's access check needs it. */
  async providerOf(evaluationId: string): Promise<string> {
    const res = await this.pool.query<{ provider_id: string }>(
      `SELECT provider_id FROM evaluations WHERE id = $1`,
      [evaluationId],
    );
    if (!res.rows[0]) throw evaluationNotFound(evaluationId);
    return res.rows[0].provider_id;
  }

  private async mustBeOpen(evaluationId: string): Promise<EvaluationDbRow> {
    const res = await this.pool.query<EvaluationDbRow>(`SELECT * FROM evaluations WHERE id = $1`, [evaluationId]);
    const evaluation = res.rows[0];
    if (!evaluation) throw evaluationNotFound(evaluationId);
    if (evaluation.returned_at) throw evaluationAlreadyReturned(evaluationId);
    return evaluation;
  }

  /**
   * Null is a real answer, not a missing one: an objective category has
   * no template and therefore nothing to annotate against (hard rule
   * #3). Callers get an empty list and must handle it — never assume a
   * template exists.
   */
  private async templateDimensions(templateId: string | null): Promise<TemplateDimension[]> {
    if (templateId === null) return [];
    const res = await this.pool.query<{ dimensions: TemplateDimension[] }>(
      `SELECT dimensions FROM assessment_templates WHERE id = $1`,
      [templateId],
    );
    return res.rows[0]?.dimensions ?? [];
  }

  private async hydrate(row: EvaluationDbRow): Promise<EvaluationRow> {
    const [scoresRes, dimensions, annotationsRes] = await Promise.all([
      this.pool.query<ScoreDbRow>(
        `SELECT dimension_code, score, comment FROM assessment_scores WHERE evaluation_id = $1`,
        [row.id],
      ),
      this.templateDimensions(row.template_id),
      this.pool.query<AnnotationDbRow>(
        `SELECT * FROM evaluation_annotations WHERE evaluation_id = $1 ORDER BY page, ordinal`,
        [row.id],
      ),
    ]);
    return {
      id: row.id,
      engagementId: row.engagement_id,
      submissionId: row.submission_id,
      providerId: row.provider_id,
      templateId: row.template_id,
      dimensions,
      annotatedRef: row.annotated_ref,
      overallNote: row.overall_note,
      returnedAt: row.returned_at,
      scores: scoresRes.rows.map((r) => ({ dimensionCode: r.dimension_code, score: Number(r.score), comment: r.comment })),
      annotations: annotationsRes.rows.map(mapAnnotation),
    };
  }
}
