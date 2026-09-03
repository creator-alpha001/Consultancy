import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { UserRole } from './types';

/**
 * Which roles must satisfy a second factor to hold a full session.
 *
 * CLAUDE.md #32 named provider and admin, and both this service's caller
 * and the `check_session_preconditions` trigger used to say so literally.
 * The role set now lives in the `mfa_policy` table (migration 0039) so it
 * can be changed without a deploy — and, more importantly, so the two
 * enforcement points cannot drift apart, because they read the same row.
 *
 * The trigger is still what makes the rule TRUE; this service exists so
 * that login can fail with a friendly typed error before the database
 * has to refuse an INSERT. If they ever disagree, the database wins.
 *
 * A role with no row falls back to the original hardcoded rule. That is
 * deliberate: the failure mode of a missing row must be "still required".
 */
@Injectable()
export class MfaPolicyService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async isMandatoryFor(role: UserRole): Promise<boolean> {
    const { rows } = await this.pool.query<{ mandatory: boolean }>(
      `SELECT mandatory FROM mfa_policy WHERE role = $1`,
      [role],
    );
    if (rows.length === 0) return role === 'provider' || role === 'admin';
    return rows[0].mandatory;
  }
}
