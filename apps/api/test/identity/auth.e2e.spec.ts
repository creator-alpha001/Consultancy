import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { AdminModule } from '../../src/modules/admin/admin.module';
import { DomainsModule } from '../../src/modules/domains/domains.module';
import { AuthService } from '../../src/modules/identity/auth.service';
import { IdentityModule } from '../../src/modules/identity/identity.module';
import { SessionService } from '../../src/modules/identity/session.service';
import { TotpService } from '../../src/modules/identity/totp.service';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { resetDatabase } from '../test-utils';

/**
 * The module that closes CLAUDE.md #28 — "Never trust a client-supplied
 * user ID." Until this existed, the API believed an `x-actor-id` header.
 *
 * Driven over real HTTP rather than through the services, because the
 * guard, the decorator and the wiring are most of what is being claimed.
 */
describe('identity: registration, login, mandatory 2FA, sessions', () => {
  let app: INestApplication;
  let pool: Pool;
  let auth: AuthService;
  let totp: TotpService;
  let sessions: SessionService;

  const strongPassword = 'a-long-enough-passphrase';

  beforeEach(async () => {
    if (!app) {
      // AdminModule/DomainsModule are here so the role-gating cases below
      // exercise a real protected controller, not a hypothetical one.
      app = await createTestApp([IdentityModule, AdminModule, DomainsModule]);
      pool = app.get<Pool>(PG_POOL);
      auth = app.get(AuthService);
      totp = app.get(TotpService);
      sessions = app.get(SessionService);
    }
    await resetDatabase(pool);
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  const http = (): request.SuperTest<request.Test> => request(app.getHttpServer());

  async function registerSeeker(email = 'aspirant@test.local'): Promise<void> {
    await http()
      .post('/auth/register')
      .send({ email, password: strongPassword, role: 'seeker', confirmsAdult: true })
      .expect(201);
  }

  describe('registration', () => {
    it('registers a seeker who confirms they are an adult', async () => {
      const res = await http()
        .post('/auth/register')
        .send({ email: 'a@test.local', password: strongPassword, role: 'seeker', confirmsAdult: true })
        .expect(201);
      expect(res.body.email).toBe('a@test.local');
      expect(res.body.adultConfirmedAt).not.toBeNull();
      // The response must never carry the credential back.
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
      expect(JSON.stringify(res.body)).not.toContain(strongPassword);
    });

    it('refuses registration without the 18+ confirmation (hard rule #27)', async () => {
      const res = await http()
        .post('/auth/register')
        .send({ email: 'b@test.local', password: strongPassword, role: 'seeker', confirmsAdult: false })
        .expect(422);
      expect(res.body.error.code).toBe('ADULT_CONFIRMATION_REQUIRED');
    });

    it('refuses a short password, and one containing the email', async () => {
      const short = await http()
        .post('/auth/register')
        .send({ email: 'c@test.local', password: 'short', role: 'seeker', confirmsAdult: true })
        .expect(422);
      expect(short.body.error.code).toBe('PASSWORD_TOO_WEAK');

      const echoesEmail = await http()
        .post('/auth/register')
        .send({ email: 'ramesh@test.local', password: 'ramesh-ramesh-ramesh', role: 'seeker', confirmsAdult: true })
        .expect(422);
      expect(echoesEmail.body.error.code).toBe('PASSWORD_TOO_WEAK');
    });

    it('stores only an argon2id hash, never the password', async () => {
      await registerSeeker();
      const res = await pool.query<{ password_hash: string }>(
        `SELECT password_hash FROM users WHERE email = 'aspirant@test.local'`,
      );
      expect(res.rows[0].password_hash.startsWith('$argon2id$')).toBe(true);
      expect(res.rows[0].password_hash).not.toContain(strongPassword);
    });
  });

  describe('login', () => {
    it('issues a session for a seeker with correct credentials', async () => {
      await registerSeeker();
      const res = await http()
        .post('/auth/login')
        .send({ email: 'aspirant@test.local', password: strongPassword })
        .expect(201);
      expect(res.body.outcome).toBe('session');
      expect(typeof res.body.token).toBe('string');

      const me = await http().get('/auth/me').set('authorization', `Bearer ${res.body.token}`).expect(200);
      expect(me.body.email).toBe('aspirant@test.local');
    });

    it('gives the SAME error for a wrong password and an unknown address', async () => {
      // No account-enumeration oracle: an attacker must not learn which
      // addresses are registered on a civil-services platform.
      await registerSeeker();
      const wrongPassword = await http()
        .post('/auth/login')
        .send({ email: 'aspirant@test.local', password: 'not-the-right-password' })
        .expect(401);
      const noSuchUser = await http()
        .post('/auth/login')
        .send({ email: 'nobody@test.local', password: 'not-the-right-password' })
        .expect(401);

      expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(noSuchUser.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(wrongPassword.body.error.message).toBe(noSuchUser.body.error.message);
    });

    it('locks an account after repeated failures', async () => {
      await registerSeeker();
      for (let i = 0; i < 5; i++) {
        await http().post('/auth/login').send({ email: 'aspirant@test.local', password: 'wrong' }).expect(401);
      }
      const locked = await http()
        .post('/auth/login')
        .send({ email: 'aspirant@test.local', password: strongPassword }) // now correct!
        .expect(429);
      expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    });

    it('records every attempt in the append-only auth log', async () => {
      await registerSeeker();
      await http().post('/auth/login').send({ email: 'aspirant@test.local', password: 'wrong' }).expect(401);
      await http().post('/auth/login').send({ email: 'aspirant@test.local', password: strongPassword }).expect(201);

      const events = await pool.query<{ event_type: string; detail: Record<string, unknown> }>(
        `SELECT event_type, detail FROM auth_events ORDER BY created_at`,
      );
      const types = events.rows.map((r) => r.event_type);
      expect(types).toContain('register');
      expect(types).toContain('login_failed');
      expect(types).toContain('login_succeeded');
      // The log must never carry the credential itself.
      expect(JSON.stringify(events.rows)).not.toContain(strongPassword);
    });
  });

  describe('hard rule #32 — 2FA is mandatory for providers and admins', () => {
    async function registerProvider(): Promise<void> {
      await http()
        .post('/auth/register')
        .send({ email: 'mentor@test.local', password: strongPassword, role: 'provider', confirmsAdult: true })
        .expect(201);
    }

    it('gives a brand-new provider an enrolment ticket instead of a dead end (D19)', async () => {
      await registerProvider();
      const res = await http()
        .post('/auth/login')
        .send({ email: 'mentor@test.local', password: strongPassword })
        .expect(201);

      // Not a session: a ticket, and the response says so plainly.
      expect(res.body.outcome).toBe('mfa_enrolment_required');
      expect(typeof res.body.enrolmentToken).toBe('string');

      // It is stored as an enrolment-scoped session, never a full one.
      const stored = await pool.query<{ scope: string; mfa_satisfied: boolean }>(
        `SELECT scope, mfa_satisfied FROM user_sessions`,
      );
      expect(stored.rows[0].scope).toBe('mfa_enrolment');
      expect(stored.rows[0].mfa_satisfied).toBe(false);
    });

    it('an enrolment ticket unlocks enrolment AND NOTHING ELSE', async () => {
      await registerProvider();
      const login = await http()
        .post('/auth/login')
        .send({ email: 'mentor@test.local', password: strongPassword })
        .expect(201);
      const ticket = `Bearer ${login.body.enrolmentToken}`;

      // The whole safety argument for the ticket, tested directly.
      await http().get('/auth/me').set('authorization', ticket).expect(401);
      await http().get('/auth/sessions').set('authorization', ticket).expect(401);
      await http().post('/auth/logout-others').set('authorization', ticket).expect(401);
      await http().post('/auth/mfa/recovery-codes').set('authorization', ticket).expect(401);

      // But enrolment works.
      await http().post('/auth/mfa/enrol').set('authorization', ticket).expect(201);
    });

    it('completes the full bootstrap over HTTP: ticket -> enrol -> confirm -> real login', async () => {
      await registerProvider();
      const login = await http()
        .post('/auth/login')
        .send({ email: 'mentor@test.local', password: strongPassword })
        .expect(201);
      const ticket = `Bearer ${login.body.enrolmentToken}`;

      const enrol = await http().post('/auth/mfa/enrol').set('authorization', ticket).expect(201);
      expect(enrol.body.provisioningUri).toContain('otpauth://totp/');

      const confirm = await http()
        .post('/auth/mfa/confirm')
        .set('authorization', ticket)
        .send({ code: totp.codeAt(enrol.body.secret) })
        .expect(201);
      expect(confirm.body.codes).toHaveLength(10);

      // The ticket is burned the moment it has served its purpose.
      await http().post('/auth/mfa/enrol').set('authorization', ticket).expect(401);

      // And the provider can now log in properly, with a code.
      const real = await http()
        .post('/auth/login')
        .send({
          email: 'mentor@test.local',
          password: strongPassword,
          totpCode: totp.codeAt(enrol.body.secret),
        })
        .expect(201);
      expect(real.body.outcome).toBe('session');
      expect(real.body.session.scope).toBe('full');

      const me = await http().get('/auth/me').set('authorization', `Bearer ${real.body.token}`).expect(200);
      expect(me.body.email).toBe('mentor@test.local');
    });

    it('never issues an enrolment ticket on a WRONG password', async () => {
      await registerProvider();
      await http()
        .post('/auth/login')
        .send({ email: 'mentor@test.local', password: 'wrong-password-entirely' })
        .expect(401);
      const stored = await pool.query(`SELECT 1 FROM user_sessions`);
      expect(stored.rows).toHaveLength(0);
    });

    it('completes the enrol -> confirm -> login-with-code flow', async () => {
      await registerProvider();

      // Enrolment has to happen through some authenticated context; a
      // provider cannot log in yet, so this exercises the service the way
      // an onboarding flow would (a scoped enrolment ticket is D19).
      const user = await pool.query<{ id: string }>(`SELECT id FROM users WHERE email = 'mentor@test.local'`);
      const providerId = user.rows[0].id;

      const enrol = await auth.beginFactorEnrolment(providerId);
      expect(enrol.provisioningUri).toContain('otpauth://totp/');

      // An unconfirmed factor satisfies nothing.
      await expect(
        sessions.create({ userId: providerId, mfaSatisfied: true }),
      ).rejects.toThrow(/no confirmed second factor/);

      const recovery = await auth.confirmFactorEnrolment(providerId, totp.codeAt(enrol.secret));
      expect(recovery.codes).toHaveLength(10);

      // Password alone is now a challenge, not a session.
      const challenged = await http()
        .post('/auth/login')
        .send({ email: 'mentor@test.local', password: strongPassword })
        .expect(401);
      expect(challenged.body.error.code).toBe('MFA_REQUIRED');

      // A wrong code is refused.
      const badCode = await http()
        .post('/auth/login')
        .send({ email: 'mentor@test.local', password: strongPassword, totpCode: '000000' })
        .expect(401);
      expect(badCode.body.error.code).toBe('MFA_INVALID');

      // The real code works.
      const ok = await http()
        .post('/auth/login')
        .send({ email: 'mentor@test.local', password: strongPassword, totpCode: totp.codeAt(enrol.secret) })
        .expect(201);
      expect(ok.body.outcome).toBe('session');
      expect(ok.body.session.mfaSatisfied).toBe(true);
    });

    it('accepts a recovery code once, and never again', async () => {
      await registerProvider();
      const user = await pool.query<{ id: string }>(`SELECT id FROM users WHERE email = 'mentor@test.local'`);
      const providerId = user.rows[0].id;
      const enrol = await auth.beginFactorEnrolment(providerId);
      const { codes } = await auth.confirmFactorEnrolment(providerId, totp.codeAt(enrol.secret));

      const first = await http()
        .post('/auth/login')
        .send({ email: 'mentor@test.local', password: strongPassword, recoveryCode: codes[0] })
        .expect(201);
      expect(first.body.outcome).toBe('session');

      const reuse = await http()
        .post('/auth/login')
        .send({ email: 'mentor@test.local', password: strongPassword, recoveryCode: codes[0] })
        .expect(401);
      expect(reuse.body.error.code).toBe('MFA_INVALID');
    });
  });

  describe('sessions and the guard', () => {
    it('rejects a request with no token, a junk token, and a revoked one', async () => {
      await registerSeeker();
      const login = await http()
        .post('/auth/login')
        .send({ email: 'aspirant@test.local', password: strongPassword })
        .expect(201);

      await http().get('/auth/me').expect(401);
      await http().get('/auth/me').set('authorization', 'Bearer not-a-real-token').expect(401);

      await http().post('/auth/logout').set('authorization', `Bearer ${login.body.token}`).expect(201);
      const afterLogout = await http()
        .get('/auth/me')
        .set('authorization', `Bearer ${login.body.token}`)
        .expect(401);
      expect(afterLogout.body.error.code).toBe('SESSION_INVALID');
    });

    it('stores only a digest of the session token', async () => {
      await registerSeeker();
      const login = await http()
        .post('/auth/login')
        .send({ email: 'aspirant@test.local', password: strongPassword })
        .expect(201);

      const stored = await pool.query<{ token_hash: string }>(`SELECT token_hash FROM user_sessions`);
      expect(stored.rows[0].token_hash).toHaveLength(64);
      expect(stored.rows[0].token_hash).not.toBe(login.body.token);
    });

    it('signs out other devices while keeping the current one', async () => {
      await registerSeeker();
      const a = await http().post('/auth/login').send({ email: 'aspirant@test.local', password: strongPassword });
      const b = await http().post('/auth/login').send({ email: 'aspirant@test.local', password: strongPassword });

      const res = await http()
        .post('/auth/logout-others')
        .set('authorization', `Bearer ${b.body.token}`)
        .expect(201);
      expect(res.body.revoked).toBe(1);

      await http().get('/auth/me').set('authorization', `Bearer ${b.body.token}`).expect(200);
      await http().get('/auth/me').set('authorization', `Bearer ${a.body.token}`).expect(401);
    });

    it('reads the role from the database on every request, not from the token', async () => {
      await registerSeeker();
      const login = await http()
        .post('/auth/login')
        .send({ email: 'aspirant@test.local', password: strongPassword })
        .expect(201);

      // Suspending the account invalidates the live session immediately.
      await pool.query(`UPDATE users SET status = 'suspended' WHERE email = 'aspirant@test.local'`);
      await http().get('/auth/me').set('authorization', `Bearer ${login.body.token}`).expect(401);
    });
  });

  describe('role gating on existing controllers', () => {
    it('refuses the admin pack editor to a seeker, and to an anonymous caller', async () => {
      await registerSeeker();
      const login = await http()
        .post('/auth/login')
        .send({ email: 'aspirant@test.local', password: strongPassword })
        .expect(201);

      // Anonymous.
      await http().post('/admin/families/manifest').send({}).expect(401);

      // Authenticated, but a seeker. Previously reachable by anyone who
      // could set a header.
      const res = await http()
        .post('/admin/families/manifest')
        .set('authorization', `Bearer ${login.body.token}`)
        .set('idempotency-key', 'k1')
        .send({})
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('leaves the public domain catalogue readable without a session', async () => {
      // Deliberate: SSR public pages need it, and it exposes only pack
      // data that exists in order to be seen.
      await http().get('/domains/does-not-exist').expect(404); // reached the handler, not the guard
    });
  });
});
