import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../src/database/db.module';
import { AuthService } from '../src/modules/identity/auth.service';
import { SessionService } from '../src/modules/identity/session.service';
import { TotpService } from '../src/modules/identity/totp.service';
import { UserRole } from '../src/modules/identity/types';

/**
 * Mints a REAL authenticated session for a test — through the same
 * services and the same database triggers production uses, not a stub.
 *
 * That matters for provider and admin accounts especially: CLAUDE.md #32
 * makes 2FA mandatory for them and 0026's trigger enforces it, so this
 * helper genuinely enrols and confirms a TOTP factor. A helper that
 * bypassed that would quietly make every downstream test a test of a
 * system we don't ship.
 */
export async function authenticate(
  app: INestApplication,
  role: UserRole,
  opts: { email?: string } = {},
): Promise<{ userId: string; token: string; bearer: string }> {
  const pool = app.get<Pool>(PG_POOL);
  const auth = app.get(AuthService);
  const totp = app.get(TotpService);
  const sessions = app.get(SessionService);

  const unique = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const email = opts.email ?? `${role}+${unique}@test.local`;
  const password = `test-passphrase-${unique}`;

  const user = await auth.register({ email, password, role, confirmsAdult: true });

  let mfaSatisfied = false;
  if (role === 'provider' || role === 'admin') {
    const enrolment = await auth.beginFactorEnrolment(user.id);
    await auth.confirmFactorEnrolment(user.id, totp.codeAt(enrolment.secret));
    mfaSatisfied = true;
  }

  const { token } = await sessions.create({ userId: user.id, mfaSatisfied });
  void pool; // reserved for callers that want to inspect rows afterwards
  return { userId: user.id, token, bearer: `Bearer ${token}` };
}

/**
 * Gives an EXISTING user (one created by `seedUsers`, which predates
 * identity/) a usable session. Those fixtures have no password and no
 * adult attestation, so both are backfilled here exactly as registration
 * would have set them.
 */
export async function authenticateExistingUser(
  app: INestApplication,
  userId: string,
): Promise<{ token: string; bearer: string }> {
  const pool = app.get<Pool>(PG_POOL);
  const auth = app.get(AuthService);
  const totp = app.get(TotpService);
  const sessions = app.get(SessionService);

  const res = await pool.query<{ role: UserRole }>(`SELECT role FROM users WHERE id = $1`, [userId]);
  const role = res.rows[0].role;

  await pool.query(
    `UPDATE users SET adult_confirmed_at = coalesce(adult_confirmed_at, now()), status = 'active' WHERE id = $1`,
    [userId],
  );

  let mfaSatisfied = false;
  if (role === 'provider' || role === 'admin') {
    const enrolment = await auth.beginFactorEnrolment(userId);
    await auth.confirmFactorEnrolment(userId, totp.codeAt(enrolment.secret));
    mfaSatisfied = true;
  }

  const { token } = await sessions.create({ userId, mfaSatisfied });
  return { token, bearer: `Bearer ${token}` };
}
