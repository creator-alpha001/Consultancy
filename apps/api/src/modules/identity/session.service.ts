import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import {
  accountNotActive,
  adultConfirmationRequired,
  mfaNotEnrolled,
  mfaRequired,
} from './errors';
import { Actor, SessionRow, SessionScope, UserRole } from './types';

/** Postgres SQLSTATE the session-precondition trigger raises with. */
const INTEGRITY_CONSTRAINT_VIOLATION = '23000';

interface SessionDbRow {
  id: string;
  user_id: string;
  scope: SessionScope;
  mfa_satisfied: boolean;
  issued_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
}

function mapSession(row: SessionDbRow): SessionRow {
  return {
    id: row.id,
    userId: row.user_id,
    scope: row.scope,
    mfaSatisfied: row.mfa_satisfied,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

/** The token the client holds is never stored; only this digest is. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * How long a session lives, by role: an ABSOLUTE limit from sign-in, and
 * an IDLE limit since it was last used (TRACKER D20).
 *
 * An admin console holds refunds, rulings and verification decisions,
 * and is often open on a shared office machine — so it expires fast and
 * after half an hour untouched. A seeker or provider is on their own
 * phone, where being signed out daily (and, for a provider, re-entering
 * an authenticator code) is a cost with little protection behind it.
 *
 * These are policy defaults, not settled numbers; they live here, in one
 * place, so changing them is a one-line decision.
 */
export const SESSION_POLICY = {
  admin: { absolute: '12 hours', idle: '30 minutes' },
  provider: { absolute: '30 days', idle: '7 days' },
  seeker: { absolute: '30 days', idle: '7 days' },
} as const;

/** How stale `last_seen_at` may get before a request refreshes it — one write a minute, not one per request. */
const TOUCH_AFTER = '1 minute';

/** Minutes, not hours: an enrolment ticket is a bootstrap, not a login. */
const ENROLMENT_TTL_MINUTES = 10;

/**
 * Opaque server-side sessions. The bearer token is 32 random bytes,
 * returned to the caller exactly once and stored only as a SHA-256
 * digest — so a dump of `user_sessions` yields no usable credential.
 *
 * The mandatory-2FA and 18+ preconditions are NOT checked here. They are
 * enforced by 0026's trigger, on the row, so that every path that could
 * ever create a session goes through them — including one written years
 * from now by someone who never read this file.
 */
@Injectable()
export class SessionService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(input: {
    userId: string;
    mfaSatisfied: boolean;
    scope?: SessionScope;
    userAgent?: string;
    ipPrefix?: string;
  }): Promise<{ token: string; session: SessionRow }> {
    const scope: SessionScope = input.scope ?? 'full';
    const token = randomBytes(32).toString('base64url');
    const roleRes = await this.pool.query<{ role: UserRole }>(`SELECT role FROM users WHERE id = $1`, [input.userId]);
    const role = roleRes.rows[0]?.role ?? 'admin'; // unknown → the strictest; the insert then fails on the FK anyway
    const ttl = scope === 'mfa_enrolment'
      ? `${ENROLMENT_TTL_MINUTES} minutes`
      : SESSION_POLICY[role].absolute;

    let res;
    try {
      res = await this.pool.query<SessionDbRow>(
        `INSERT INTO user_sessions (user_id, token_hash, mfa_satisfied, scope, expires_at, user_agent, ip_prefix)
         VALUES ($1, $2, $3, $4::session_scope, now() + $5::interval, $6, $7)
         RETURNING *`,
        [
          input.userId,
          hashToken(token),
          input.mfaSatisfied,
          scope,
          ttl,
          input.userAgent ?? null,
          input.ipPrefix ?? null,
        ],
      );
    } catch (err) {
      throw translatePreconditionFailure(err);
    }
    return { token, session: mapSession(res.rows[0]) };
  }

  /**
   * Resolves a bearer token to the actor it belongs to, or null. The role
   * comes from the database on every request, never from the token: a
   * user demoted from admin a moment ago must not keep acting as one for
   * the life of their session.
   */
  async resolveActor(token: string): Promise<Actor | null> {
    const res = await this.pool.query<{
      session_id: string;
      user_id: string;
      role: UserRole;
      scope: SessionScope;
      mfa_satisfied: boolean;
      needs_touch: boolean;
    }>(
      `SELECT s.id AS session_id, s.user_id, u.role, s.scope, s.mfa_satisfied,
              (s.last_seen_at < now() - $5::interval) AS needs_touch
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
          AND u.status = 'active'
          AND s.last_seen_at > now() - (CASE u.role
                WHEN 'admin' THEN $2::interval
                WHEN 'provider' THEN $3::interval
                ELSE $4::interval END)`,
      [hashToken(token), SESSION_POLICY.admin.idle, SESSION_POLICY.provider.idle, SESSION_POLICY.seeker.idle, TOUCH_AFTER],
    );
    const row = res.rows[0];
    if (!row) return null;
    if (row.needs_touch) {
      await this.pool.query(`UPDATE user_sessions SET last_seen_at = now() WHERE id = $1`, [row.session_id]);
    }
    return {
      userId: row.user_id,
      role: row.role,
      sessionId: row.session_id,
      scope: row.scope,
      mfaSatisfied: row.mfa_satisfied,
    };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE user_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`,
      [sessionId],
    );
  }

  /** "Sign out everywhere" — and the first thing to do on a suspected compromise. */
  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<number> {
    const res = await this.pool.query(
      `UPDATE user_sessions
          SET revoked_at = now()
        WHERE user_id = $1
          AND revoked_at IS NULL
          AND ($2::uuid IS NULL OR id <> $2::uuid)`,
      [userId, exceptSessionId ?? null],
    );
    return res.rowCount ?? 0;
  }

  async listActiveForUser(userId: string): Promise<SessionRow[]> {
    const res = await this.pool.query<SessionDbRow>(
      `SELECT * FROM user_sessions
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
          AND scope = 'full'
        ORDER BY issued_at DESC`,
      [userId],
    );
    return res.rows.map(mapSession);
  }
}

/**
 * Turns `check_session_preconditions`'s refusals into the typed errors
 * the rest of identity/ already raises.
 *
 * The trigger is the authority on who may hold a session — that is the
 * point of enforcing #27 and #32 in the database rather than in a service
 * anyone could forget to call. But it speaks in Postgres exceptions, and
 * an uncaught one becomes a 500. A brand-new admin seeded without
 * `adult_confirmed_at` therefore got "an unexpected error occurred" on
 * every login attempt, when the system knew exactly what was wrong.
 *
 * Translated HERE rather than in `login()` so every caller is covered:
 * a pre-check in one handler leaves the others exposed and races the
 * trigger anyway — the row can change between the check and the insert.
 *
 * Anything unrecognised is rethrown untouched. A translation layer that
 * swallowed unknown database errors would turn real bugs into tidy 4xx
 * responses, which is worse than the 500 this exists to remove.
 */
function translatePreconditionFailure(err: unknown): unknown {
  const e = err as { code?: string; message?: string };
  if (e?.code !== INTEGRITY_CONSTRAINT_VIOLATION || typeof e.message !== 'string') return err;

  if (e.message.includes('has not confirmed they are 18+')) {
    return adultConfirmationRequired();
  }
  if (e.message.includes('a second factor is mandatory')) {
    return mfaRequired();
  }
  if (e.message.includes('no confirmed second factor enrolled')) {
    return mfaNotEnrolled('this account');
  }
  const status = /user \S+ is (suspended|deactivated)/.exec(e.message);
  if (status) return accountNotActive(status[1]);

  return err;
}
