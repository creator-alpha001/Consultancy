import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { DomainManifestService } from '../../src/modules/domains/domain-manifest.service';
import { DomainsModule } from '../../src/modules/domains/domains.module';
import { FamilyManifestService } from '../../src/modules/domains/family-manifest.service';
import { MoneyModule } from '../../src/modules/money/money.module';
import { EMAIL_TRANSPORT, LoggingEmailTransport } from '../../src/modules/notifications/email/email-transport';
import { NotificationsModule } from '../../src/modules/notifications/notifications.module';
import { OutboxRelayService } from '../../src/modules/notifications/outbox-relay.service';
import { VerificationModule } from '../../src/modules/verification/verification.module';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { domainManifestV1, familyManifestV1 } from '../domains/manifest-fixtures';
import { resetDatabase } from '../test-utils';

/**
 * Completing accounts (TRACKER D20): getting back in, proving an address,
 * changing a password, sessions that expire when idle, names and
 * profiles, and a seeker saying which fields they are in.
 *
 * Email goes through the logging transport, so these read the link out
 * of the message exactly as a person would read it out of an inbox.
 */
describe('accounts: reset, verification, profile, fields, sessions', () => {
  let app: INestApplication;
  let pool: Pool;
  let relay: OutboxRelayService;
  const mailbox = new LoggingEmailTransport();
  const http = () => request(app.getHttpServer());
  const PASSWORD = 'correct horse battery staple';

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp(
        [DomainsModule, VerificationModule, MoneyModule, NotificationsModule],
        [{ token: EMAIL_TRANSPORT, useValue: mailbox }],
      );
      pool = app.get<Pool>(PG_POOL);
      relay = app.get(OutboxRelayService);
    }
    await resetDatabase(pool);
    mailbox.sent.length = 0;
    await app.get(FamilyManifestService).publish(familyManifestV1());
    await app.get(DomainManifestService).publish(domainManifestV1());
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  async function register(role: 'seeker' | 'provider', extra: Record<string, unknown> = {}) {
    const email = `${role}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@test.local`;
    const res = await http()
      .post('/auth/register')
      .send({ email, password: PASSWORD, role, confirmsAdult: true, familyCode: 'civil_services_exams', ...extra });
    expect(res.status).toBe(201);
    return { email, userId: res.body.id as string };
  }

  async function login(email: string, password = PASSWORD): Promise<string> {
    const res = await http().post('/auth/login').send({ email, password });
    expect(res.status).toBe(201);
    return `Bearer ${res.body.token}`;
  }

  /** Runs the relay and returns the token from the newest email to `to`. */
  async function tokenFromInbox(to: string, page: string): Promise<string> {
    await relay.runOnce();
    const mail = [...mailbox.sent].reverse().find((m) => m.to === to && m.text.includes(`/${page}#token=`));
    expect(mail, `an email to ${to} linking to /${page}`).toBeDefined();
    return /#token=([A-Za-z0-9_-]+)/.exec(mail!.text)![1];
  }

  describe('password reset', () => {
    it('resets from an emailed link, signs out everywhere, and the link works once', async () => {
      const { email } = await register('seeker');
      const oldSession = await login(email);

      const asked = await http().post('/auth/password/forgot').send({ email });
      expect(asked.status).toBe(202);
      const token = await tokenFromInbox(email, 'reset-password');

      // The token is not in the database in any form a dump would reveal.
      const stored = await pool.query(`SELECT payload::text AS p FROM outbox WHERE event_type = 'identity.password_reset'`);
      expect(stored.rows[0].p).not.toContain(token);

      const reset = await http().post('/auth/password/reset').send({ token, password: 'a brand new long passphrase' });
      expect(reset.status).toBe(201);

      expect((await http().get('/auth/me').set('Authorization', oldSession)).status).toBe(401);
      expect((await http().post('/auth/login').send({ email, password: PASSWORD })).status).toBe(401);
      await login(email, 'a brand new long passphrase');

      const again = await http().post('/auth/password/reset').send({ token, password: 'yet another long passphrase' });
      expect(again.status).toBe(400);
      expect(again.body.error.code).toBe('TOKEN_INVALID');
    });

    it('answers the same for an unknown address, and sends nothing', async () => {
      const res = await http().post('/auth/password/forgot').send({ email: 'nobody@test.local' });
      expect(res.status).toBe(202);
      await relay.runOnce();
      expect(mailbox.sent.filter((m) => m.to === 'nobody@test.local')).toHaveLength(0);
    });

    it('stops sending after three requests an hour, without saying so', async () => {
      const { email } = await register('seeker');
      for (let i = 0; i < 5; i += 1) {
        expect((await http().post('/auth/password/forgot').send({ email })).status).toBe(202);
      }
      const n = await pool.query(`SELECT count(*)::int AS n FROM account_tokens WHERE purpose = 'password_reset'`);
      expect(n.rows[0].n).toBe(3);
    });

    it('only the newest link works', async () => {
      const { email } = await register('seeker');
      await http().post('/auth/password/forgot').send({ email });
      const first = await tokenFromInbox(email, 'reset-password');
      await http().post('/auth/password/forgot').send({ email });
      const second = await tokenFromInbox(email, 'reset-password');
      expect(first).not.toBe(second);
      expect((await http().post('/auth/password/reset').send({ token: first, password: 'first new long passphrase' })).status).toBe(400);
      expect((await http().post('/auth/password/reset').send({ token: second, password: 'second new long passphrase' })).status).toBe(201);
    });

    it('refuses a weak new password and leaves the link usable', async () => {
      const { email } = await register('seeker');
      await http().post('/auth/password/forgot').send({ email });
      const token = await tokenFromInbox(email, 'reset-password');
      const weak = await http().post('/auth/password/reset').send({ token, password: 'short' });
      expect(weak.status).toBe(422);
      expect(weak.body.error.code).toBe('PASSWORD_TOO_WEAK');
      expect((await http().post('/auth/password/reset').send({ token, password: 'a proper long passphrase' })).status).toBe(201);
    });
  });

  describe('changing a password', () => {
    it('needs the current password, and signs out every other session', async () => {
      const { email } = await register('seeker');
      const here = await login(email);
      const elsewhere = await login(email);

      const wrong = await http()
        .post('/auth/password/change')
        .set('Authorization', here)
        .send({ currentPassword: 'not it at all really', newPassword: 'another long passphrase' });
      expect(wrong.status).toBe(401);

      const ok = await http()
        .post('/auth/password/change')
        .set('Authorization', here)
        .send({ currentPassword: PASSWORD, newPassword: 'another long passphrase' });
      expect(ok.status).toBe(201);
      expect(ok.body.revokedSessions).toBe(1);
      expect((await http().get('/auth/me').set('Authorization', here)).status).toBe(200);
      expect((await http().get('/auth/me').set('Authorization', elsewhere)).status).toBe(401);
    });
  });

  describe('email verification', () => {
    it('is sent at registration, verified from the link, and not re-sent after', async () => {
      const { email } = await register('seeker');
      const token = await tokenFromInbox(email, 'verify-email');
      expect((await http().post('/auth/email/verify').send({ token })).status).toBe(201);

      const session = await login(email);
      const me = await http().get('/auth/me').set('Authorization', session);
      expect(me.body.emailVerifiedAt).not.toBeNull();

      const resend = await http().post('/auth/email/resend').set('Authorization', session);
      expect(resend.status).toBe(409);
      expect(resend.body.error.code).toBe('EMAIL_ALREADY_VERIFIED');
    });

    it('speaks the language the person chose', async () => {
      const { email } = await register('seeker', { lang: 'hi' });
      await relay.runOnce();
      const mail = mailbox.sent.find((m) => m.to === email);
      expect(mail?.subject).toContain('ईमेल');
    });
  });

  describe('profile', () => {
    it('keeps a chosen name and, for a provider, a headline and bio in its own language', async () => {
      const { email } = await register('provider', { displayName: '  Anita   Rao ' });
      const session = await login(email);

      const initial = await http().get('/me/profile').set('Authorization', session);
      expect(initial.body.displayName).toBe('Anita Rao');
      expect(initial.body.provider).toEqual({ headline: null, bio: null, bioLang: null });

      const updated = await http()
        .post('/me/profile')
        .set('Authorization', session)
        .send({ headline: 'Polity and essay feedback', bio: 'मैं उत्तर लेखन पर काम करती हूँ।', bioLang: 'hi' });
      expect(updated.status).toBe(201);
      expect(updated.body.provider).toEqual({
        headline: 'Polity and essay feedback',
        bio: 'मैं उत्तर लेखन पर काम करती हूँ।',
        bioLang: 'hi',
      });
    });

    it('refuses contact details in a public profile, and an email as a name', async () => {
      const { email } = await register('provider');
      const session = await login(email);
      const phone = await http().post('/me/profile').set('Authorization', session).send({ bio: 'Call me on 9876543210' });
      expect(phone.status).toBe(422);
      expect(phone.body.error.code).toBe('PROFILE_INVALID');
      const named = await http().post('/me/profile').set('Authorization', session).send({ displayName: 'me@example.com' });
      expect(named.status).toBe(422);
    });

    it('does not give a seeker a provider bio', async () => {
      const { email } = await register('seeker');
      const session = await login(email);
      const res = await http().post('/me/profile').set('Authorization', session).send({ bio: 'hello' });
      expect(res.status).toBe(422);
    });
  });

  describe('a seeker declaring fields (#6, #19)', () => {
    it('adds many, in a language the field offers, with exactly one primary', async () => {
      const { email } = await register('seeker');
      const session = await login(email);

      const first = await http().post('/me/domains').set('Authorization', session).send({ domainCode: 'uppsc', workingLanguage: 'hi' });
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject([{ domainCode: 'uppsc', workingLanguage: 'hi', isPrimary: true }]);

      const badLang = await http().post('/me/domains').set('Authorization', session).send({ domainCode: 'uppsc', workingLanguage: 'ta' });
      expect(badLang.status).toBe(422);

      const removed = await http().post('/me/domains/uppsc/remove').set('Authorization', session);
      expect(removed.body).toEqual([]);
    });

    it('is refused to a provider, whose fields come from verified skills', async () => {
      const { email } = await register('provider');
      const session = await login(email);
      const res = await http().post('/me/domains').set('Authorization', session).send({ domainCode: 'uppsc' });
      expect(res.status).toBe(403);
    });
  });

  describe('provider readiness', () => {
    it('names no family it was not given, and blocks on email and profile', async () => {
      const { email } = await register('provider');
      const session = await login(email);
      const res = await http().get('/me/readiness').set('Authorization', session);
      expect(res.status).toBe(200);
      expect(res.body.families).toEqual(['civil_services_exams']); // from signup, not a default
      const step = (code: string) => res.body.steps.find((s: { code: string }) => s.code === code);
      expect(step('email_verified')).toMatchObject({ done: false, blocking: true });
      expect(step('profile_complete')).toMatchObject({ done: false, blocking: true });
      expect(res.body.bookable).toBe(false);
    });

    it('asks which family for training when there is nothing to go on', async () => {
      const email = `p.${Date.now()}@test.local`;
      await http().post('/auth/register').send({ email, password: PASSWORD, role: 'provider', confirmsAdult: true });
      const session = await login(email);
      const readiness = await http().get('/me/readiness').set('Authorization', session);
      expect(readiness.body.families).toEqual([]);
      const training = await http().get('/me/training').set('Authorization', session);
      expect(training.status).toBe(422);
      expect(training.body.error.code).toBe('FAMILY_REQUIRED');
    });
  });

  describe('sessions expire when idle', () => {
    it('keeps a used session alive and ends an idle one', async () => {
      const { email, userId } = await register('seeker');
      const session = await login(email);
      expect((await http().get('/auth/me').set('Authorization', session)).status).toBe(200);
      await pool.query(`UPDATE user_sessions SET last_seen_at = now() - interval '8 days' WHERE user_id = $1`, [userId]);
      expect((await http().get('/auth/me').set('Authorization', session)).status).toBe(401);
    });
  });
});
