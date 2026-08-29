import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { DomainLoaderService } from '../domains/domain-loader.service';
import { ScreeningService } from '../safety/screening.service';
import { AuditService } from '../../common/audit/audit.service';
import { questionNotFound, questionQuotaExceeded } from './errors';
import { AnswerRow, AskQuestionInput, AskQuestionResult, QuestionRow } from './types';

interface QuestionDbRow {
  id: string;
  seeker_id: string;
  domain_code: string;
  category_id: string | null;
  body_original: string;
  body_lang: string;
  status: QuestionRow['status'];
  distress_flagged: boolean;
  screening_reasons: unknown;
}

interface AnswerDbRow {
  id: string;
  question_id: string;
  provider_id: string;
  body: string;
}

function mapQuestion(row: QuestionDbRow): QuestionRow {
  return {
    id: row.id,
    seekerId: row.seeker_id,
    domainCode: row.domain_code,
    categoryId: row.category_id,
    bodyOriginal: row.body_original,
    bodyLang: row.body_lang,
    status: row.status,
    distressFlagged: row.distress_flagged,
  };
}

/**
 * CLAUDE.md hard rules #25/#26 and "things you must not do — auto-
 * publish content a screening classifier flagged": a flagged question
 * is held, never rejected outright, and a distress flag answers with
 * the family's real helplines rather than any kind of moderation
 * message.
 */
@Injectable()
export class QuestionService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DomainLoaderService) private readonly loader: DomainLoaderService,
    @Inject(ScreeningService) private readonly screening: ScreeningService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async ask(input: AskQuestionInput): Promise<AskQuestionResult> {
    const domain = await this.loader.getDomain(input.domainCode);
    const quota = domain.policy.freeQuestionsPerDay;
    const countRes = await this.pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM questions WHERE seeker_id = $1 AND created_at >= date_trunc('day', now())`,
      [input.seekerId],
    );
    if (Number(countRes.rows[0].n) >= quota) {
      throw questionQuotaExceeded(input.seekerId, quota);
    }

    const screened = this.screening.screenText(input.bodyOriginal);
    const status: QuestionRow['status'] = screened.flagged ? 'held_for_review' : 'published';

    const res = await this.pool.query<QuestionDbRow>(
      `INSERT INTO questions (seeker_id, domain_code, category_id, body_original, body_lang, status, distress_flagged, screening_reasons)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING *`,
      [
        input.seekerId,
        input.domainCode,
        input.categoryId ?? null,
        input.bodyOriginal,
        input.bodyLang,
        status,
        screened.reasons.some((r) => this.screening.isDistressReason(r)),
        JSON.stringify(screened.reasons),
      ],
    );
    const question = mapQuestion(res.rows[0]);

    return {
      question,
      heldForReview: screened.flagged,
      supportResources: question.distressFlagged ? domain.family.supportResources : undefined,
    };
  }

  async get(id: string): Promise<QuestionRow> {
    const res = await this.pool.query<QuestionDbRow>(`SELECT * FROM questions WHERE id = $1`, [id]);
    if (!res.rows[0]) throw questionNotFound(id);
    return mapQuestion(res.rows[0]);
  }

  async listPublished(domainCode: string): Promise<QuestionRow[]> {
    const res = await this.pool.query<QuestionDbRow>(
      `SELECT * FROM questions WHERE domain_code = $1 AND status IN ('published', 'answered') ORDER BY created_at DESC`,
      [domainCode],
    );
    return res.rows.map(mapQuestion);
  }

  /** Ops/reviewer queue — never surfaced to the public. */
  async listHeldForReview(): Promise<QuestionRow[]> {
    const res = await this.pool.query<QuestionDbRow>(
      `SELECT * FROM questions WHERE status = 'held_for_review' ORDER BY created_at ASC`,
    );
    return res.rows.map(mapQuestion);
  }

  /**
   * A reviewer overriding the screening classifier and publishing held
   * content (#25). Audited because it is the one moderation decision a
   * person can make that the classifier disagreed with: if held content
   * later turns out to have been harmful, the question asked is who
   * released it and when.
   */
  async clearForReview(
    questionId: string,
    actor?: { actorId?: string | null; actorRole?: string | null },
  ): Promise<QuestionRow> {
    const res = await this.pool.query<QuestionDbRow>(
      `UPDATE questions SET status = 'published' WHERE id = $1 AND status = 'held_for_review' RETURNING *`,
      [questionId],
    );
    if (!res.rows[0]) throw questionNotFound(questionId);
    await this.audit.record({
      actorId: actor?.actorId ?? null,
      actorRole: actor?.actorRole ?? null,
      action: 'moderation.cleared',
      subjectType: 'question',
      subjectId: questionId,
      // The body itself is deliberately not copied here: the question
      // row still holds it, and duplicating held content into a log
      // read by more people is the opposite of what #25 asks for.
      detail: {
        distressFlagged: res.rows[0].distress_flagged,
        screeningReasons: res.rows[0].screening_reasons ?? [],
      },
    });
    return mapQuestion(res.rows[0]);
  }

  async answer(questionId: string, providerId: string, body: string): Promise<AnswerRow> {
    const res = await this.pool.query<AnswerDbRow>(
      `INSERT INTO answers (question_id, provider_id, body) VALUES ($1, $2, $3) RETURNING *`,
      [questionId, providerId, body],
    );
    const row = res.rows[0];
    return { id: row.id, questionId: row.question_id, providerId: row.provider_id, body: row.body };
  }
}
