import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { AgreementService } from '../../common/agreements/agreement.service';
import {
  accountLocked,
  accountNotActive,
  adultConfirmationRequired,
  emailAlreadyRegistered,
  invalidCredentials,
  mfaAlreadyEnrolled,
  mfaInvalid,
  mfaNotEnrolled,
  mfaRequired,
  passwordTooWeak,
} from './errors';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { TotpService } from './totp.service';
import {
  EnrolFactorResult,
  LoginInput,
  LoginResult,
  RecoveryCodesResult,
  RegisterInput,
  UserRow,
} from './types';

interface UserDbRow {
  id: string;
  email: string;
  role: UserRow['role'];
  status: UserRow['status'];
  password_hash: string | null;
  email_verified_at: Date | null;
  adult_confirmed_at: Date | null;
  last_login_at: Date | null;
  failed_login_count: number;
  locked_until: Date | null;
}

function mapUser(row: UserDbRow): UserRow {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    emailVerifiedAt: row.email_verified_at,
    adultConfirmedAt: row.adult_confirmed_at,
    lastLoginAt: row.last_login_at,
  };
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const MIN_PASSWORD_LENGTH = 12;

function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code.replace(/[\s-]/g, '').toUpperCase()).digest('hex');
}

/**
 * Registration, login, and second-factor enrolment.
 *
 * This module exists to close CLAUDE.md #28 — "Never trust a
 * client-supplied user ID" — which the `x-actor-id` header violated on
 * every request until now.
 *
 * Deliberate choices worth knowing about:
 *  - A failed login and an unknown address produce the *same* error and
 *    the same amount of work: the password verifier runs against a dummy
 *    hash even when no user was found, so response time doesn't reveal
 *    whether an account exists.
 *  - #32 (2FA mandatory for providers and admins) is enforced by a DB
 *    trigger, not here. This service returns a friendly typed error
 *    first; the trigger is what makes the rule true.
 *  - Nothing in this file logs a password, a TOTP secret, a recovery
 *    code, or a session token.
 */
@Injectable()
export class AuthService {
  /** Verified against when no user matched, so timing doesn't leak existence. */
  private dummyHashPromise: Promise<string> | null = null;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(TotpService) private readonly totp: TotpService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AgreementService) private readonly agreements: AgreementService,
  ) {}

  private readonly log = new Logger(AuthService.name);

  async register(input: RegisterInput): Promise<UserRow> {
    // CLAUDE.md #27: the platform is 18+, and we do not build flows that
    // accommodate minors. Refused before anything is written.
    if (!input.confirmsAdult) throw adultConfirmationRequired();

    this.assertPasswordAcceptable(input.password, input.email);

    const email = input.email.trim().toLowerCase();
    const existing = await this.pool.query(`SELECT 1 FROM users WHERE email = $1`, [email]);
    if (existing.rows.length > 0) throw emailAlreadyRegistered();

    const passwordHash = await this.passwords.hash(input.password);
    const res = await this.pool.query<UserDbRow>(
      `INSERT INTO users (email, role, password_hash, adult_confirmed_at)
       VALUES ($1, $2, $3, now())
       RETURNING *`,
      [email, input.role, passwordHash],
    );
    const user = mapUser(res.rows[0]);
    await this.recordEvent(this.pool, user.id, 'register', { role: user.role });

    // `adult_confirmed_at` is a timestamp with no record of WHAT was
    // confirmed, which is worth nothing once the wording changes. The
    // agreement record keeps the exact words that were on the screen.
    // Best-effort on purpose: a failure here must not cost somebody
    // their registration, and the timestamp above still stands.
    if (input.familyCode) {
      for (const documentCode of ['adult_attestation', 'terms_of_service']) {
        await this.agreements
          .accept({
            userId: user.id,
            familyCode: input.familyCode,
            documentCode,
            lang: input.lang ?? 'en',
            ipPrefix: input.ipPrefix ?? null,
          })
          .catch((err) => {
            this.log.error(
              `agreement not recorded at registration (${documentCode}): ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          });
      }
    }

    return user;
  }

  /**
   * A password policy that checks length and obvious reuse of the email,
   * and deliberately does NOT impose character-class rules — those push
   * people toward `Password1!` and are no longer recommended (NIST
   * SP 800-63B). Breach-corpus checking belongs here later; recorded as
   * debt rather than faked.
   */
  private assertPasswordAcceptable(password: string, email: string): void {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw passwordTooWeak(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const local = email.split('@')[0]?.toLowerCase() ?? '';
    if (local.length >= 3 && password.toLowerCase().includes(local)) {
      throw passwordTooWeak('password must not contain your email address');
    }
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase();
    const res = await this.pool.query<UserDbRow>(`SELECT * FROM users WHERE email = $1`, [email]);
    const user = res.rows[0];

    if (!user) {
      // Same work, same error, same timing as a real user with a wrong
      // password — no account-existence oracle.
      await this.passwords.verify(input.password, await this.dummyHash());
      await this.recordEvent(this.pool, null, 'login_failed', { reason: 'no_such_user' }, input.ipPrefix);
      throw invalidCredentials();
    }

    if (user.locked_until && user.locked_until > new Date()) {
      await this.recordEvent(this.pool, user.id, 'login_blocked', { reason: 'locked' }, input.ipPrefix);
      throw accountLocked(user.locked_until);
    }

    const passwordOk = await this.passwords.verify(input.password, user.password_hash);
    if (!passwordOk) {
      await this.registerFailedAttempt(user);
      await this.recordEvent(this.pool, user.id, 'login_failed', { reason: 'bad_password' }, input.ipPrefix);
      throw invalidCredentials();
    }

    if (user.status !== 'active') {
      await this.recordEvent(this.pool, user.id, 'login_blocked', { reason: user.status }, input.ipPrefix);
      throw accountNotActive(user.status);
    }

    const factor = await this.confirmedFactorFor(user.id);
    const mfaMandatory = user.role === 'provider' || user.role === 'admin';

    if (mfaMandatory && !factor) {
      // #32's awkward case: a provider who has never enrolled cannot log
      // in, but enrolling requires being logged in. Rather than a dead
      // end, issue a ticket scoped to enrolment ALONE — short-lived, and
      // rejected by the guard on every other route. The password has
      // been proven at this point; nothing else has.
      const { token, session } = await this.sessions.create({
        userId: user.id,
        mfaSatisfied: false,
        scope: 'mfa_enrolment',
        userAgent: input.userAgent,
        ipPrefix: input.ipPrefix,
      });
      await this.recordEvent(this.pool, user.id, 'mfa_enrolment_ticket_issued', {}, input.ipPrefix);
      return { outcome: 'mfa_enrolment_required', enrolmentToken: token, expiresAt: session.expiresAt };
    }

    let mfaSatisfied = false;
    if (factor) {
      if (input.totpCode) {
        if (!this.totp.verify(factor.secret, input.totpCode)) {
          await this.registerFailedAttempt(user);
          await this.recordEvent(this.pool, user.id, 'mfa_failed', {}, input.ipPrefix);
          throw mfaInvalid();
        }
        mfaSatisfied = true;
      } else if (input.recoveryCode) {
        const consumed = await this.consumeRecoveryCode(user.id, input.recoveryCode);
        if (!consumed) {
          await this.registerFailedAttempt(user);
          await this.recordEvent(this.pool, user.id, 'mfa_failed', { via: 'recovery_code' }, input.ipPrefix);
          throw mfaInvalid();
        }
        mfaSatisfied = true;
        await this.recordEvent(this.pool, user.id, 'recovery_code_used', {}, input.ipPrefix);
      } else if (mfaMandatory) {
        // Password was correct but we are not done. Deliberately NOT a
        // session: the caller gets a demand, not a credential.
        await this.recordEvent(this.pool, user.id, 'mfa_challenge', {}, input.ipPrefix);
        throw mfaRequired();
      }
    }

    const { token, session } = await this.sessions.create({
      userId: user.id,
      mfaSatisfied,
      scope: 'full',
      userAgent: input.userAgent,
      ipPrefix: input.ipPrefix,
    });

    await this.pool.query(
      `UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`,
      [user.id],
    );
    await this.recordEvent(this.pool, user.id, 'login_succeeded', { mfaSatisfied }, input.ipPrefix);

    return { outcome: 'session', token, session };
  }

  /**
   * Step one of enrolment: generate a secret and hand back a
   * provisioning URI. The factor is NOT confirmed yet — an unconfirmed
   * factor satisfies nothing, so a user cannot lock themselves out by
   * abandoning enrolment halfway.
   */
  async beginFactorEnrolment(userId: string, issuer = 'Sankalp'): Promise<EnrolFactorResult> {
    const existing = await this.confirmedFactorFor(userId);
    if (existing) throw mfaAlreadyEnrolled();

    const secret = this.totp.generateSecret();
    const user = await this.pool.query<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [userId]);

    await this.pool.query(
      `INSERT INTO auth_factors (user_id, type, secret)
       VALUES ($1, 'totp', $2)
       ON CONFLICT (user_id, type) DO UPDATE SET secret = EXCLUDED.secret, confirmed_at = NULL`,
      [userId, secret],
    );

    return {
      secret,
      provisioningUri: this.totp.provisioningUri(secret, user.rows[0]?.email ?? userId, issuer),
    };
  }

  /** Step two: the user proves they can produce a code before the factor counts. */
  async confirmFactorEnrolment(userId: string, code: string): Promise<RecoveryCodesResult> {
    const res = await this.pool.query<{ secret: string }>(
      `SELECT secret FROM auth_factors WHERE user_id = $1 AND type = 'totp'`,
      [userId],
    );
    const secret = res.rows[0]?.secret;
    if (!secret) throw mfaNotEnrolled('this account');
    if (!this.totp.verify(secret, code)) throw mfaInvalid();

    await this.pool.query(
      `UPDATE auth_factors SET confirmed_at = now() WHERE user_id = $1 AND type = 'totp'`,
      [userId],
    );
    // The ticket existed to get here. Burn every enrolment-scoped session
    // now that it has served its purpose, so a leaked one is useless.
    await this.pool.query(
      `UPDATE user_sessions SET revoked_at = now()
        WHERE user_id = $1 AND scope = 'mfa_enrolment' AND revoked_at IS NULL`,
      [userId],
    );
    await this.recordEvent(this.pool, userId, 'mfa_enrolled', {});
    return this.regenerateRecoveryCodes(userId);
  }

  /**
   * Ten single-use codes, shown once. Only SHA-256 digests are stored —
   * these are credentials, not reference data. (Plain SHA-256 rather than
   * argon2id is deliberate and safe here: unlike a chosen password, each
   * code is 80 bits of our own randomness, so there is nothing to
   * brute-force faster than the keyspace.)
   */
  async regenerateRecoveryCodes(userId: string): Promise<RecoveryCodesResult> {
    const codes = Array.from({ length: 10 }, () =>
      randomBytes(10).toString('hex').toUpperCase().replace(/(.{5})(?=.)/g, '$1-'),
    );

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM recovery_codes WHERE user_id = $1`, [userId]);
      for (const code of codes) {
        await client.query(`INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1, $2)`, [
          userId,
          hashRecoveryCode(code),
        ]);
      }
      await this.recordEvent(client, userId, 'recovery_codes_regenerated', { count: codes.length });
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    return { codes };
  }

  async getUser(userId: string): Promise<UserRow | null> {
    const res = await this.pool.query<UserDbRow>(`SELECT * FROM users WHERE id = $1`, [userId]);
    return res.rows[0] ? mapUser(res.rows[0]) : null;
  }

  private async confirmedFactorFor(userId: string): Promise<{ secret: string } | null> {
    const res = await this.pool.query<{ secret: string }>(
      `SELECT secret FROM auth_factors WHERE user_id = $1 AND type = 'totp' AND confirmed_at IS NOT NULL`,
      [userId],
    );
    return res.rows[0] ?? null;
  }

  /** Constant-time match across the user's unused codes, then marks it used. */
  private async consumeRecoveryCode(userId: string, submitted: string): Promise<boolean> {
    const target = Buffer.from(hashRecoveryCode(submitted), 'hex');
    const res = await this.pool.query<{ id: string; code_hash: string }>(
      `SELECT id, code_hash FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL`,
      [userId],
    );

    let matchedId: string | null = null;
    for (const row of res.rows) {
      const candidate = Buffer.from(row.code_hash, 'hex');
      if (candidate.length === target.length && timingSafeEqual(candidate, target)) {
        matchedId = row.id;
      }
    }
    if (!matchedId) return false;

    const updated = await this.pool.query(
      `UPDATE recovery_codes SET used_at = now() WHERE id = $1 AND used_at IS NULL`,
      [matchedId],
    );
    return (updated.rowCount ?? 0) > 0; // single-use, even under a race
  }

  private async registerFailedAttempt(user: UserDbRow): Promise<void> {
    await this.pool.query(
      `UPDATE users
          SET failed_login_count = failed_login_count + 1,
              locked_until = CASE
                WHEN failed_login_count + 1 >= $2 THEN now() + ($3 || ' minutes')::interval
                ELSE locked_until
              END
        WHERE id = $1`,
      [user.id, MAX_FAILED_ATTEMPTS, String(LOCKOUT_MINUTES)],
    );
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

  private dummyHash(): Promise<string> {
    if (!this.dummyHashPromise) {
      this.dummyHashPromise = this.passwords.hash(randomBytes(32).toString('hex'));
    }
    return this.dummyHashPromise;
  }
}
