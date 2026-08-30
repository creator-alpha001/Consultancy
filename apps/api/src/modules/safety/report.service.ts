import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { AuditService } from '../../common/audit/audit.service';
import { DomainLoaderService } from '../domains/domain-loader.service';
import {
  reportAlreadyOpen,
  reportAlreadyResolved,
  reportDomainRequired,
  reportNotFound,
  reportReasonUnknown,
  reportSelf,
  reportSubjectNotFound,
} from './errors';
import {
  RaiseReportInput,
  RaiseReportResult,
  ReportForReporter,
  ReportRow,
  ReportStatus,
  ReportSubjectType,
} from './types';

interface ReportDbRow {
  id: string;
  reporter_id: string;
  subject_type: ReportSubjectType;
  subject_id: string;
  subject_owner_id: string | null;
  family_code: string;
  reason_code: string;
  detail_original: string | null;
  detail_lang: string | null;
  status: ReportStatus;
  holds_content: boolean;
  resolved_by: string | null;
  resolved_at: Date | null;
  resolution_note: string | null;
  created_at: Date;
}

function mapReport(row: ReportDbRow): ReportRow {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    subjectOwnerId: row.subject_owner_id,
    familyCode: row.family_code,
    reasonCode: row.reason_code,
    detailOriginal: row.detail_original,
    detailLang: row.detail_lang,
    status: row.status,
    holdsContent: row.holds_content,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    resolutionNote: row.resolution_note,
    createdAt: row.created_at,
  };
}

/**
 * What the reporter is allowed to know about their own report.
 *
 * `actioned` and `dismissed` both collapse to `reviewed`. That is the
 * whole point: the reporter learns their report was looked at, and never
 * what happened to the other person — which is that person's record, and
 * telling one user about another's discipline is how a report button
 * becomes a way to confirm a hit.
 */
function forReporter(row: ReportDbRow): ReportForReporter {
  return {
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    reasonCode: row.reason_code,
    detailOriginal: row.detail_original,
    state: row.status === 'open' || row.status === 'reviewing' ? 'received' : 'reviewed',
    createdAt: row.created_at,
  };
}

/** Which subject types are content that can be held from public view. */
const HIDEABLE: ReadonlySet<ReportSubjectType> = new Set<ReportSubjectType>(['question', 'answer', 'review']);

interface ResolvedSubject {
  ownerId: string | null;
  /** Null where the subject carries no domain of its own — the caller supplies one. */
  domainCode: string | null;
}

/**
 * Reporting (TRACKER D45).
 *
 * Three decisions shape everything here, and none of them came from a
 * spec — they were settled with the product owner because CLAUDE.md says
 * to ask rather than invent on safety:
 *
 * 1. **Reported content is held immediately**, before any human looks.
 *    The same mechanism as a distress flag (#25), and reversible in
 *    minutes. A *person* is never auto-suspended and an engagement is
 *    never frozen — one report must not be able to stop someone else's
 *    paid work.
 * 2. **Everything is reportable**: a person, a piece of content, a
 *    session, an engagement.
 * 3. **The reporter is acknowledged, never told the outcome.**
 *
 * The reason codes come from the family manifest, so core knows none of
 * them and a new family needs no migration to declare its own.
 */
@Injectable()
export class ReportService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DomainLoaderService) private readonly loader: DomainLoaderService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * Finds who a subject belongs to and which domain it sits in.
   *
   * The owner is resolved HERE, from the subject, and never taken from
   * the client (#28) — a client-supplied owner would let anyone attach a
   * report to a person who had nothing to do with it.
   */
  private async resolveSubject(subjectType: ReportSubjectType, subjectId: string): Promise<ResolvedSubject> {
    switch (subjectType) {
      case 'user': {
        const res = await this.pool.query<{ id: string }>(`SELECT id FROM users WHERE id = $1`, [subjectId]);
        if (!res.rows[0]) throw reportSubjectNotFound(subjectType, subjectId);
        // A person is not in one domain — a seeker has many (hard rule
        // #6) — so the caller names the context they are reporting from.
        return { ownerId: subjectId, domainCode: null };
      }
      case 'question': {
        const res = await this.pool.query<{ seeker_id: string; domain_code: string }>(
          `SELECT seeker_id, domain_code FROM questions WHERE id = $1`,
          [subjectId],
        );
        if (!res.rows[0]) throw reportSubjectNotFound(subjectType, subjectId);
        return { ownerId: res.rows[0].seeker_id, domainCode: res.rows[0].domain_code };
      }
      case 'answer': {
        const res = await this.pool.query<{ provider_id: string; domain_code: string }>(
          `SELECT a.provider_id, q.domain_code
             FROM answers a JOIN questions q ON q.id = a.question_id
            WHERE a.id = $1`,
          [subjectId],
        );
        if (!res.rows[0]) throw reportSubjectNotFound(subjectType, subjectId);
        return { ownerId: res.rows[0].provider_id, domainCode: res.rows[0].domain_code };
      }
      case 'review': {
        // The owner is the review's AUTHOR, not its subject: reporting a
        // review is a complaint about what was written, and holding it
        // is a decision about the writer's words.
        const res = await this.pool.query<{ reviewer_id: string; domain_code: string | null }>(
          `SELECT r.reviewer_id, e.domain_code
             FROM reviews r JOIN engagements e ON e.id = r.engagement_id
            WHERE r.id = $1`,
          [subjectId],
        );
        if (!res.rows[0]) throw reportSubjectNotFound(subjectType, subjectId);
        return { ownerId: res.rows[0].reviewer_id, domainCode: res.rows[0].domain_code };
      }
      case 'session': {
        const res = await this.pool.query<{ domain_code: string | null }>(
          `SELECT e.domain_code FROM sessions s JOIN engagements e ON e.id = s.engagement_id WHERE s.id = $1`,
          [subjectId],
        );
        if (!res.rows[0]) throw reportSubjectNotFound(subjectType, subjectId);
        // A session has two parties and no single owner. Which one the
        // report is about is for the reviewer to establish from the
        // recording and transcript, not for the reporter to assert.
        return { ownerId: null, domainCode: res.rows[0].domain_code };
      }
      case 'engagement': {
        const res = await this.pool.query<{ domain_code: string | null }>(
          `SELECT domain_code FROM engagements WHERE id = $1`,
          [subjectId],
        );
        if (!res.rows[0]) throw reportSubjectNotFound(subjectType, subjectId);
        return { ownerId: null, domainCode: res.rows[0].domain_code };
      }
    }
  }

  async raise(input: RaiseReportInput & { domainCode?: string }): Promise<RaiseReportResult> {
    const subject = await this.resolveSubject(input.subjectType, input.subjectId);

    if (subject.ownerId === input.reporterId) throw reportSelf();

    // The subject's own domain wins; the caller's hint fills in where a
    // subject has none of its own.
    const domainCode = subject.domainCode ?? input.domainCode;
    if (!domainCode) throw reportDomainRequired(input.subjectType);

    const domain = await this.loader.getDomain(domainCode);
    const reason = domain.family.reportReasons.find((r) => r.code === input.reasonCode);
    if (!reason) {
      throw reportReasonUnknown(
        domain.familyCode,
        input.reasonCode,
        domain.family.reportReasons.map((r) => r.code),
      );
    }

    // A welfare concern is a worry FOR someone, not a complaint about
    // them. Holding their post because a stranger was worried would
    // punish them for being unwell — the opposite of #24-#26.
    const shouldHold = HIDEABLE.has(input.subjectType) && reason.isWelfareConcern !== true;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const inserted = await client.query<ReportDbRow>(
        `INSERT INTO reports
           (reporter_id, subject_type, subject_id, subject_owner_id, family_code, reason_code,
            detail_original, detail_lang, holds_content)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (reporter_id, subject_type, subject_id) WHERE status IN ('open', 'reviewing') DO NOTHING
         RETURNING *`,
        [
          input.reporterId,
          input.subjectType,
          input.subjectId,
          subject.ownerId,
          domain.familyCode,
          input.reasonCode,
          input.detailOriginal ?? null,
          input.detailLang ?? null,
          shouldHold,
        ],
      );
      if (!inserted.rows[0]) {
        await client.query('ROLLBACK');
        throw reportAlreadyOpen(input.subjectType, input.subjectId);
      }
      const row = inserted.rows[0];

      if (shouldHold) await this.holdContent(client, input.subjectType, input.subjectId);

      // The reporter's identity is in the log, because a pattern of
      // reports from one account is itself a safety signal — but it is
      // never in any response the reported party can reach.
      await this.audit.recordIn(client, {
        actorId: input.reporterId,
        action: 'report.raised',
        subjectType: `report:${input.subjectType}`,
        subjectId: row.id,
        detail: {
          reportedSubjectId: input.subjectId,
          reasonCode: input.reasonCode,
          contentHeld: shouldHold,
          welfareConcern: reason.isWelfareConcern === true,
        },
      });

      await client.query('COMMIT');
      return {
        report: forReporter(row),
        contentHeld: shouldHold,
        ...(reason.isWelfareConcern === true ? { supportResources: domain.family.supportResources } : {}),
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Puts content out of public view.
   *
   * Questions already had `held_for_review` — the classifier's hold,
   * arrived at from the other direction — so a reported question reuses
   * it rather than inventing a second vocabulary for the same state.
   * An already-held question is left alone.
   */
  private async holdContent(client: PoolClient, subjectType: ReportSubjectType, subjectId: string): Promise<void> {
    if (subjectType === 'question') {
      await client.query(
        `UPDATE questions SET status = 'held_for_review' WHERE id = $1 AND status IN ('published', 'answered')`,
        [subjectId],
      );
    } else if (subjectType === 'answer' || subjectType === 'review') {
      // Beside the row, never on it: `reviews` is append-only, and a
      // hold is a fact about a row rather than a change to it.
      await client.query(
        `INSERT INTO content_holds (subject_type, subject_id) VALUES ($1, $2)
         ON CONFLICT (subject_type, subject_id) DO NOTHING`,
        [subjectType, subjectId],
      );
    }
  }

  /**
   * Returns content to public view — but only when no OTHER live report
   * is still holding it. Two people reporting the same post is common,
   * and dismissing one of them must not undo the other's hold.
   */
  private async releaseContentIfNoOtherHold(
    client: PoolClient,
    report: ReportDbRow,
  ): Promise<boolean> {
    const others = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM reports
        WHERE subject_type = $1 AND subject_id = $2 AND id <> $3
          AND holds_content AND status IN ('open', 'reviewing')`,
      [report.subject_type, report.subject_id, report.id],
    );
    if (Number(others.rows[0].n) > 0) return false;

    if (report.subject_type === 'question') {
      await client.query(
        `UPDATE questions SET status = 'published' WHERE id = $1 AND status = 'held_for_review'`,
        [report.subject_id],
      );
    } else if (report.subject_type === 'answer' || report.subject_type === 'review') {
      await client.query(`DELETE FROM content_holds WHERE subject_type = $1 AND subject_id = $2`, [
        report.subject_type,
        report.subject_id,
      ]);
    }
    return true;
  }

  /** The reporter's own reports. Scoped to the caller — there is no "whose?" parameter (#28). */
  async listForReporter(reporterId: string): Promise<ReportForReporter[]> {
    const res = await this.pool.query<ReportDbRow>(
      `SELECT * FROM reports WHERE reporter_id = $1 ORDER BY created_at DESC`,
      [reporterId],
    );
    return res.rows.map(forReporter);
  }

  /**
   * The reviewer queue.
   *
   * Welfare concerns first, then oldest first. A person someone is
   * worried about waits behind nobody; everything else is a plain
   * queue, because "most reported" would let a pile-on set the order.
   */
  async listQueue(familyCodeFilter?: string): Promise<Array<ReportRow & { welfareConcern: boolean }>> {
    const res = await this.pool.query<ReportDbRow & { welfare: boolean }>(
      `SELECT r.*,
              COALESCE((
                SELECT (reason->>'isWelfareConcern')::boolean
                  FROM domain_families f,
                       LATERAL jsonb_array_elements(COALESCE(f.manifest->'reportReasons', '[]'::jsonb)) AS reason
                 WHERE f.code = r.family_code AND reason->>'code' = r.reason_code
              ), false) AS welfare
         FROM reports r
        WHERE r.status IN ('open', 'reviewing')
          AND ($1::text IS NULL OR r.family_code = $1)
        ORDER BY welfare DESC, r.created_at ASC`,
      [familyCodeFilter ?? null],
    );
    return res.rows.map((row) => ({ ...mapReport(row), welfareConcern: row.welfare === true }));
  }

  async get(id: string): Promise<ReportRow> {
    const res = await this.pool.query<ReportDbRow>(`SELECT * FROM reports WHERE id = $1`, [id]);
    if (!res.rows[0]) throw reportNotFound(id);
    return mapReport(res.rows[0]);
  }

  /** Claims a report for review, so two reviewers do not work the same one. */
  async claim(id: string, reviewerId: string): Promise<ReportRow> {
    const res = await this.pool.query<ReportDbRow>(
      `UPDATE reports SET status = 'reviewing' WHERE id = $1 AND status = 'open' RETURNING *`,
      [id],
    );
    if (!res.rows[0]) {
      const current = await this.get(id);
      if (current.status === 'reviewing') return current;
      throw reportAlreadyResolved(id, current.status);
    }
    await this.audit.record({
      actorId: reviewerId,
      actorRole: 'admin',
      action: 'report.claimed',
      subjectType: `report:${res.rows[0].subject_type}`,
      subjectId: id,
      detail: {},
    });
    return mapReport(res.rows[0]);
  }

  /**
   * A human decides. `actioned` keeps any hold in place — the content
   * stays down; `dismissed` releases it, which is what makes the
   * hold-first policy safe to have.
   *
   * AI never gets here: #18's rule about disputes applies with more
   * force to a safety call, and nothing in this module is automated
   * beyond the initial hold.
   */
  async resolve(input: {
    reportId: string;
    reviewerId: string;
    decision: 'actioned' | 'dismissed';
    note: string;
  }): Promise<ReportRow> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query<ReportDbRow>(`SELECT * FROM reports WHERE id = $1 FOR UPDATE`, [input.reportId]);
      const report = res.rows[0];
      if (!report) throw reportNotFound(input.reportId);
      if (report.status === 'actioned' || report.status === 'dismissed') {
        throw reportAlreadyResolved(report.id, report.status);
      }

      let released = false;
      if (input.decision === 'dismissed' && report.holds_content) {
        released = await this.releaseContentIfNoOtherHold(client, report);
      }

      const updated = await client.query<ReportDbRow>(
        `UPDATE reports
            SET status = $2::report_status, resolved_by = $3, resolved_at = now(), resolution_note = $4,
                holds_content = CASE WHEN $2::text = 'dismissed' THEN false ELSE holds_content END
          WHERE id = $1
          RETURNING *`,
        [report.id, input.decision, input.reviewerId, input.note],
      );

      await this.audit.recordIn(client, {
        actorId: input.reviewerId,
        actorRole: 'admin',
        action: input.decision === 'actioned' ? 'report.actioned' : 'report.dismissed',
        subjectType: `report:${report.subject_type}`,
        subjectId: report.id,
        detail: {
          reportedSubjectId: report.subject_id,
          reasonCode: report.reason_code,
          contentReleased: released,
          note: input.note,
        },
      });

      await client.query('COMMIT');
      return mapReport(updated.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
