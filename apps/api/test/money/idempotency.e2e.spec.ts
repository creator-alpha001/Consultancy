import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { MoneyModule } from '../../src/modules/money/money.module';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { findAccountId, accountBalance, resetDatabase, seedEngagement, seedFeeSchedule, seedUsers } from '../test-utils';

describe('Idempotency-Key on mutating money endpoints', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([MoneyModule]);
      pool = app.get<Pool>(PG_POOL);
    }
    await resetDatabase(pool);
    await seedFeeSchedule(pool, 'INR', 1000); // 10%
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  it('rejects a mutating request with no Idempotency-Key header', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);

    const res = await request(app.getHttpServer())
      .post(`/internal/escrows/${engagementId}/hold`)
      .set('x-actor-id', seekerId)
      .send({ seekerId, providerId, currency: 'INR', amountPaise: 10_000 });

    expect(res.status).toBe(400);
  });

  it('same request twice, same Idempotency-Key -> one effect (definition-of-done idempotency test)', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    const body = { seekerId, providerId, currency: 'INR', amountPaise: 10_000 };

    const first = await request(app.getHttpServer())
      .post(`/internal/escrows/${engagementId}/hold`)
      .set('x-actor-id', seekerId)
      .set('idempotency-key', 'award-key-1')
      .send(body);
    expect(first.status).toBe(201);
    expect(first.body.status).toBe('held');

    const second = await request(app.getHttpServer())
      .post(`/internal/escrows/${engagementId}/hold`)
      .set('x-actor-id', seekerId)
      .set('idempotency-key', 'award-key-1')
      .send(body);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body); // replayed, not re-executed

    const escrowAccountId = await findAccountId(pool, 'escrow', null, 'INR');
    expect(await accountBalance(pool, escrowAccountId!, 'INR')).toBe(10_000n); // not 20,000

    const requestCount = await pool.query(
      `SELECT count(*) FROM idempotency_keys WHERE key = 'award-key-1'`,
    );
    expect(Number(requestCount.rows[0].count)).toBe(1);
  });

  it('rejects reusing the same Idempotency-Key with a different request body', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);

    await request(app.getHttpServer())
      .post(`/internal/escrows/${engagementId}/hold`)
      .set('x-actor-id', seekerId)
      .set('idempotency-key', 'reused-key')
      .send({ seekerId, providerId, currency: 'INR', amountPaise: 10_000 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/internal/escrows/${engagementId}/hold`)
      .set('x-actor-id', seekerId)
      .set('idempotency-key', 'reused-key')
      .send({ seekerId, providerId, currency: 'INR', amountPaise: 99_999 });

    expect(res.status).toBe(409);
  });

  it('release is idempotent through the HTTP layer too', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    const held = await request(app.getHttpServer())
      .post(`/internal/escrows/${engagementId}/hold`)
      .set('x-actor-id', seekerId)
      .set('idempotency-key', `hold:${engagementId}`)
      .send({ seekerId, providerId, currency: 'INR', amountPaise: 50_000 })
      .expect(201);

    const escrowId = held.body.id as string;

    const firstRelease = await request(app.getHttpServer())
      .post(`/internal/escrows/${escrowId}/release`)
      .set('x-actor-id', providerId)
      .set('idempotency-key', `release:${escrowId}`)
      .send({})
      .expect(201);

    const secondRelease = await request(app.getHttpServer())
      .post(`/internal/escrows/${escrowId}/release`)
      .set('x-actor-id', providerId)
      .set('idempotency-key', `release:${escrowId}`)
      .send({})
      .expect(201);

    expect(secondRelease.body).toEqual(firstRelease.body);

    const providerAccountId = await findAccountId(pool, 'provider_wallet', providerId, 'INR');
    expect(await accountBalance(pool, providerAccountId!, 'INR')).toBe(45_000n); // 50,000 - 10% fee, paid once
  });
});
