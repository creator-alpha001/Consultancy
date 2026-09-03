import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { AppError } from '../../common/errors/app-error';
import { PG_POOL } from '../../database/db.module';

export interface DimensionTrend {
  dimensionCode: string;
  labels: Record<string, string>;
  /** Oldest first — a trend read backwards is not a trend. */
  points: Array<{ engagementId: string; score: number; at: Date }>;
  first: number;
  latest: number;
  /** latest − first. Positive is improvement; the sign is the whole point. */
  change: number;
}

export interface ActionItem {
  annotationId: string;
  engagementId: string;
  ordinal: number;
  bodyText: string;
  bodyLang: string;
  returnedAt: Date;
  doneAt: Date | null;
}

export interface SeekerProgress {
  /** Only dimensions scored at least twice — one point is not a trend. */
  trends: DimensionTrend[];
  evaluationsReturned: number;
  actionItems: ActionItem[];
}

/**
 * A seeker's own progress, and the things they were told to work on.
 *
 * The rule this file exists under is CLAUDE.md #17 and #24: progress
 * compares someone to their OWN earlier work and to nothing else. There
 * is no percentile here, no rank, no comparison to other aspirants, and
 * no streak — this population has a documented mental-health crisis, and
 * a product that turned an unfinished list into a broken streak would be
 * actively harmful rather than merely tacky.
 *
 * What it does instead is the honest version of the same motivation: your
 * structure score went from 11 to 14, and here are the four things your
 * reviewers actually asked you to change.
 */
@Injectable()
export class ProgressService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async forSeeker(seekerId: string): Promise<SeekerProgress> {
    const scores = await this.pool.query<{
      dimension_code: string;
      score: string;
      engagement_id: string;
      returned_at: Date;
      dimensions: Array<{ code: string; labels: Record<string, string> }> | null;
    }>(
      `SELECT s.dimension_code, s.score::text, ev.engagement_id, ev.returned_at,
              at.dimensions
         FROM assessment_scores s
         JOIN evaluations ev ON ev.id = s.evaluation_id
         JOIN engagements e ON e.id = ev.engagement_id
         LEFT JOIN assessment_templates at ON at.id = ev.template_id
        WHERE e.seeker_id = $1 AND ev.returned_at IS NOT NULL
        ORDER BY ev.returned_at ASC`,
      [seekerId],
    );

    const byDimension = new Map<string, DimensionTrend>();
    for (const row of scores.rows) {
      const labels =
        row.dimensions?.find((d) => d.code === row.dimension_code)?.labels ?? {
          en: row.dimension_code.replace(/_/g, ' '),
        };
      let trend = byDimension.get(row.dimension_code);
      if (!trend) {
        trend = {
          dimensionCode: row.dimension_code,
          labels,
          points: [],
          first: 0,
          latest: 0,
          change: 0,
        };
        byDimension.set(row.dimension_code, trend);
      }
      trend.points.push({
        engagementId: row.engagement_id,
        score: Number(row.score),
        at: row.returned_at,
      });
    }

    const trends = [...byDimension.values()]
      // One score is a mark, not a trend. Showing a single point with an
      // arrow beside it would invent a direction from no evidence.
      .filter((t) => t.points.length >= 2)
      .map((t) => {
        const first = t.points[0].score;
        const latest = t.points[t.points.length - 1].score;
        return { ...t, first, latest, change: Number((latest - first).toFixed(2)) };
      });

    const actions = await this.pool.query<{
      annotation_id: string;
      engagement_id: string;
      ordinal: number;
      body_text: string;
      body_lang: string;
      returned_at: Date;
      done_at: Date | null;
    }>(
      `SELECT a.id AS annotation_id, ev.engagement_id, a.ordinal, a.body_text, a.body_lang,
              ev.returned_at, act.done_at
         FROM evaluation_annotations a
         JOIN evaluations ev ON ev.id = a.evaluation_id
         JOIN engagements e ON e.id = ev.engagement_id
         LEFT JOIN annotation_actions act
                ON act.annotation_id = a.id AND act.seeker_id = $1
        WHERE e.seeker_id = $1 AND ev.returned_at IS NOT NULL
        -- Unfinished first, then newest. What is still to do is what
        -- someone opened this page for.
        ORDER BY act.done_at NULLS FIRST, ev.returned_at DESC, a.ordinal`,
      [seekerId],
    );

    return {
      trends,
      evaluationsReturned: new Set(scores.rows.map((r) => r.engagement_id)).size,
      actionItems: actions.rows.map((r) => ({
        annotationId: r.annotation_id,
        engagementId: r.engagement_id,
        ordinal: Number(r.ordinal),
        bodyText: r.body_text,
        bodyLang: r.body_lang,
        returnedAt: r.returned_at,
        doneAt: r.done_at,
      })),
    };
  }

  /**
   * Tick, or un-tick, one thing you were asked to work on.
   *
   * Reversible on purpose. Someone who marks a thing done and then
   * realises they have not done it must be able to say so — a one-way
   * tick makes the list lie, and a list that lies stops being used.
   *
   * Whether this seeker may touch this annotation at all is a trigger's
   * decision, not this method's: it is a rule about whose work it is.
   */
  async setActionDone(input: {
    annotationId: string;
    seekerId: string;
    done: boolean;
  }): Promise<{ doneAt: Date | null }> {
    try {
      const res = await this.pool.query<{ done_at: Date | null }>(
        `INSERT INTO annotation_actions (annotation_id, seeker_id, done_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (annotation_id, seeker_id)
         DO UPDATE SET done_at = EXCLUDED.done_at
         RETURNING done_at`,
        [input.annotationId, input.seekerId, input.done ? new Date() : null],
      );
      return { doneAt: res.rows[0].done_at };
    } catch (err) {
      const e = err as { code?: string; message?: string };
      if (e?.code === '23000' && typeof e.message === 'string') {
        // 404 rather than 403 — an annotation id is not confirmed to
        // someone whose work it is not (#28).
        throw new AppError('ANNOTATION_NOT_FOUND', 'no such remark on your work', {
          status: HttpStatus.NOT_FOUND,
        });
      }
      throw err;
    }
  }
}
