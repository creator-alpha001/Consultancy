import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { forbiddenRole } from '../identity/errors';
import { Actor } from '../identity/types';
import { engagementNotFound } from './errors';

/**
 * CLAUDE.md #28: "Never trust a client-supplied user ID. Scope every
 * query by the authenticated actor."
 *
 * Every service in this codebase takes ids and trusts them — correct for
 * a service layer, dangerous the moment those ids arrive over HTTP from
 * whoever asked. This is the one place that turns "an engagement id" into
 * "an engagement id this actor is actually allowed to touch," so no
 * controller has to remember to.
 *
 * An admin passes: they adjudicate disputes and run ops. Anyone else must
 * be a party to the engagement itself.
 */
@Injectable()
export class EngagementAccessService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Throws unless the actor is a party to this engagement (or an admin). */
  async assertParty(engagementId: string, actor: Actor): Promise<{ seekerId: string; providerId: string }> {
    const res = await this.pool.query<{ seeker_id: string; provider_id: string }>(
      `SELECT seeker_id, provider_id FROM engagements WHERE id = $1`,
      [engagementId],
    );
    const row = res.rows[0];
    // A missing engagement and one belonging to someone else return the
    // SAME error on purpose: "not found" must not become a probe for
    // which engagement ids exist.
    if (!row) throw engagementNotFound(engagementId);

    if (actor.role !== 'admin' && actor.userId !== row.seeker_id && actor.userId !== row.provider_id) {
      throw engagementNotFound(engagementId);
    }
    return { seekerId: row.seeker_id, providerId: row.provider_id };
  }

  /** Throws unless the actor is specifically the seeker on this engagement. */
  async assertSeeker(engagementId: string, actor: Actor): Promise<void> {
    const { seekerId } = await this.assertParty(engagementId, actor);
    if (actor.role !== 'admin' && actor.userId !== seekerId) {
      throw forbiddenRole(['the seeker on this engagement'], actor.role);
    }
  }

  /** Throws unless the actor is specifically the provider on this engagement. */
  async assertProvider(engagementId: string, actor: Actor): Promise<void> {
    const { providerId } = await this.assertParty(engagementId, actor);
    if (actor.role !== 'admin' && actor.userId !== providerId) {
      throw forbiddenRole(['the provider on this engagement'], actor.role);
    }
  }

  /** Engagements this actor is a party to, newest first. Uses 0028's indexes. */
  async listForActor(actor: Actor, opts: { status?: string; limit?: number } = {}): Promise<unknown[]> {
    const params: unknown[] = [actor.userId];
    let statusClause = '';
    if (opts.status) {
      params.push(opts.status);
      statusClause = ` AND status = $${params.length}::engagement_status`;
    }
    params.push(Math.min(opts.limit ?? 50, 200));

    const res = await this.pool.query(
      `SELECT id, seeker_id AS "seekerId", provider_id AS "providerId", domain_code AS "domainCode",
              category_id AS "categoryId", engagement_type AS "engagementType", status,
              amount_paise AS "amountPaise", currency, language, created_at AS "createdAt"
         FROM engagements
        WHERE (seeker_id = $1 OR provider_id = $1)${statusClause}
        ORDER BY created_at DESC
        LIMIT $${params.length}`,
      params,
    );
    return res.rows;
  }
}
