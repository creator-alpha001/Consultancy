import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { DomainManifestService } from '../../src/modules/domains/domain-manifest.service';
import { DomainsModule } from '../../src/modules/domains/domains.module';
import { FamilyManifestService } from '../../src/modules/domains/family-manifest.service';
import { CredentialService } from '../../src/modules/verification/credential.service';
import { MatchingService } from '../../src/modules/verification/matching.service';
import { ProviderLanguageService } from '../../src/modules/verification/provider-language.service';
import { VerificationModule } from '../../src/modules/verification/verification.module';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { resetDatabase, seedUsers } from '../test-utils';
import { domainManifestV1, familyManifestV1 } from '../domains/manifest-fixtures';

/**
 * CLAUDE.md #19: "Language is a first-class matching dimension
 * everywhere. A seeker working in Hindi cannot be served by a
 * Hindi-incapable provider."
 *
 * `provider_languages` drove matching from M4 onwards, but nothing ever
 * wrote to it outside the seed — so a provider could not say what
 * languages they work in, and a regional-medium aspirant could not find
 * anyone even when the right person was on the platform. These tests
 * cover the write path and, more importantly, that the gate it feeds
 * still refuses.
 */
describe('the languages a provider works in', () => {
  let app: INestApplication;
  let pool: Pool;
  let languages: ProviderLanguageService;
  let matching: MatchingService;
  let credentials: CredentialService;
  let families: FamilyManifestService;
  let domains: DomainManifestService;

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([DomainsModule, VerificationModule]);
      pool = app.get<Pool>(PG_POOL);
      languages = app.get(ProviderLanguageService);
      matching = app.get(MatchingService);
      credentials = app.get(CredentialService);
      families = app.get(FamilyManifestService);
      domains = app.get(DomainManifestService);
    }
    await resetDatabase(pool);
    await families.publish(familyManifestV1());
    await domains.publish(domainManifestV1());
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  /** A provider verified for one skill, so matching has something to return. */
  async function verifiedProvider(): Promise<{ providerId: string; skillId: string }> {
    const { providerId, seekerId: reviewerId } = await seedUsers(pool);
    const credential = await credentials.submit({
      providerId,
      credentialTypeCode: 'exam_rank',
      domainCode: 'uppsc',
      skillCodes: ['answer_writing.gs.polity'],
      verifierData: { rollNo: '0451923', year: 2019 },
    });
    await credentials.runAutomatedCheck(credential.id);
    await credentials.decide({ credentialId: credential.id, reviewerId, decision: 'verified' });
    const skill = await pool.query<{ id: string }>(`SELECT id FROM skills WHERE code = 'answer_writing.gs.polity'`);
    return { providerId, skillId: skill.rows[0].id };
  }

  it('offers exactly the languages the family\'s domains serve, and refuses anything else', async () => {
    const offerable = await languages.offerableLanguages('civil_services_exams');
    // Pack data: the fixture domain declares these. Core names no
    // language anywhere, so this list changes with the manifest.
    expect(offerable).toContain('hi');
    expect(offerable).toContain('en');

    const { providerId } = await seedUsers(pool);
    await expect(
      languages.replace(providerId, 'civil_services_exams', [{ langCode: 'xx', canEvaluate: true }]),
    ).rejects.toMatchObject({ code: 'UNKNOWN_WORKING_LANGUAGES' });
  });

  it('lets a provider declare and later drop a language', async () => {
    const { providerId } = await seedUsers(pool);

    await languages.replace(providerId, 'civil_services_exams', [
      { langCode: 'hi', canEvaluate: true },
      { langCode: 'en', canEvaluate: true },
    ]);
    expect((await languages.listFor(providerId)).map((l) => l.langCode)).toEqual(['en', 'hi']);

    // Dropping has to be as easy as adding, or the data rots towards
    // over-claiming — and over-claiming means a seeker matched to
    // someone who cannot read their script.
    await languages.replace(providerId, 'civil_services_exams', [{ langCode: 'hi', canEvaluate: true }]);
    expect((await languages.listFor(providerId)).map((l) => l.langCode)).toEqual(['hi']);
  });

  it('gates matching on the language the seeker actually works in (#19)', async () => {
    const { providerId, skillId } = await verifiedProvider();
    await languages.replace(providerId, 'civil_services_exams', [{ langCode: 'hi', canEvaluate: true }]);

    expect(await matching.getVerifiedProviders({ skillIds: [skillId], langCode: 'hi' })).toContain(providerId);
    // The whole point: verified for the skill, and still not offered to
    // someone working in a language they cannot read.
    expect(await matching.getVerifiedProviders({ skillIds: [skillId], langCode: 'en' })).not.toContain(providerId);
  });

  it('separates speaking a language from being able to assess written work in it', async () => {
    const { providerId, skillId } = await verifiedProvider();
    // Speaks English, but does not mark written English answers.
    await languages.replace(providerId, 'civil_services_exams', [
      { langCode: 'hi', canEvaluate: true },
      { langCode: 'en', canEvaluate: false },
    ]);

    expect(await matching.getVerifiedProviders({ skillIds: [skillId], langCode: 'hi' })).toContain(providerId);
    // Being handed work you cannot read is worse for both sides than
    // not being matched, so matching uses can_evaluate, not mere
    // presence in the list.
    expect(await matching.getVerifiedProviders({ skillIds: [skillId], langCode: 'en' })).not.toContain(providerId);

    // But the claim itself is kept — a client can still show "speaks
    // English" without it affecting who gets matched.
    const declared = await languages.listFor(providerId);
    expect(declared.find((l) => l.langCode === 'en')?.canEvaluate).toBe(false);
  });

  it('records a language change, in both directions', async () => {
    const { providerId } = await seedUsers(pool);
    await languages.replace(providerId, 'civil_services_exams', [{ langCode: 'hi', canEvaluate: true }]);
    await languages.replace(providerId, 'civil_services_exams', [{ langCode: 'en', canEvaluate: true }]);

    const log = await pool.query<{ detail: { before: string[]; after: string[] } }>(
      `SELECT detail FROM audit_log
        WHERE action = 'provider.working_languages_set' AND subject_id = $1
        ORDER BY created_at`,
      [providerId],
    );
    expect(log.rows).toHaveLength(2);
    // A provider who drops the language a dispute was conducted in
    // should not be able to make that quietly.
    expect(log.rows[1].detail.before).toEqual(['hi']);
    expect(log.rows[1].detail.after).toEqual(['en']);
  });
});
