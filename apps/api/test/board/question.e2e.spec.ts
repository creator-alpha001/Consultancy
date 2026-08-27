import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { BoardModule } from '../../src/modules/board/board.module';
import { QuestionService } from '../../src/modules/board/question.service';
import { DomainManifestService } from '../../src/modules/domains/domain-manifest.service';
import { DomainsModule } from '../../src/modules/domains/domains.module';
import { FamilyManifestService } from '../../src/modules/domains/family-manifest.service';
import { EngagementsModule } from '../../src/modules/engagements/engagements.module';
import { SafetyModule } from '../../src/modules/safety/safety.module';
import { VerificationModule } from '../../src/modules/verification/verification.module';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { resetDatabase, seedUsers } from '../test-utils';
import { domainManifestV1, familyManifestV1 } from '../domains/manifest-fixtures';

/**
 * CLAUDE.md hard rule #25 and "things you must not do — auto-publish
 * flagged content": distress-flagged and contact-leak questions are
 * held, not rejected, and a distress hold carries the family's real
 * helpline numbers. Also covers the per-domain daily free-question quota
 * (policy data, never hardcoded).
 */
describe('board/QuestionService', () => {
  let app: INestApplication;
  let pool: Pool;
  let families: FamilyManifestService;
  let domains: DomainManifestService;
  let questions: QuestionService;

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([DomainsModule, EngagementsModule, VerificationModule, SafetyModule, BoardModule]);
      pool = app.get<Pool>(PG_POOL);
      families = app.get(FamilyManifestService);
      domains = app.get(DomainManifestService);
      questions = app.get(QuestionService);
    }
    await resetDatabase(pool);
    await families.publish(familyManifestV1());
    await domains.publish(domainManifestV1()); // freeQuestionsPerDay: 3
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  it('publishes an ordinary question immediately, with no support resources attached', async () => {
    const { seekerId } = await seedUsers(pool);
    const result = await questions.ask({
      seekerId,
      domainCode: 'uppsc',
      bodyOriginal: 'How should I structure a GS-III answer on economic survey topics?',
      bodyLang: 'en',
    });
    expect(result.heldForReview).toBe(false);
    expect(result.question.status).toBe('published');
    expect(result.supportResources).toBeUndefined();
  });

  it('holds distress language for review and returns the family\'s real helplines, never a rejection', async () => {
    const { seekerId } = await seedUsers(pool);
    const result = await questions.ask({
      seekerId,
      domainCode: 'uppsc',
      bodyOriginal: 'I feel like I want to die after failing prelims again.',
      bodyLang: 'en',
    });
    expect(result.heldForReview).toBe(true);
    expect(result.question.status).toBe('held_for_review');
    expect(result.question.distressFlagged).toBe(true);
    expect(result.supportResources).toEqual([{ label: 'Tele-MANAS', value: '14416' }]);

    const heldQueue = await questions.listHeldForReview();
    expect(heldQueue.map((q) => q.id)).toContain(result.question.id);
    // Never surfaced publicly while held.
    expect((await questions.listPublished('uppsc')).map((q) => q.id)).not.toContain(result.question.id);
  });

  it('holds a contact-leak attempt for review without flagging it as distress', async () => {
    const { seekerId } = await seedUsers(pool);
    const result = await questions.ask({
      seekerId,
      domainCode: 'uppsc',
      bodyOriginal: 'Message me on whatsapp at 9876543210 for notes.',
      bodyLang: 'en',
    });
    expect(result.heldForReview).toBe(true);
    expect(result.question.distressFlagged).toBe(false);
    expect(result.supportResources).toBeUndefined();
  });

  it('a reviewer can clear a held question back to published', async () => {
    const { seekerId } = await seedUsers(pool);
    const result = await questions.ask({
      seekerId, domainCode: 'uppsc', bodyOriginal: 'reach me at test@example.com', bodyLang: 'en',
    });
    const cleared = await questions.clearForReview(result.question.id);
    expect(cleared.status).toBe('published');
    expect((await questions.listPublished('uppsc')).map((q) => q.id)).toContain(result.question.id);
  });

  it('enforces the domain\'s daily free-question quota', async () => {
    const { seekerId } = await seedUsers(pool);
    for (let i = 0; i < 3; i++) {
      await questions.ask({ seekerId, domainCode: 'uppsc', bodyOriginal: `question ${i}`, bodyLang: 'en' });
    }
    await expect(
      questions.ask({ seekerId, domainCode: 'uppsc', bodyOriginal: 'one too many', bodyLang: 'en' }),
    ).rejects.toMatchObject({ code: 'QUESTION_QUOTA_EXCEEDED' });
  });

  it('answering a published question marks it answered', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const result = await questions.ask({ seekerId, domainCode: 'uppsc', bodyOriginal: 'a normal question', bodyLang: 'en' });
    await questions.answer(result.question.id, providerId, 'Here is how I would approach it.');
    const after = await questions.get(result.question.id);
    expect(after.status).toBe('answered');
  });
});
