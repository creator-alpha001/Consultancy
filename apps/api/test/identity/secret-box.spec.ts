import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { SecretBox } from '../../src/modules/identity/secret-box';
import { TotpService } from '../../src/modules/identity/totp.service';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { resetDatabase } from '../test-utils';

const KEY = 'a passphrase that is certainly at least thirty-two characters long';
const OTHER = 'a different passphrase, also well over thirty-two characters';

describe('SecretBox (D18: second-factor secrets encrypted at rest)', () => {
  it('seals so the stored value reveals nothing, and opens it again', () => {
    const box = new SecretBox({ MFA_ENCRYPTION_KEY: KEY });
    const sealed = box.seal('JBSWY3DPEHPK3PXP');
    expect(sealed).toMatch(/^v1:[0-9a-f]{8}:/);
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(box.seal('JBSWY3DPEHPK3PXP')).not.toBe(sealed); // random IV
    expect(box.open(sealed)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('reads a legacy plain value, and marks it for re-sealing', () => {
    const box = new SecretBox({ MFA_ENCRYPTION_KEY: KEY });
    expect(box.open('JBSWY3DPEHPK3PXP')).toBe('JBSWY3DPEHPK3PXP');
    expect(box.needsReseal('JBSWY3DPEHPK3PXP')).toBe(true);
  });

  it('opens values sealed with the previous key during rotation, and re-seals them', () => {
    const old = new SecretBox({ MFA_ENCRYPTION_KEY: OTHER });
    const sealedOld = old.seal('SECRET');
    const rotated = new SecretBox({ MFA_ENCRYPTION_KEY: KEY, MFA_ENCRYPTION_KEY_PREVIOUS: OTHER });
    expect(rotated.open(sealedOld)).toBe('SECRET');
    expect(rotated.needsReseal(sealedOld)).toBe(true);
    expect(rotated.needsReseal(rotated.seal('SECRET'))).toBe(false);
  });

  it('refuses a tampered value rather than returning garbage', () => {
    const box = new SecretBox({ MFA_ENCRYPTION_KEY: KEY });
    const sealed = box.seal('SECRET');
    const tampered = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'BB' : 'AA');
    expect(() => box.open(tampered)).toThrow();
  });

  it('refuses a value sealed with a key it does not hold', () => {
    const sealed = new SecretBox({ MFA_ENCRYPTION_KEY: OTHER }).seal('SECRET');
    expect(() => new SecretBox({ MFA_ENCRYPTION_KEY: KEY }).open(sealed)).toThrow(/no key available/);
  });

  it('will not start in production without a key, and rejects a weak key anywhere', () => {
    expect(() => new SecretBox({ NODE_ENV: 'production' })).toThrow(/required in production/);
    expect(() => new SecretBox({ MFA_ENCRYPTION_KEY: 'short' })).toThrow(/32/);
  });
});

describe('second-factor secrets in the database', () => {
  let app: INestApplication;
  let pool: Pool;
  const http = () => request(app.getHttpServer());

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([], [{ token: SecretBox, useValue: new SecretBox({ MFA_ENCRYPTION_KEY: KEY }) }]);
      pool = app.get<Pool>(PG_POOL);
    }
    await resetDatabase(pool);
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  async function admin(): Promise<{ email: string; password: string }> {
    const email = `ops.${Date.now()}@test.local`;
    const password = 'an operations passphrase';
    await http().post('/auth/register').send({ email, password, role: 'seeker', confirmsAdult: true });
    await pool.query(`UPDATE users SET role = 'admin' WHERE email = $1`, [email]);
    return { email, password };
  }

  it('stores only ciphertext at enrolment, and a code from the real secret still signs in', async () => {
    const { email, password } = await admin();
    const ticket = await http().post('/auth/login').send({ email, password });
    const bearer = `Bearer ${ticket.body.enrolmentToken}`;
    const enrol = await http().post('/auth/mfa/enrol').set('Authorization', bearer);
    const secret: string = enrol.body.secret;

    const stored = await pool.query<{ secret: string }>(`SELECT secret FROM auth_factors`);
    expect(stored.rows[0].secret).toMatch(/^v1:/);
    expect(stored.rows[0].secret).not.toContain(secret);

    const totp = app.get(TotpService);
    await http().post('/auth/mfa/confirm').set('Authorization', bearer).send({ code: totp.codeAt(secret) });
    const login = await http().post('/auth/login').send({ email, password, totpCode: totp.codeAt(secret) });
    expect(login.status).toBe(201);
    expect(login.body.outcome).toBe('session');
  });

  it('upgrades a secret stored before encryption, on its next use', async () => {
    const { email, password } = await admin();
    const legacy = 'JBSWY3DPEHPK3PXP';
    await pool.query(
      `INSERT INTO auth_factors (user_id, type, secret, confirmed_at)
       SELECT id, 'totp', $2, now() FROM users WHERE email = $1`,
      [email, legacy],
    );
    const totp = app.get(TotpService);
    const login = await http().post('/auth/login').send({ email, password, totpCode: totp.codeAt(legacy) });
    expect(login.status).toBe(201);
    const stored = await pool.query<{ secret: string }>(`SELECT secret FROM auth_factors`);
    expect(stored.rows[0].secret).toMatch(/^v1:/);
  });
});
