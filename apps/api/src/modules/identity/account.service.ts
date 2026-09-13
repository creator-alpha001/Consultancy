import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { AccountTokenPurpose, deriveAccountToken, hashAccountToken } from './account-token';
import { emailAlreadyVerified, invalidCredentials, passwordTooWeak, tokenInvalid, tooManyRequests } from './errors';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

/** How long an emailed link works. Short for a reset — it is a key to the account. */
const TTL: Record<AccountTokenPurpose, string> = {
  password_reset: '30 minutes',
  email_verification: '48 hours',
};

/**
 * How many links of one purpose an account may be sent per hour.
 *
 * A forgot-password form is an open door to someone's inbox: without a
 * cap, anyone can flood a stranger with reset emails, and our sending
 * reputation with them.
 */
const MAX_PER_HOUR = 3;

export const MIN_PASSWORD_LENGTH = 12;

/** Outbox event types. The relay composes and sends each. */
export const AccountEmailEvent = {
  password_reset: 'identity.password_reset',
  email_verification: 'identity.email_verification',
} as const satisfies Record<AccountTokenPurpose, string>;

/**
 * Getting back into an account, and proving an address is yours.
 *
 * Every emailed link follows one pattern: a row in `account_tokens` and
 * an `outbox` event, written in ONE transaction; the relay sends the
 * email after commit (hard rule #9 — no external call inside a
 * transaction). The token itself is never stored: see `account-token.ts`.
 */
@Injectable()
export class AccountService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  /**
   * Always succeeds from the caller's point of view.
   *
   * Whether the address has an account is not revealed — not by the
   * response, and not by a different status for "too many": a rate-limited
   * request for a real account and a request for no account look the
   * same. Otherwise this form becomes the account-enumeration oracle the
   * login error was designed not to be.
   */
  async requestPasswordReset(email: string, ipPrefix?: string): Promise<void> {
    const res = await this.pool.query<{ id: string; status: string; password_hash: string | null }>(
      `SELECT id, status, password_hash FROM users WHERE email = $1`,
      [email.trim().toLowerCase()],
    );
    const user = res.rows[0];
    await this.recordEvent(this.pool, user?.id ?? null, 'password_reset_requested', { known: Boolean(user) }, ipPrefix);
    if (!user || user.status !== 'active') return;
    if (await this.overLimit(user.id, 'password_reset')) return;
    await this.issue(user.id, 'password_reset');
  }

  /**
   * Sets a new password from a reset link.
   *
   * Everything the old password protected is closed: every session is
   * revoked (someone who reset because they suspected a compromise must
   * not leave the intruder signed in), and the lockout is cleared, since
   * proving control of the inbox is at least as strong as the password.
   * A second factor is NOT removed — a reset proves the inbox, not the
   * phone, and #32 exists for exactly the case where the inbox is what
   * was taken.
   */
  async resetPassword(token: string, newPassword: string, ipPrefix?: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const row = await this.spend(client, token, 'password_reset');
      const user = await client.query<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [row.userId]);
      assertPasswordAcceptable(newPassword, user.rows[0].email);
      const hash = await this.passwords.hash(newPassword);
      await client.query(
        `UPDATE users SET password_hash = $2, failed_login_count = 0, locked_until = NULL WHERE id = $1`,
        [row.userId, hash],
      );
      await client.query(
        `UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
        [row.userId],
      );
      await this.recordEvent(client, row.userId, 'password_reset_completed', {}, ipPrefix);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Changing a password while signed in. Every OTHER session is signed out. */
  async changePassword(input: {
    userId: string;
    sessionId: string;
    currentPassword: string;
    newPassword: string;
    ipPrefix?: string;
  }): Promise<{ revokedSessions: number }> {
    const res = await this.pool.query<{ email: string; password_hash: string | null }>(
      `SELECT email, password_hash FROM users WHERE id = $1`,
      [input.userId],
    );
    const user = res.rows[0];
    if (!user || !(await this.passwords.verify(input.currentPassword, user.password_hash))) {
      await this.recordEvent(this.pool, input.userId, 'password_change_failed', {}, input.ipPrefix);
      throw invalidCredentials();
    }
    assertPasswordAcceptable(input.newPassword, user.email);
    await this.pool.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [
      input.userId,
      await this.passwords.hash(input.newPassword),
    ]);
    const revokedSessions = await this.sessions.revokeAllForUser(input.userId, input.sessionId);
    await this.recordEvent(this.pool, input.userId, 'password_changed', { revokedSessions }, input.ipPrefix);
    return { revokedSessions };
  }

  /** Sends (or re-sends) the verification link. Rate-limited like a reset. */
  async sendEmailVerification(userId: string): Promise<{ sent: boolean }> {
    const res = await this.pool.query<{ email_verified_at: Date | null }>(
      `SELECT email_verified_at FROM users WHERE id = $1`,
      [userId],
    );
    if (res.rows[0]?.email_verified_at) throw emailAlreadyVerified();
    if (await this.overLimit(userId, 'email_verification')) throw tooManyRequests(60);
    await this.issue(userId, 'email_verification');
    return { sent: true };
  }

  async verifyEmail(token: string): Promise<{ userId: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const row = await this.spend(client, token, 'email_verification');
      await client.query(
        `UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1`,
        [row.userId],
      );
      await this.recordEvent(client, row.userId, 'email_verified', {});
      await client.query('COMMIT');
      return { userId: row.userId };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ── internals ─────────────────────────────────────────────────────

  private async issue(userId: string, purpose: AccountTokenPurpose): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // The id is chosen here because the token is derived from it, and
      // only the token's hash is written.
      const id = randomUUID();
      await client.query(
        `INSERT INTO account_tokens (id, user_id, purpose, token_hash, expires_at)
         VALUES ($1, $2, $3::account_token_purpose, $4, now() + $5::interval)`,
        [id, userId, purpose, hashAccountToken(deriveAccountToken(purpose, id)), TTL[purpose]],
      );
      // An earlier unused link of the same purpose stops working: only
      // the newest email in someone's inbox should do anything.
      await client.query(
        `UPDATE account_tokens SET used_at = now()
          WHERE user_id = $1 AND purpose = $2::account_token_purpose AND used_at IS NULL AND id <> $3`,
        [userId, purpose, id],
      );
      await client.query(
        `INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload)
         VALUES ('account_token', $1, $2, $3::jsonb)`,
        [id, AccountEmailEvent[purpose], JSON.stringify({ userId })],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  private async spend(client: PoolClient, token: string, purpose: AccountTokenPurpose): Promise<{ userId: string }> {
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) throw tokenInvalid();
    const res = await client.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM account_tokens
        WHERE token_hash = $1 AND purpose = $2::account_token_purpose
          AND used_at IS NULL AND expires_at > now()
        FOR UPDATE`,
      [hashAccountToken(token), purpose],
    );
    const row = res.rows[0];
    if (!row) throw tokenInvalid();
    await client.query(`UPDATE account_tokens SET used_at = now() WHERE id = $1`, [row.id]);
    return { userId: row.user_id };
  }

  private async overLimit(userId: string, purpose: AccountTokenPurpose): Promise<boolean> {
    const res = await this.pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM account_tokens
        WHERE user_id = $1 AND purpose = $2::account_token_purpose AND created_at > now() - interval '1 hour'`,
      [userId, purpose],
    );
    return Number(res.rows[0].n) >= MAX_PER_HOUR;
  }

  private async recordEvent(
    db: Pool | PoolClient,
    userId: string | null,
    eventType: string,
    detail: Record<string, unknown>,
    ipPrefix?: string,
  ): Promise<void> {
    await db.query(
      `INSERT INTO auth_events (user_id, event_type, detail, ip_prefix) VALUES ($1, $2, $3::jsonb, $4)`,
      [userId, eventType, JSON.stringify(detail), ipPrefix ?? null],
    );
  }
}

/**
 * Length and obvious reuse of the email, and deliberately no
 * character-class rules — those push people toward `Password1!` and are
 * no longer recommended (NIST SP 800-63B). Shared with registration.
 */
export function assertPasswordAcceptable(password: string, email: string): void {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw passwordTooWeak(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  if (local.length >= 3 && password.toLowerCase().includes(local)) {
    throw passwordTooWeak('password must not contain your email address');
  }
}
