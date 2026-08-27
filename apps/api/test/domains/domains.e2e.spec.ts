import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { AdminModule } from '../../src/modules/admin/admin.module';
import { DomainLoaderService } from '../../src/modules/domains/domain-loader.service';
import { DomainManifestService } from '../../src/modules/domains/domain-manifest.service';
import { DomainsModule } from '../../src/modules/domains/domains.module';
import { FamilyManifestService } from '../../src/modules/domains/family-manifest.service';
import { TaxonomyService } from '../../src/modules/taxonomy/taxonomy.service';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { resetDatabase, seedAdminUser } from '../test-utils';
import { domainManifestV1, domainManifestV2, familyManifestV1 } from './manifest-fixtures';

describe('domain engine: publish, resolve, inheritance', () => {
  let app: INestApplication;
  let pool: Pool;
  let families: FamilyManifestService;
  let domains: DomainManifestService;
  let loader: DomainLoaderService;
  let taxonomy: TaxonomyService;

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([DomainsModule, AdminModule]);
      pool = app.get<Pool>(PG_POOL);
      families = app.get(FamilyManifestService);
      domains = app.get(DomainManifestService);
      loader = app.get(DomainLoaderService);
      taxonomy = app.get(TaxonomyService);
    }
    await resetDatabase(pool);
    loader.clearAll();
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  it('resolves a published family manifest', async () => {
    const resolved = await families.publish(familyManifestV1());
    expect(resolved.code).toBe('civil_services_exams');
    expect(resolved.labels.provider.en).toBe('Mentor');
    expect(resolved.flagshipEngagement).toBe('document_review');
    expect(resolved.policy.minTierForPaidWork).toBe('t2');
    expect(resolved.theme.signature).toBe('ruled_answer_sheet');
  });

  it('syncs skills, assessment templates and credential types from the family manifest', async () => {
    await families.publish(familyManifestV1());

    const templates = await pool.query(`SELECT code FROM assessment_templates WHERE family_code = 'civil_services_exams' AND active ORDER BY code`);
    expect(templates.rows.map((r) => r.code)).toEqual(['answer_writing.v1', 'essay.v1', 'language_paper.v1']);

    const skills = await pool.query(`SELECT code FROM skills WHERE family_code = 'civil_services_exams' AND active ORDER BY code`);
    expect(skills.rows.map((r) => r.code)).toEqual([
      'answer_writing.essay',
      'answer_writing.gs.polity',
      'language.hindi.formal',
      'state_gs.up',
    ]);

    const polityTemplate = await pool.query(
      `SELECT at.code FROM skills s JOIN assessment_templates at ON at.id = s.template_id WHERE s.code = 'answer_writing.gs.polity'`,
    );
    expect(polityTemplate.rows[0].code).toBe('answer_writing.v1');

    const credentials = await pool.query(`SELECT code FROM credential_types WHERE family_code = 'civil_services_exams' AND active ORDER BY code`);
    expect(credentials.rows.map((r) => r.code)).toEqual(['exam_rank', 'mains_cleared']);
  });

  it('rejects a domain manifest naming a family that does not exist', async () => {
    await expect(domains.publish(domainManifestV1())).rejects.toThrow(/unknown family/);
  });

  it('rejects a domain manifest mapping a category to an unknown skill', async () => {
    await families.publish(familyManifestV1());
    const raw = domainManifestV1() as Record<string, unknown>;
    const categories = raw.categories as Array<Record<string, unknown>>;
    (categories[0].children as Array<Record<string, unknown>>)[0].skills = ['no_such_skill'];
    await expect(domains.publish(raw)).rejects.toThrow(/unknown skill/);
  });

  it('resolves a domain by inheriting family vocabulary/engagementTypes/theme and adding its own fields', async () => {
    await families.publish(familyManifestV1());
    const resolved = await domains.publish(domainManifestV1());

    expect(resolved.domainCode).toBe('uppsc');
    expect(resolved.familyCode).toBe('civil_services_exams');
    // Inherited straight from the family, not duplicated in the domain manifest:
    expect(resolved.labels.provider.en).toBe('Mentor');
    expect(resolved.labels.seeker.en).toBe('Aspirant');
    expect(resolved.engagementTypes).toEqual(['document_review', 'live_session', 'written_qa', 'async_task']);
    expect(resolved.theme.signature).toBe('ruled_answer_sheet');
    // Domain's own:
    expect(resolved.labels.domain.en).toBe('UP PCS');
    expect(resolved.languages).toEqual(['hi', 'en']);
    expect(resolved.defaultLanguage).toBe('hi');
    expect(resolved.priceBands.document_review).toEqual([6000, 20000]);
    expect(resolved.resultSource?.sourceCode).toBe('uppsc_results');
  });

  it('materializes the category tree with resolved skill IDs', async () => {
    await families.publish(familyManifestV1());
    await domains.publish(domainManifestV1());

    const tree = await taxonomy.getCategoryTree('uppsc');
    expect(tree).toHaveLength(1);
    expect(tree[0].slug).toBe('mains');
    expect(tree[0].children.map((c) => c.slug)).toEqual(['gs', 'essay', 'general-hindi']);

    const gs = tree[0].children.find((c) => c.slug === 'gs')!;
    const skillCodes = await pool.query(
      `SELECT code FROM skills WHERE id = ANY($1::uuid[]) ORDER BY code`,
      [gs.skillIds],
    );
    expect(skillCodes.rows.map((r) => r.code)).toEqual(['answer_writing.gs.polity', 'state_gs.up']);
  });

  it('a category, an assessment template, and skill.template_id together resolve the rubric a category uses', async () => {
    await families.publish(familyManifestV1());
    await domains.publish(domainManifestV1());

    const tree = await taxonomy.getCategoryTree('uppsc');
    const essay = tree[0].children.find((c) => c.slug === 'essay')!;
    expect(essay.assessmentTemplateId).toBeNull(); // no direct override — resolved via its skill

    const res = await pool.query(
      `SELECT at.code FROM category_skills cs
         JOIN skills s ON s.id = cs.skill_id
         JOIN assessment_templates at ON at.id = s.template_id
        WHERE cs.category_id = $1`,
      [essay.id],
    );
    expect(res.rows[0].code).toBe('essay.v1');
  });

  it('re-publishing a domain keeps the same category ids (no churn on every republish)', async () => {
    await families.publish(familyManifestV1());
    await domains.publish(domainManifestV1());
    const before = await taxonomy.getCategoryTree('uppsc');

    await domains.publish(domainManifestV2());
    const after = await taxonomy.getCategoryTree('uppsc');

    expect(after[0].id).toBe(before[0].id);
    expect(after[0].children.map((c) => c.id).sort()).toEqual(before[0].children.map((c) => c.id).sort());
  });

  it('ACCEPTANCE (M2): changing a label and a price in a manifest changes resolved output with no restart', async () => {
    await families.publish(familyManifestV1());
    await domains.publish(domainManifestV1());

    const v1 = await loader.getDomain('uppsc');
    expect(v1.labels.domain.en).toBe('UP PCS');
    expect(v1.priceBands.document_review).toEqual([6000, 20000]);

    // Same running process — nothing restarted, nothing redeployed.
    await domains.publish(domainManifestV2());

    const v2 = await loader.getDomain('uppsc');
    expect(v2.labels.domain.en).toBe('UP PCS (2027 cycle)');
    expect(v2.priceBands.document_review).toEqual([8000, 25000]);
    // Everything not touched by v2 is untouched:
    expect(v2.labels.domain.hi).toBe(v1.labels.domain.hi);
    expect(v2.languages).toEqual(v1.languages);
  });

  it('publishing a family invalidates every cached domain in that family, not just the family cache', async () => {
    await families.publish(familyManifestV1());
    await domains.publish(domainManifestV1());
    await loader.getDomain('uppsc'); // warm the cache

    const updatedFamily = familyManifestV1() as Record<string, unknown>;
    (updatedFamily.labels as Record<string, unknown>).provider = { en: 'Coach', hi: 'कोच' };
    await families.publish(updatedFamily);

    const resolved = await loader.getDomain('uppsc');
    expect(resolved.labels.provider.en).toBe('Coach');
  });

  describe('via the admin pack-editor HTTP surface', () => {
    it('publishes a family and a domain manifest end to end and exposes them read-only', async () => {
      const adminId = await seedAdminUser(pool);
      const familyRes = await request(app.getHttpServer())
        .post('/admin/families/manifest')
        .set('x-actor-id', adminId)
        .set('idempotency-key', 'publish-family-1')
        .send(familyManifestV1())
        .expect(201);
      expect(familyRes.body.code).toBe('civil_services_exams');

      const domainRes = await request(app.getHttpServer())
        .post('/admin/domains/manifest')
        .set('x-actor-id', adminId)
        .set('idempotency-key', 'publish-domain-1')
        .send(domainManifestV1())
        .expect(201);
      expect(domainRes.body.domainCode).toBe('uppsc');

      const getRes = await request(app.getHttpServer()).get('/domains/uppsc').expect(200);
      expect(getRes.body.labels.domain.en).toBe('UP PCS');

      const categoriesRes = await request(app.getHttpServer()).get('/domains/uppsc/categories').expect(200);
      expect(categoriesRes.body[0].slug).toBe('mains');
    });

    it('rejects an invalid manifest with the standard error envelope', async () => {
      const adminId = await seedAdminUser(pool);
      const raw = familyManifestV1() as Record<string, unknown>;
      delete raw.code;

      const res = await request(app.getHttpServer())
        .post('/admin/families/manifest')
        .set('x-actor-id', adminId)
        .set('idempotency-key', 'publish-family-invalid')
        .send(raw);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MANIFEST_INVALID');
      expect(res.body.error.detail.issues.some((i: string) => i.startsWith('code:'))).toBe(true);
      expect(res.body.error.requestId).toBeTruthy();
    });

    it('404s a domain that does not exist, through the same envelope', async () => {
      const res = await request(app.getHttpServer()).get('/domains/does-not-exist');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('DOMAIN_NOT_FOUND');
    });
  });
});
