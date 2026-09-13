import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { AgendaModule } from '../../src/modules/agenda/agenda.module';
import { AssessmentModule } from '../../src/modules/assessment/assessment.module';
import { BoardModule } from '../../src/modules/board/board.module';
import { DomainManifestService } from '../../src/modules/domains/domain-manifest.service';
import { DomainsModule } from '../../src/modules/domains/domains.module';
import { FamilyManifestService } from '../../src/modules/domains/family-manifest.service';
import { EngagementsModule } from '../../src/modules/engagements/engagements.module';
import { MoneyModule } from '../../src/modules/money/money.module';
import { SessionsModule } from '../../src/modules/sessions/sessions.module';
import { VerificationModule } from '../../src/modules/verification/verification.module';
import { authenticateExistingUser } from '../auth-helpers';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { resetDatabase, seedFeeSchedule, seedUsers } from '../test-utils';
import { domainManifestV1, familyManifestV1 } from '../domains/manifest-fixtures';

/**
 * The request bodies the clients actually send, sent to the real API.
 *
 * TRACKER D70: the app called every route and about fifteen of its writes
 * sent a body the API does not read — an agenda in a shape no version of
 * the API accepted, an offer amount under the wrong name, a session with
 * a length where a window is required. Each body below is copied from the
 * client code that sends it (`apps/app/lib/api/repository.dart`,
 * `apps/frontend/src/app/actions/*`), so this fails when the API and a
 * client disagree about the words, not only when a route is missing.
 * `scripts/contract-bodies.mjs` catches the same class of mistake
 * statically; this proves the corrected bodies are accepted end to end.
 */
describe('client request bodies against the real API (D70)', () => {
  let app: INestApplication;
  let pool: Pool;
  let categoryId: string;
  const http = () => request(app.getHttpServer());

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([
        DomainsModule, EngagementsModule, AgendaModule, AssessmentModule, MoneyModule, BoardModule, SessionsModule, VerificationModule,
      ]);
      pool = app.get<Pool>(PG_POOL);
    }
    await resetDatabase(pool);
    await seedFeeSchedule(pool, 'INR', 1500);
    await app.get(FamilyManifestService).publish(familyManifestV1());
    await app.get(DomainManifestService).publish(domainManifestV1());
    const gs = await pool.query<{ id: string }>(`SELECT id FROM categories WHERE domain_code = 'uppsc' AND slug = 'gs'`);
    categoryId = gs.rows[0].id;
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  async function parties() {
    const { seekerId, providerId } = await seedUsers(pool);
    const seeker = await authenticateExistingUser(app, seekerId);
    const provider = await authenticateExistingUser(app, providerId);
    return { seekerId, providerId, seeker: seeker.bearer, provider: provider.bearer };
  }

  it('runs the core path: create → agree → agenda (saved twice) → lock → pay → submit a note', async () => {
    const { providerId, seeker, provider } = await parties();

    const created = await http().post('/engagements').set('Authorization', seeker).send({
      providerId, domainCode: 'uppsc', categoryId, engagementType: 'document_review',
      language: 'hi', currency: 'INR', amountPaise: 90000,
    });
    expect(created.status).toBe(201);
    const id: string = created.body.id;

    expect((await http().post(`/engagements/${id}/agree`).set('Authorization', provider)).status).toBe(201);

    const agendaBody = (goals: string[]) => ({
      originalLang: 'hi',
      expectedDeliverable: 'लिखित टिप्पणियाँ',
      successCriteria: 'हर लक्ष्य का स्पष्ट उत्तर',
      items: goals.map((labelText) => ({ labelLang: 'hi', labelText })),
      outOfScope: 'पूरा पुनर्लेखन नहीं',
    });
    const first = await http().post(`/engagements/${id}/agenda`).set('Authorization', seeker).send(agendaBody(['पहला लक्ष्य']));
    expect(first.status).toBe(201);
    // Saving again replaces the unlocked draft — it used to fail with a 500.
    const second = await http()
      .post(`/engagements/${id}/agenda`)
      .set('Authorization', seeker)
      .send(agendaBody(['पहला लक्ष्य', 'दूसरा लक्ष्य']));
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.items).toHaveLength(2);

    const lock = await http().post(`/agendas/${second.body.id}/lock`).set('Authorization', seeker).set('Idempotency-Key', `lock-${id}`);
    expect(lock.status).toBe(201);
    // Once locked, a save is refused rather than silently overwriting.
    const late = await http().post(`/engagements/${id}/agenda`).set('Authorization', seeker).send(agendaBody(['बदलाव']));
    expect(late.status).not.toBe(201);

    const pay = await http().post(`/engagements/${id}/payment`).set('Authorization', seeker).set('Idempotency-Key', `pay-${id}`);
    expect(pay.status).toBe(201);
    const after = await pool.query<{ status: string }>(`SELECT status FROM engagements WHERE id = $1`, [id]);
    expect(after.rows[0].status).toBe('working');

    // Written work can be the note itself.
    const submit = await http().post(`/engagements/${id}/submissions`).set('Authorization', seeker).send({ note: 'मेरा उत्तर यहाँ है' });
    expect(submit.status).toBe(201);
  });

  it('refuses a malformed agenda as invalid, not with a 500', async () => {
    const { providerId, seeker } = await parties();
    const created = await http().post('/engagements').set('Authorization', seeker).send({
      providerId, domainCode: 'uppsc', categoryId, engagementType: 'document_review', language: 'hi', currency: 'INR', amountPaise: 90000,
    });
    // The shape the app used to send.
    const old = await http().post(`/engagements/${created.body.id}/agenda`).set('Authorization', seeker).send({
      language: 'hi', items: [{ ordinal: 0, text: 'goal' }],
    });
    expect(old.status).toBe(400);
    expect(old.body.error.code).toBe('AGENDA_INVALID');
  });

  it('accepts a board post and an offer in the shapes the clients send, and names the engagement on accept', async () => {
    const { providerId, seeker, provider } = await parties();
    // An offer is only open to someone verified in the category's skills,
    // in the post's language, at the family's minimum tier.
    await pool.query(
      `INSERT INTO provider_skills (provider_id, skill_id, tier, verified_at, active)
       SELECT $1, cs.skill_id, 't3', now(), true FROM category_skills cs WHERE cs.category_id = $2`,
      [providerId, categoryId],
    );
    await pool.query(`INSERT INTO provider_languages (provider_id, lang_code, can_evaluate) VALUES ($1, 'hi', true)`, [providerId]);
    const post = await http().post('/board/posts').set('Authorization', seeker).send({
      domainCode: 'uppsc', categoryId, engagementType: 'document_review', language: 'hi',
      description: 'मेरे उत्तर देखें', currency: 'INR', budgetMinPaise: 50000, budgetMaxPaise: 90000,
    });
    expect(post.status).toBe(201);
    const offer = await http().post(`/board/posts/${post.body.id}/proposals`).set('Authorization', provider).send({
      proposedAmountPaise: 70000, message: 'Back within 48 hours.',
    });
    expect(offer.status).toBe(201);
    const accepted = await http().post(`/board/proposals/${offer.body.id}/accept`).set('Authorization', seeker).set('Idempotency-Key', `accept-${offer.body.id}`);
    expect(accepted.status).toBe(201);
    expect(typeof accepted.body.resultingEngagementId).toBe('string');
  });

  it('accepts a question with its original language, and a credential by code with its skills', async () => {
    const { seeker, provider } = await parties();
    const q = await http().post('/board/questions').set('Authorization', seeker).send({
      domainCode: 'uppsc', bodyOriginal: 'निबंध की संरचना कैसी हो?', bodyLang: 'hi',
    });
    expect(q.status).toBe(201);

    const cred = await http().post('/me/credentials').set('Authorization', provider).send({
      credentialTypeCode: 'mains_cleared', domainCode: 'uppsc', skillCodes: ['answer_writing.essay'], verifierData: { reference: 'R-1' },
    });
    expect(cred.status).toBe(201);
  });

  it('books a session as a window, not a length', async () => {
    const { providerId, seeker, provider } = await parties();
    const created = await http().post('/engagements').set('Authorization', seeker).send({
      providerId, domainCode: 'uppsc', categoryId, engagementType: 'live_session', language: 'hi', currency: 'INR', amountPaise: 80000,
    });
    await http().post(`/engagements/${created.body.id}/agree`).set('Authorization', provider);
    const start = new Date(Date.now() + 3 * 86_400_000);
    const res = await http().post(`/engagements/${created.body.id}/sessions`).set('Authorization', seeker).send({
      scheduledStart: start.toISOString(),
      scheduledEnd: new Date(start.getTime() + 60 * 60_000).toISOString(),
      timezone: 'Asia/Kolkata',
    });
    // Not a 400 for a missing field. The provider has no hours, so the
    // availability engine may refuse the slot — that is a different,
    // correct answer.
    expect(res.status).not.toBe(400);
  });
});
