import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { AssessmentModule } from '../../src/modules/assessment/assessment.module';
import { EvaluationService } from '../../src/modules/assessment/evaluation.service';
import { DisputesModule } from '../../src/modules/disputes/disputes.module';
import { DomainManifestService } from '../../src/modules/domains/domain-manifest.service';
import { DomainsModule } from '../../src/modules/domains/domains.module';
import { FamilyManifestService } from '../../src/modules/domains/family-manifest.service';
import { EngagementsModule } from '../../src/modules/engagements/engagements.module';
import { EngagementsService } from '../../src/modules/engagements/engagements.service';
import { MoneyModule } from '../../src/modules/money/money.module';
import { authenticateExistingUser } from '../auth-helpers';
import { domainManifestV1, familyManifestV1 } from '../domains/manifest-fixtures';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { resetDatabase, seedFeeSchedule, seedUsers } from '../test-utils';

/**
 * "There is nothing here", answered so a client can tell.
 *
 * Several GETs return null as a legitimate answer rather than an error.
 * The most important is `assessment-template`: an objective category has
 * no rubric at all, and CLAUDE.md #3 says a caller must handle that
 * rather than assume a template exists.
 *
 * It used to be answered as a **200 with an empty body**, which is what
 * Nest's Express adapter does with a null return. That is ambiguous with
 * a void endpoint, does not parse as JSON, and crashed a real client on
 * exactly the "no template" path the rule exists to protect (TRACKER
 * D59). It is now a 204.
 *
 * These tests exist so it stays that way — and so the *present* case
 * keeps returning a body, which is the half a status-code change is
 * most likely to break.
 */
describe('absent answers are 204, not an empty 200', () => {
  let app: INestApplication;
  let pool: Pool;
  let engagements: EngagementsService;
  let evaluations: EvaluationService;
  let categoryId: string;

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([
        DomainsModule,
        EngagementsModule,
        AssessmentModule,
        DisputesModule,
        MoneyModule,
      ]);
      pool = app.get<Pool>(PG_POOL);
      engagements = app.get(EngagementsService);
      evaluations = app.get(EvaluationService);
    }
    await resetDatabase(pool);
    await seedFeeSchedule(pool);
    await app.get(FamilyManifestService).publish(familyManifestV1());
    await app.get(DomainManifestService).publish(domainManifestV1());
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM categories WHERE domain_code = 'uppsc' AND slug = 'gs'`,
    );
    categoryId = rows[0].id;
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  async function anEngagement(): Promise<{ id: string; token: string }> {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagement = await engagements.createDraft({
      seekerId,
      providerId,
      domainCode: 'uppsc',
      categoryId,
      engagementType: 'document_review',
      currency: 'INR',
      amountPaise: 50_000n,
      language: 'en',
    });
    const { token } = await authenticateExistingUser(app, seekerId);
    return { id: engagement.id, token };
  }

  it('an evaluation that has not been written is 204 with no body', async () => {
    const { id, token } = await anEngagement();
    const res = await request(app.getHttpServer())
      .get(`/engagements/${id}/evaluations/latest`)
      .set('authorization', `Bearer ${token}`)
      .expect(204);

    // The point of the whole change: a client can tell this apart from a
    // body, and never has to parse an empty string.
    expect(res.text).toBe('');
  });

  it('a submission that was never sent is 204 with no body', async () => {
    const { id, token } = await anEngagement();
    await request(app.getHttpServer())
      .get(`/engagements/${id}/submissions/latest`)
      .set('authorization', `Bearer ${token}`)
      .expect(204);
  });

  it('an engagement with no dispute is 204, not an empty 200', async () => {
    const { id, token } = await anEngagement();
    await request(app.getHttpServer())
      .get(`/engagements/${id}/disputes`)
      .set('authorization', `Bearer ${token}`)
      .expect(204);
  });

  it('the status matches what the service actually answered', async () => {
    // The real contract, and the interceptor's whole job: 204 when the
    // service says null, 200 with a body when it does not. Asserted as a
    // CORRESPONDENCE rather than a fixed expectation, because whether
    // this fixture's category carries a template is a property of the
    // fixture — and a test that silently stopped exercising the
    // present-case would be worse than one that says which case it ran.
    const { id, token } = await anEngagement();
    const fromService = await evaluations.templateForEngagement(id);

    const res = await request(app.getHttpServer())
      .get(`/engagements/${id}/assessment-template`)
      .set('authorization', `Bearer ${token}`);

    if (fromService === null) {
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
    } else {
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.dimensions)).toBe(true);
    }
  });

  it('a single object that DOES exist is still 200 with a body', async () => {
    // The half most likely to break: it would be easy to turn every nil
    // check into a 204 and notice nothing until a screen went blank. An
    // engagement always exists, so this case never goes vacuous.
    const { id, token } = await anEngagement();
    const res = await request(app.getHttpServer())
      .get(`/engagements/${id}`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.id).toBe(id);
  });

  it('a list with nothing in it is still 200 and an empty array', async () => {
    // A list is never "absent" — an empty list is a complete answer, and
    // turning it into a 204 would make every empty-state screen fall
    // through its error path instead.
    const { token } = await anEngagement();
    const res = await request(app.getHttpServer())
      .get('/engagements')
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('an unauthenticated caller still gets 401, not 204', async () => {
    // 204 must mean "nothing to show you", never "you may not look".
    // Those are different answers and the interceptor must not blur them.
    const { id } = await anEngagement();
    await request(app.getHttpServer())
      .get(`/engagements/${id}/evaluations/latest`)
      .expect(401);
  });
});
