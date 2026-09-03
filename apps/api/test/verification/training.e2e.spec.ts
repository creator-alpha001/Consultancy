import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { DomainsModule } from '../../src/modules/domains/domains.module';
import { FamilyManifestService } from '../../src/modules/domains/family-manifest.service';
import { DomainManifestService } from '../../src/modules/domains/domain-manifest.service';
import { TrainingService } from '../../src/modules/verification/training.service';
import { VerificationModule } from '../../src/modules/verification/verification.module';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { resetDatabase, seedUsers } from '../test-utils';
import { domainManifestV1, familyManifestV1 } from '../domains/manifest-fixtures';

/**
 * Training, and the record of it.
 *
 * This is a duty-of-care mechanism (CLAUDE.md #24/#25), not a compliance
 * checkbox, so the tests are about the properties that make it worth
 * anything: the answers never reach the person answering, a partial pass
 * is not a pass, and the record cannot be edited afterwards.
 */
describe('provider training', () => {
  let app: INestApplication;
  let pool: Pool;
  let training: TrainingService;

  const FAMILY = 'civil_services_exams';

  /** A family whose training is short enough to reason about. */
  function familyWithTraining() {
    return {
      ...familyManifestV1(),
      trainingModules: [
        {
          code: 'safety',
          required: true,
          labels: { en: 'Safety' },
          sections: [{ heading: { en: 'What to do' }, body: { en: 'Stay with them.' } }],
          questions: [
            {
              code: 'q1',
              prompt: { en: 'What first?' },
              options: [
                { code: 'a', labels: { en: 'End the session' } },
                { code: 'b', labels: { en: 'Stay with them' } },
              ],
              correct: 'b',
            },
            {
              code: 'q2',
              prompt: { en: 'And then?' },
              options: [
                { code: 'a', labels: { en: 'Report it' } },
                { code: 'b', labels: { en: 'Say nothing' } },
              ],
              correct: 'a',
            },
          ],
        },
        {
          code: 'optional_extra',
          required: false,
          labels: { en: 'Nice to know' },
          sections: [{ heading: { en: 'H' }, body: { en: 'B' } }],
          questions: [
            {
              code: 'q1',
              prompt: { en: 'Anything?' },
              options: [
                { code: 'a', labels: { en: 'Yes' } },
                { code: 'b', labels: { en: 'No' } },
              ],
              correct: 'a',
            },
          ],
        },
      ],
    };
  }

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([DomainsModule, VerificationModule]);
      pool = app.get<Pool>(PG_POOL);
      training = app.get(TrainingService);
    }
    await resetDatabase(pool);
    await app.get(FamilyManifestService).publish(familyWithTraining());
    await app.get(DomainManifestService).publish(domainManifestV1());
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  it('never sends the answers to the person answering', async () => {
    const { providerId } = await seedUsers(pool);
    const state = await training.forProvider(providerId, FAMILY);

    // A quiz whose answers arrive in the page teaches nothing, and this
    // one covers what to do when someone discloses distress.
    for (const module of state.modules) {
      for (const question of module.questions) {
        expect(question).not.toHaveProperty('correct');
      }
    }
  });

  it('offers the support resources without requiring anything first', async () => {
    // Someone may arrive here because something already happened. Making
    // them pass a quiz to reach a helpline number would be the worst
    // possible ordering.
    const { providerId } = await seedUsers(pool);
    const state = await training.forProvider(providerId, FAMILY);
    expect(state.supportResources.length).toBeGreaterThan(0);
  });

  it('refuses a partial pass, and says which answers were wrong', async () => {
    const { providerId } = await seedUsers(pool);
    const result = await training.submit({
      providerId,
      familyCode: FAMILY,
      moduleCode: 'safety',
      answers: { q1: 'b', q2: 'b' },
    });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(1);
    expect(result.outOf).toBe(2);
    // Named, so a failed attempt teaches rather than sending someone back
    // to guess faster.
    expect(result.wrong).toEqual(['q2']);

    const rows = await pool.query(`SELECT 1 FROM provider_training_completions WHERE provider_id = $1`, [
      providerId,
    ]);
    expect(rows.rowCount).toBe(0);
  });

  it('records a pass against the manifest version it was taken at', async () => {
    const { providerId } = await seedUsers(pool);
    const result = await training.submit({
      providerId,
      familyCode: FAMILY,
      moduleCode: 'safety',
      answers: { q1: 'b', q2: 'a' },
    });
    expect(result.passed).toBe(true);

    const rows = await pool.query<{ manifest_version: string; score: number }>(
      `SELECT manifest_version, score FROM provider_training_completions WHERE provider_id = $1`,
      [providerId],
    );
    expect(rows.rows[0].manifest_version).toBe(familyManifestV1().version);
    expect(Number(rows.rows[0].score)).toBe(2);
  });

  it('is complete once every REQUIRED module is passed, not every module', async () => {
    const { providerId } = await seedUsers(pool);
    await training.submit({
      providerId,
      familyCode: FAMILY,
      moduleCode: 'safety',
      answers: { q1: 'b', q2: 'a' },
    });

    const state = await training.forProvider(providerId, FAMILY);
    expect(state.complete).toBe(true);
    expect(state.modules.find((m) => m.code === 'optional_extra')?.completedAt).toBeNull();
  });

  it('asks for a retake when the content is revised', async () => {
    const { providerId } = await seedUsers(pool);
    await training.submit({
      providerId,
      familyCode: FAMILY,
      moduleCode: 'safety',
      answers: { q1: 'b', q2: 'a' },
    });

    // A revision — a helpline changes, a rule changes. What they read
    // before is no longer what the platform says.
    await app.get(FamilyManifestService).publish({ ...familyWithTraining(), version: '1.1.0' });

    const state = await training.forProvider(providerId, FAMILY);
    const safety = state.modules.find((m) => m.code === 'safety');
    expect(safety?.completedAt).toBeNull();
    // Not erased — the record of what they were shown before survives.
    expect(safety?.needsRetake).toBe(true);
    expect(state.complete).toBe(false);
  });

  it('keeps the completion record append-only', async () => {
    const { providerId } = await seedUsers(pool);
    await training.submit({
      providerId,
      familyCode: FAMILY,
      moduleCode: 'safety',
      answers: { q1: 'b', q2: 'a' },
    });

    // "Was this person told, and when" is a question an incident review
    // asks. A record that can be edited afterwards cannot answer it.
    await expect(
      pool.query(`UPDATE provider_training_completions SET score = 0 WHERE provider_id = $1`, [providerId]),
    ).rejects.toThrow(/append-only/);
    await expect(
      pool.query(`DELETE FROM provider_training_completions WHERE provider_id = $1`, [providerId]),
    ).rejects.toThrow(/append-only/);
  });
});
