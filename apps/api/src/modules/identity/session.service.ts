import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { Actor, SessionRow, UserRole } from './types';

interface SessionDbRow {
  id: string;
  user_id: string;
  mfa_satisfied: boolean;
  issued_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
}

function mapSession(row: SessionDbRow): SessionRow {
  return {
    id: row.id,
    userId: row.user_id,
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

const SESSION_TTL_HOURS = 12;

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
    userAgent?: string;
    ipPrefix?: string;
  }): Promise<{ token: string; session: SessionRow }> {
    const token = randomBytes(32).toString('base64url');
    const res = await this.pool.query<SessionDbRow>(
      `INSERT INTO user_sessions (user_id, token_hash, mfa_satisfied, expires_at, user_agent, ip_prefix)
       VALUES ($1, $2, $3, now() + ($4 || ' hours')::interval, $5, $6)
       RETURNING *`,
      [
        input.userId,
        hashToken(token),
        input.mfaSatisfied,
        String(SESSION_TTL_HOURS),
        input.userAgent ?? null,
        input.ipPrefix ?? null,
      ],
    );
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
      mfa_satisfied: boolean;
    }>(
      `SELECT s.id AS session_id, s.user_id, u.role, s.mfa_satisfied
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
          AND u.status = 'active'`,
      [hashToken(token)],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      userId: row.user_id,
      role: row.role,
      sessionId: row.session_id,
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
        ORDER BY issued_at DESC`,
      [userId],
    );
    return res.rows.map(mapSession);
  }
}
