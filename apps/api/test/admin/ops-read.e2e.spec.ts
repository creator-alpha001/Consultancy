import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditService } from '../../src/common/audit/audit.service';
import { PG_POOL } from '../../src/database/db.module';
import { AdminModule } from '../../src/modules/admin/admin.module';
import { authenticate } from '../auth-helpers';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { resetDatabase, seedFeeSchedule } from '../test-utils';

/**
 * The operations console's configuration page read a hardcoded fee table
 * and a made-up audit log. These routes serve the real ones, read-only.
 */
describe('admin read views: fee schedules and the audit log', () => {
  let app: INestApplication;
  let pool: Pool;
  const http = () => request(app.getHttpServer());

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([AdminModule]);
      pool = app.get<Pool>(PG_POOL);
    }
    await resetDatabase(pool);
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  it('reads the rate in force through fee_schedule_at, with its history', async () => {
    const admin = await authenticate(app, 'admin');
    // An expired schedule and the current one.
    await pool.query(
      `INSERT INTO fee_schedules (currency, effective_from, effective_to, platform_fee_bps)
       VALUES ('INR', now() - interval '30 days', now() - interval '2 days', 2000)`,
    );
    await seedFeeSchedule(pool, 'INR', 1500);

    const res = await http().get('/admin/fee-schedules').set('Authorization', admin.bearer);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].current.platformFeeBps).toBe(1500);
    expect(res.body[0].history.map((h: { platformFeeBps: number }) => h.platformFeeBps)).toEqual([2000, 1500]);
  });

  it('reports no current rate, rather than inventing one, when nothing covers now', async () => {
    const admin = await authenticate(app, 'admin');
    await pool.query(
      `INSERT INTO fee_schedules (currency, effective_from, effective_to, platform_fee_bps)
       VALUES ('INR', now() - interval '30 days', now() - interval '2 days', 2000)`,
    );
    const res = await http().get('/admin/fee-schedules').set('Authorization', admin.bearer);
    expect(res.body[0].current).toBeNull();
  });

  it('lists the audit log newest first, naming people without their email', async () => {
    const admin = await authenticate(app, 'admin');
    await pool.query(`UPDATE users SET display_name = 'Ops Reviewer' WHERE id = $1`, [admin.userId]);
    const audit = app.get(AuditService);
    await audit.record({ actorId: admin.userId, actorRole: 'admin', action: 'first', subjectType: 'test', detail: {} });
    await audit.record({ actorId: null, action: 'second', subjectType: 'test', detail: { n: 2 } });

    const res = await http().get('/admin/audit-log?subjectType=test').set('Authorization', admin.bearer);
    expect(res.status).toBe(200);
    expect(res.body.map((e: { action: string }) => e.action)).toEqual(['second', 'first']);
    expect(res.body[0].actorName).toBeNull(); // the platform acted
    expect(res.body[1].actorName).toBe('Ops Reviewer');
    expect(JSON.stringify(res.body)).not.toContain('@');
  });

  it('is refused to anyone but an admin', async () => {
    const seeker = await authenticate(app, 'seeker');
    expect((await http().get('/admin/audit-log').set('Authorization', seeker.bearer)).status).toBe(403);
    expect((await http().get('/admin/fee-schedules')).status).toBe(401);
  });
});
