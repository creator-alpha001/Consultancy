import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { displayNameFor } from '../../common/display-name';
import { Roles } from '../identity/auth.guard';

export interface FeeScheduleView {
  currency: string;
  /** The rate in force now, read through `fee_schedule_at` — the only sanctioned way (hard rule #8). Null when nothing covers now. */
  current: { platformFeeBps: number; effectiveFrom: string; effectiveTo: string | null } | null;
  /** Every schedule for the currency, oldest first. For reading history — never for choosing a rate. */
  history: Array<{ platformFeeBps: number; effectiveFrom: string; effectiveTo: string | null; createdAt: string }>;
}

export interface AuditEntryView {
  id: string;
  createdAt: string;
  actorRole: string | null;
  /** A person's display name, or null when the platform itself acted. Never an email. */
  actorName: string | null;
  action: string;
  subjectType: string;
  subjectId: string | null;
  detail: Record<string, unknown>;
}

const MAX_AUDIT_PAGE = 200;

/**
 * Read-only views the operations console needs and did not have.
 *
 * The web configuration page used to show a hardcoded fee table and a
 * made-up audit log with named reviewers, because nothing here served the
 * real ones. Both are now read from the source of truth. Neither route
 * writes anything: a fee change is a new effective-dated schedule and the
 * audit log is append-only by trigger — there is deliberately no "edit".
 */
@Controller('admin')
@Roles('admin')
export class OpsReadController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get('fee-schedules')
  async feeSchedules(): Promise<FeeScheduleView[]> {
    const [rows, currencies] = await Promise.all([
      this.pool.query<{
        currency: string;
        platform_fee_bps: number;
        effective_from: Date;
        effective_to: Date | null;
        created_at: Date;
      }>(
        `SELECT currency, platform_fee_bps, effective_from, effective_to, created_at
           FROM fee_schedules ORDER BY currency, effective_from`,
      ),
      this.pool.query<{ currency: string; platform_fee_bps: number | null; effective_from: Date | null; effective_to: Date | null }>(
        `SELECT c.currency, f.platform_fee_bps, f.effective_from, f.effective_to
           FROM (SELECT DISTINCT currency FROM fee_schedules) c
           CROSS JOIN LATERAL fee_schedule_at(c.currency, now()) f
          ORDER BY c.currency`,
      ),
    ]);
    return currencies.rows.map((c) => ({
      currency: c.currency,
      current:
        c.platform_fee_bps === null || c.effective_from === null
          ? null
          : {
              platformFeeBps: c.platform_fee_bps,
              effectiveFrom: c.effective_from.toISOString(),
              effectiveTo: c.effective_to?.toISOString() ?? null,
            },
      history: rows.rows
        .filter((r) => r.currency === c.currency)
        .map((r) => ({
          platformFeeBps: r.platform_fee_bps,
          effectiveFrom: r.effective_from.toISOString(),
          effectiveTo: r.effective_to?.toISOString() ?? null,
          createdAt: r.created_at.toISOString(),
        })),
    }));
  }

  /** Newest first. `before` pages backwards from an entry's timestamp. */
  @Get('audit-log')
  async auditLog(
    @Query('limit') limitRaw?: string,
    @Query('before') before?: string,
    @Query('subjectType') subjectType?: string,
  ): Promise<AuditEntryView[]> {
    const limit = Math.min(Math.max(Number(limitRaw) || 50, 1), MAX_AUDIT_PAGE);
    const beforeTs = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : null;
    const res = await this.pool.query<{
      id: string;
      created_at: Date;
      actor_role: string | null;
      email: string | null;
      display_name: string | null;
      action: string;
      subject_type: string;
      subject_id: string | null;
      detail: Record<string, unknown>;
    }>(
      `SELECT a.id, a.created_at, a.actor_role, u.email, u.display_name,
              a.action, a.subject_type, a.subject_id, a.detail
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.actor_id
        WHERE ($1::timestamptz IS NULL OR a.created_at < $1)
          AND ($2::text IS NULL OR a.subject_type = $2)
        ORDER BY a.created_at DESC
        LIMIT $3`,
      [beforeTs, subjectType ?? null, limit],
    );
    return res.rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at.toISOString(),
      actorRole: r.actor_role,
      actorName: r.email ? displayNameFor(r.email, r.display_name) : null,
      action: r.action,
      subjectType: r.subject_type,
      subjectId: r.subject_id,
      detail: r.detail,
    }));
  }
}
