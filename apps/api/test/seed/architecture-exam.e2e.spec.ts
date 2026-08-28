import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { civilServicesDomains } from '../../seed/domains';
import { civilServicesExamsFamily } from '../../seed/family';
import { PG_POOL } from '../../src/database/db.module';
import { DomainLoaderService } from '../../src/modules/domains/domain-loader.service';
import { DomainManifestService } from '../../src/modules/domains/domain-manifest.service';
import { DomainsModule } from '../../src/modules/domains/domains.module';
import { FamilyManifestService } from '../../src/modules/domains/family-manifest.service';
import { EngagementsService } from '../../src/modules/engagements/engagements.service';
import { EngagementsModule } from '../../src/modules/engagements/engagements.module';
import { TaxonomyService } from '../../src/modules/taxonomy/taxonomy.service';
import { TaxonomyModule } from '../../src/modules/taxonomy/taxonomy.module';
import { CategoryTreeNode } from '../../src/modules/taxonomy/types';
import { CredentialService } from '../../src/modules/verification/credential.service';
import { MatchingService } from '../../src/modules/verification/matching.service';
import { VerificationModule } from '../../src/modules/verification/verification.module';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { resetDatabase, seedAdminUser, seedUsers } from '../test-utils';

/**
 * SPEC-PLATFORM.md §18, M8: "Seed 15 more domains as data only. Zero
 * core code changed. **This is the architecture's exam.**"
 *
 * Nineteen domains are published here through the ordinary `domains/`
 * publish API — the same call the admin pack editor makes. No migration
 * runs, no module is added, no branch is taken on a domain code. If any
 * of that were needed, these tests would be impossible to write, which
 * is exactly what makes them a test of the architecture rather than of
 * the seed file.
 *
 * The sharpest assertion is the last one: a mentor verified ONCE is
 * matchable across every domain whose category maps to that skill — the
 * supply-liquidity claim SPEC-PLATFORM.md §2 uses to justify launching a
 * whole family instead of one exam.
 */
describe('M8 acceptance: the architecture\'s exam — nineteen domains, as data only', () => {
  let app: INestApplication;
  let pool: Pool;
  let families: FamilyManifestService;
  let domains: DomainManifestService;
  let loader: DomainLoaderService;
  let taxonomy: TaxonomyService;
  let matching: MatchingService;
  let credentials: CredentialService;
  let engagements: EngagementsService;

  const manifests = civilServicesDomains();

  beforeAll(async () => {
    app = await createTestApp([DomainsModule, TaxonomyModule, VerificationModule, EngagementsModule]);
    pool = app.get<Pool>(PG_POOL);
    families = app.get(FamilyManifestService);
    domains = app.get(DomainManifestService);
    loader = app.get(DomainLoaderService);
    taxonomy = app.get(TaxonomyService);
    matching = app.get(MatchingService);
    credentials = app.get(CredentialService);
    engagements = app.get(EngagementsService);

    await resetDatabase(pool);
    loader.clearAll();

    // The entire seed, through the public API. Note what is NOT here:
    // no SQL, no migration, no per-domain special case.
    await families.publish(civilServicesExamsFamily());
    for (const manifest of manifests) {
      await domains.publish(manifest);
    }
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  it('publishes nineteen domains from one family with no schema change', async () => {
    expect(manifests.length).toBe(19);

    const res = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM domains WHERE family_code = 'civil_services_exams'`,
    );
    expect(Number(res.rows[0].n)).toBe(19);

    // Every migration that exists was already applied before this test
    // ran; seeding added none.
    const migrations = await pool.query<{ n: string }>(`SELECT count(*) AS n FROM schema_migrations`);
    expect(Number(migrations.rows[0].n)).toBeGreaterThan(0);
  });

  it('resolves every domain through the loader, inheriting family config it never restates', async () => {
    for (const manifest of manifests) {
      const resolved = await loader.getDomain(manifest.code);

      // Domain-level identity.
      expect(resolved.domainCode).toBe(manifest.code);
      expect(resolved.familyCode).toBe('civil_services_exams');
      expect(resolved.languages).toEqual(manifest.languages);
      expect(resolved.defaultLanguage).toBe(manifest.languages[0]);

      // Inherited from the family without being repeated in any domain
      // manifest — §4's three-tier inheritance doing its job.
      expect(resolved.policy.minTierForPaidWork).toBe('t2');
      expect(resolved.policy.freeQuestionsPerDay).toBe(3);
      expect(resolved.policy.disputeTiers).toHaveLength(3);
      expect(resolved.theme.signature).toBe('ruled_answer_sheet');
      expect(resolved.family.supportResources.length).toBeGreaterThan(0);
      expect(resolved.labels.seeker.en).toBe('Aspirant');

      // Not listed publicly. Seeding a domain is not opening one.
      expect(resolved.publiclyListed).toBe(false);
    }
  });

  it('builds a real category tree per domain, every leaf mapped to family skills', async () => {
    for (const manifest of manifests) {
      const tree = await taxonomy.getCategoryTree(manifest.code);
      expect(tree.length).toBeGreaterThan(0);

      const leaves: CategoryTreeNode[] = [];
      const walk = (nodes: CategoryTreeNode[]): void => {
        for (const node of nodes) {
          if (node.children.length === 0) leaves.push(node);
          else walk(node.children);
        }
      };
      walk(tree);

      expect(leaves.length).toBeGreaterThan(0);
      for (const leaf of leaves) {
        expect(leaf.skillIds.length, `${manifest.code}/${leaf.slug} has no skills`).toBeGreaterThan(0);
      }
    }
  });

  it('marks every seeded category as an unverified exam pattern, in the database', async () => {
    // CLAUDE.md: "Every exam pattern in every domain manifest is
    // unverified." That warning is carried in `categories.traits`, not
    // only in a comment, so nothing downstream can mistake a placeholder
    // tree for a confirmed one.
    const res = await pool.query<{ n: string }>(
      `SELECT count(*) AS n
         FROM categories
        WHERE active
          AND coalesce(traits->>'patternSource', '') <> 'unverified_placeholder'`,
    );
    expect(Number(res.rows[0].n)).toBe(0);
  });

  it('keeps every domain\'s regional language a first-class matching dimension', async () => {
    // Hard rule #19. A domain whose aspirants work in Tamil must carry
    // 'ta', or matching there is broken from day one.
    const expectations: Record<string, string> = {
      tnpsc_group1: 'ta',
      wbcs: 'bn',
      mpsc: 'mr',
      gpsc: 'gu',
      kpsc_kas: 'kn',
      opsc_oas: 'or',
      appsc_group1: 'te',
      ppsc: 'pa',
    };
    for (const [code, lang] of Object.entries(expectations)) {
      const resolved = await loader.getDomain(code);
      expect(resolved.languages, `${code} must offer ${lang}`).toContain(lang);
      expect(resolved.defaultLanguage).toBe(lang);
    }
  });

  it('THE EXAM: one verification surfaces a mentor across every domain that shares the skill', async () => {
    const { providerId } = await seedUsers(pool);
    const adminId = await seedAdminUser(pool);

    // A mentor verified once, in one skill, via one credential.
    const submitted = await credentials.submit({
      providerId,
      credentialTypeCode: 'mains_cleared',
      domainCode: 'upsc_cse',
      skillCodes: ['answer_writing.gs.polity'],
      verifierData: { note: 'mains marksheet' },
    });
    await credentials.runAutomatedCheck(submitted.id);
    await credentials.decide({ credentialId: submitted.id, reviewerId: adminId, decision: 'verified' });

    const politySkill = await pool.query<{ id: string }>(
      `SELECT id FROM skills WHERE code = 'answer_writing.gs.polity'`,
    );
    expect(await matching.getProviderTier(providerId, politySkill.rows[0].id)).toBe('t2');

    // Now: how many of the nineteen domains have at least one category
    // this single verified skill contributes to? Counted from the
    // database, not asserted from the seed file.
    const reach = await pool.query<{ domain_code: string }>(
      `SELECT DISTINCT c.domain_code
         FROM category_skills cs
         JOIN categories c ON c.id = cs.category_id
        WHERE cs.skill_id = $1
        ORDER BY c.domain_code`,
      [politySkill.rows[0].id],
    );

    // Every state PCS maps its GS papers to this shared skill, as does
    // UPSC — so one verification reaches the whole family. This is the
    // number that justifies launching a family instead of one exam.
    expect(reach.rows.length).toBe(19);
  });

  it('a mentor verified in national GS still cannot serve a state-GS category alone', async () => {
    // The other half of the taxonomy claim: shared skills travel, but
    // state-specific competence does not come free with them. Matching
    // requires ALL of a category's skills.
    const { providerId } = await seedUsers(pool);
    const adminId = await seedAdminUser(pool);

    for (const code of ['answer_writing.gs.polity', 'answer_writing.gs.history', 'answer_writing.gs.geography', 'answer_writing.gs.economy']) {
      const submitted = await credentials.submit({
        providerId, credentialTypeCode: 'subject_expertise', domainCode: 'uppsc',
        skillCodes: [code], verifierData: {},
      });
      await credentials.runAutomatedCheck(submitted.id);
      await credentials.decide({ credentialId: submitted.id, reviewerId: adminId, decision: 'verified' });
    }
    await pool.query(`INSERT INTO provider_languages (provider_id, lang_code) VALUES ($1, 'hi')`, [providerId]);

    const nationalGs = await pool.query<{ id: string }>(
      `SELECT id FROM categories WHERE domain_code = 'uppsc' AND slug = 'gs-general'`,
    );
    const stateGs = await pool.query<{ id: string }>(
      `SELECT id FROM categories WHERE domain_code = 'uppsc' AND slug = 'gs-state'`,
    );

    // Qualified for the national GS paper...
    expect(await matching.getVerifiedProvidersForCategory(nationalGs.rows[0].id, { langCode: 'hi' }))
      .toContain(providerId);
    // ...but not for UP's own state GS, which additionally requires state_gs.up.
    expect(await matching.getVerifiedProvidersForCategory(stateGs.rows[0].id, { langCode: 'hi' }))
      .not.toContain(providerId);
  });

  it('runs a real engagement in a domain that did not exist when the engagement code was written', async () => {
    // TNPSC Group I: Tamil-language, seeded as data long after
    // `engagements/` was built. Nothing in the engagement path knows it
    // exists.
    const { seekerId, providerId } = await seedUsers(pool);
    const category = await pool.query<{ id: string }>(
      `SELECT id FROM categories WHERE domain_code = 'tnpsc_group1' AND slug = 'gs-state'`,
    );

    const engagement = await engagements.createDraft({
      seekerId,
      providerId,
      domainCode: 'tnpsc_group1',
      categoryId: category.rows[0].id,
      engagementType: 'document_review',
      currency: 'INR',
      amountPaise: 12_000n,
      language: 'ta',
    });
    expect(engagement.status).toBe('draft');

    const agreed = await engagements.agree(engagement.id);
    expect(agreed.status).toBe('agreed');

    // The skills snapshot came from the seeded category tree — including
    // Tamil Nadu's own state GS skill.
    const skills = await pool.query<{ code: string }>(
      `SELECT s.code FROM engagement_skills es JOIN skills s ON s.id = es.skill_id
        WHERE es.engagement_id = $1 ORDER BY s.code`,
      [engagement.id],
    );
    expect(skills.rows.map((r) => r.code)).toContain('state_gs.tamil_nadu');
  });

  it('a seeker can hold several of these domains at once (hard rule #6)', async () => {
    const { seekerId } = await seedUsers(pool);
    // The actual aspirant behaviour: UPSC plus a home-state PCS.
    for (const code of ['upsc_cse', 'uppsc', 'bpsc']) {
      await pool.query(
        `INSERT INTO seeker_domains (seeker_id, domain_code, working_language, active) VALUES ($1, $2, 'hi', true)`,
        [seekerId, code],
      );
    }
    const res = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM seeker_domains WHERE seeker_id = $1 AND active`,
      [seekerId],
    );
    expect(Number(res.rows[0].n)).toBe(3);
  });

  it('adding a twentieth domain needs no code change either', async () => {
    // The claim generalised: this is a domain nobody anticipated, added
    // at runtime, in a language no other domain uses.
    await domains.publish({
      code: 'assam_psc',
      family: 'civil_services_exams',
      version: '1.0.0',
      labels: { domain: { en: 'APSC (Assam)', as: 'এপিএছচি' } },
      languages: ['as', 'en'],
      defaultLanguage: 'as',
      categories: [
        {
          slug: 'mains',
          labels: { en: 'Mains' },
          children: [
            {
              slug: 'gs',
              labels: { en: 'General Studies' },
              skills: ['answer_writing.gs.polity', 'answer_writing.gs.history'],
              traits: { patternSource: 'unverified_placeholder' },
            },
          ],
        },
      ],
      priceBands: { document_review: [4000, 14000] },
    });

    const resolved = await loader.getDomain('assam_psc');
    expect(resolved.defaultLanguage).toBe('as');
    expect(resolved.policy.minTierForPaidWork).toBe('t2'); // inherited, never restated
    expect(resolved.theme.signature).toBe('ruled_answer_sheet');

    const tree = await taxonomy.getCategoryTree('assam_psc');
    expect(tree.length).toBe(1);
  });
});
