import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { DomainManifestService } from '../../src/modules/domains/domain-manifest.service';
import { DomainsModule } from '../../src/modules/domains/domains.module';
import { FamilyManifestService } from '../../src/modules/domains/family-manifest.service';
import { EngagementsService } from '../../src/modules/engagements/engagements.service';
import { EngagementsModule } from '../../src/modules/engagements/engagements.module';
import { CredentialService } from '../../src/modules/verification/credential.service';
import { MatchingService } from '../../src/modules/verification/matching.service';
import { VerificationModule } from '../../src/modules/verification/verification.module';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { resetDatabase, seedAdminUser, seedUsers } from '../test-utils';
import { domainManifestBpsc, domainManifestV1, familyManifestV1 } from '../domains/manifest-fixtures';

/**
 * SPEC-PLATFORM.md §18, M4's own done-when bar: "A provider verifies
 * once and appears in matching for four domains." Proven here with two
 * domains (uppsc, bpsc) sharing one family-level skill — the mechanism
 * is identical at twenty; two is enough to prove it isn't a coincidence
 * of a single domain's own bookkeeping.
 */
describe('M4 acceptance: submit -> automated check -> human review -> tier grant -> cross-domain matching', () => {
  let app: INestApplication;
  let pool: Pool;
  let families: FamilyManifestService;
  let domains: DomainManifestService;
  let credentials: CredentialService;
  let matching: MatchingService;
  let engagements: EngagementsService;
  let polityCategoryUppsc: string;
  let polityCategoryBpsc: string;
  let politySkillId: string;

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([DomainsModule, VerificationModule, EngagementsModule]);
      pool = app.get<Pool>(PG_POOL);
      families = app.get(FamilyManifestService);
      domains = app.get(DomainManifestService);
      credentials = app.get(CredentialService);
      matching = app.get(MatchingService);
      engagements = app.get(EngagementsService);
    }
    await resetDatabase(pool);

    await families.publish(familyManifestV1());
    await domains.publish(domainManifestV1());
    await domains.publish(domainManifestBpsc());

    const gs = await pool.query<{ id: string }>(`SELECT id FROM categories WHERE domain_code = 'uppsc' AND slug = 'gs'`);
    polityCategoryUppsc = gs.rows[0].id;
    const gs1 = await pool.query<{ id: string }>(`SELECT id FROM categories WHERE domain_code = 'bpsc' AND slug = 'gs1'`);
    polityCategoryBpsc = gs1.rows[0].id;
    const skill = await pool.query<{ id: string }>(`SELECT id FROM skills WHERE code = 'answer_writing.gs.polity'`);
    politySkillId = skill.rows[0].id;
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  async function seedResultListEntry(): Promise<void> {
    await pool.query(
      `INSERT INTO result_list_entries (domain_code, source_code, cycle_year, roll_no, candidate_name, rank, service_allotted)
       VALUES ('uppsc', 'uppsc_results', 2024, 'R1001', 'Priya Singh', 42, 'PCS (Executive)')`,
    );
  }

  it('verifies a provider once and surfaces them in matching for BOTH domains that share the skill', async () => {
    await seedResultListEntry();
    const { providerId } = await seedUsers(pool);
    const adminId = await seedAdminUser(pool);

    // Before verification: not findable in either domain's matching.
    expect(await matching.getVerifiedProvidersForCategory(polityCategoryUppsc)).not.toContain(providerId);
    expect(await matching.getVerifiedProvidersForCategory(polityCategoryBpsc)).not.toContain(providerId);

    // uppsc's 'gs' category requires BOTH skills it maps to (matching
    // intersects on every required skill, not just one) — bpsc's 'gs1'
    // only requires the polity skill, so this single credential covers
    // both domains' full requirement.
    const submitted = await credentials.submit({
      providerId,
      credentialTypeCode: 'exam_rank',
      domainCode: 'uppsc',
      skillCodes: ['answer_writing.gs.polity', 'state_gs.up'],
      verifierData: { year: 2024, rollNo: 'R1001', claimedName: 'Priya Singh' },
    });
    expect(submitted.status).toBe('submitted');

    const afterCheck = await credentials.runAutomatedCheck(submitted.id);
    expect(afterCheck.status).toBe('under_review'); // automated pass never bypasses human review
    expect(afterCheck.automatedCheckResult?.passed).toBe(true);
    expect(afterCheck.automatedCheckResult?.detail.rank).toBe(42);

    const verified = await credentials.decide({ credentialId: submitted.id, reviewerId: adminId, decision: 'verified' });
    expect(verified.status).toBe('verified');

    const tier = await matching.getProviderTier(providerId, politySkillId);
    expect(tier).toBe('t3'); // exam_rank's minTierGranted in the fixture

    // ONE verification, TWO domains — no second submission, no second review.
    expect(await matching.getVerifiedProvidersForCategory(polityCategoryUppsc)).toContain(providerId);
    expect(await matching.getVerifiedProvidersForCategory(polityCategoryBpsc)).toContain(providerId);
  });

  it('never grants a tier from an automated pass alone — only a human decision does', async () => {
    await seedResultListEntry();
    const { providerId } = await seedUsers(pool);
    const submitted = await credentials.submit({
      providerId,
      credentialTypeCode: 'exam_rank',
      domainCode: 'uppsc',
      skillCodes: ['answer_writing.gs.polity'],
      verifierData: { year: 2024, rollNo: 'R1001', claimedName: 'Priya Singh' },
    });
    await credentials.runAutomatedCheck(submitted.id);

    expect(await matching.getProviderTier(providerId, politySkillId)).toBeNull();
    expect(await matching.getVerifiedProvidersForCategory(polityCategoryUppsc)).not.toContain(providerId);
  });

  it('an automated check against a fabricated roll number fails, but still goes to a human rather than auto-rejecting', async () => {
    const { providerId } = await seedUsers(pool);
    const submitted = await credentials.submit({
      providerId,
      credentialTypeCode: 'exam_rank',
      domainCode: 'uppsc',
      skillCodes: ['answer_writing.gs.polity'],
      verifierData: { year: 2024, rollNo: 'NO_SUCH_ROLL', claimedName: 'Nobody' },
    });
    const afterCheck = await credentials.runAutomatedCheck(submitted.id);
    expect(afterCheck.status).toBe('under_review');
    expect(afterCheck.automatedCheckResult?.passed).toBe(false);
  });

  it('a rejected credential grants no tier', async () => {
    await seedResultListEntry();
    const { providerId } = await seedUsers(pool);
    const adminId = await seedAdminUser(pool);
    const submitted = await credentials.submit({
      providerId,
      credentialTypeCode: 'exam_rank',
      domainCode: 'uppsc',
      skillCodes: ['answer_writing.gs.polity'],
      verifierData: { year: 2024, rollNo: 'R1001' },
    });
    await credentials.runAutomatedCheck(submitted.id);
    const rejected = await credentials.decide({
      credentialId: submitted.id,
      reviewerId: adminId,
      decision: 'rejected',
      note: 'Marksheet did not match claimed roll number on manual check',
    });
    expect(rejected.status).toBe('rejected');
    expect(await matching.getProviderTier(providerId, politySkillId)).toBeNull();
  });

  it('language filtering excludes a verified provider who does not work in the requested language', async () => {
    await seedResultListEntry();
    const { providerId } = await seedUsers(pool);
    const adminId = await seedAdminUser(pool);
    const submitted = await credentials.submit({
      providerId, credentialTypeCode: 'exam_rank', domainCode: 'uppsc',
      skillCodes: ['answer_writing.gs.polity'], verifierData: { year: 2024, rollNo: 'R1001' },
    });
    await credentials.runAutomatedCheck(submitted.id);
    await credentials.decide({ credentialId: submitted.id, reviewerId: adminId, decision: 'verified' });

    expect(await matching.getVerifiedProviders({ skillIds: [politySkillId], langCode: 'ta' })).not.toContain(providerId);

    await pool.query(`INSERT INTO provider_languages (provider_id, lang_code) VALUES ($1, 'hi')`, [providerId]);
    expect(await matching.getVerifiedProviders({ skillIds: [politySkillId], langCode: 'hi' })).toContain(providerId);
  });

  /**
   * What a provider can submit, and what each kind needs.
   *
   * Until this resolved, the family manifest declared credential types
   * that no client could ever see — the same shape of gap as D38 — so a
   * provider had no way to submit anything and every credential in the
   * system arrived through a seed script.
   *
   * The inputs come from the VERIFIER, not from core and not from the
   * family: only the verifier knows what it needs to check.
   */
  describe('submittable credential types', () => {
    it('lists the family\'s types with the inputs their verifier requires', async () => {
      const types = await credentials.submittableTypes('uppsc');
      const byCode = new Map(types.map((t) => [t.code, t]));

      expect(byCode.get('exam_rank')?.inputs.map((i) => i.key).sort()).toEqual(['rollNo', 'year']);
      // A result-list check reads a numeric year; collecting it as text
      // fails at review time rather than at submission.
      expect(byCode.get('exam_rank')?.inputs.find((i) => i.key === 'year')?.kind).toBe('number');
      expect(byCode.get('mains_cleared')?.inputs.map((i) => i.key)).toEqual(['documentRef']);
      expect(byCode.get('mains_cleared')?.inputs[0].kind).toBe('document');
    });

    it('carries the paid-work sanction flags, so a client can warn before submitting', async () => {
      const types = await credentials.submittableTypes('uppsc');
      const serving = types.find((t) => t.code === 'serving_officer');
      expect(serving?.requiresPaidWorkSanction).toBe(true);
      expect(serving?.grantsPaidWorkSanction).toBe(false);
    });

    it('never exposes the publication allow-list', async () => {
      // `publicFields` decides what a PROFILE may show (CLAUDE.md #30).
      // It is not a submission concern, and this endpoint is public — so
      // the shape must not carry it at all.
      const types = await credentials.submittableTypes('uppsc');
      const serialised = JSON.stringify(types);
      expect(serialised).not.toMatch(/publicFields|public_fields/);
      expect(Object.keys(types[0])).not.toContain('publicFields');
    });

    it('offers a type whose verifier is unregistered rather than failing the whole list', async () => {
      // The manifest validator checks that `verifier` is a string, not
      // that anything implements it (D39), so a manifest CAN name a
      // verifier no code registers — and will, the first time one is
      // renamed or removed while published manifests still reference it.
      // That must not stop a provider seeing everything else.
      //
      // Published through the manifest, not by updating credential_types:
      // the manifest jsonb is the source of truth and those tables are a
      // projection of it.
      const manifest = familyManifestV1() as Record<string, unknown>;
      const types_ = manifest.credentialTypes as Array<Record<string, unknown>>;
      types_.push({
        code: 'future_thing',
        labels: { en: 'Something checked by a verifier we have not written' },
        verifier: 'not_a_registered_verifier',
      });
      manifest.version = '2.0.0';
      await families.publish(manifest as never);

      const types = await credentials.submittableTypes('uppsc');
      const broken = types.find((t) => t.code === 'future_thing');
      expect(broken).toBeDefined();
      expect(broken?.inputs).toEqual([]);
      expect(types.length).toBeGreaterThan(1);
    });

    it('404s for a domain that does not exist', async () => {
      await expect(credentials.submittableTypes('no_such_domain')).rejects.toThrow(/DOMAIN_NOT_FOUND|no domain/);
    });
  });

  describe('the serving-officer paid-work gate', () => {
    async function verifyCredentialFor(providerId: string, code: string, adminId: string): Promise<void> {
      const submitted = await credentials.submit({
        providerId, credentialTypeCode: code, domainCode: 'uppsc', skillCodes: [], verifierData: {},
      });
      await credentials.runAutomatedCheck(submitted.id); // sanction_document verifier: always -> under_review
      await credentials.decide({ credentialId: submitted.id, reviewerId: adminId, decision: 'verified' });
    }

    it('blocks a verified serving officer from agreeing to paid work', async () => {
      const { seekerId, providerId } = await seedUsers(pool);
      const adminId = await seedAdminUser(pool);
      await verifyCredentialFor(providerId, 'serving_officer', adminId);

      const engagement = await engagements.createDraft({
        seekerId, providerId, domainCode: 'uppsc', categoryId: polityCategoryUppsc,
        engagementType: 'document_review', currency: 'INR', amountPaise: 50_000n, language: 'hi',
      });

      await expect(engagements.agree(engagement.id)).rejects.toMatchObject({ code: 'PROVIDER_PAID_WORK_BLOCKED' });
    });

    it('lifts the block once departmental sanction is ALSO verified', async () => {
      const { seekerId, providerId } = await seedUsers(pool);
      const adminId = await seedAdminUser(pool);
      await verifyCredentialFor(providerId, 'serving_officer', adminId);
      await verifyCredentialFor(providerId, 'departmental_sanction', adminId);

      const engagement = await engagements.createDraft({
        seekerId, providerId, domainCode: 'uppsc', categoryId: polityCategoryUppsc,
        engagementType: 'document_review', currency: 'INR', amountPaise: 50_000n, language: 'hi',
      });

      const agreed = await engagements.agree(engagement.id);
      expect(agreed.status).toBe('agreed');
    });

    it('does not block a provider with no serving-officer credential at all', async () => {
      const { seekerId, providerId } = await seedUsers(pool);
      const engagement = await engagements.createDraft({
        seekerId, providerId, domainCode: 'uppsc', categoryId: polityCategoryUppsc,
        engagementType: 'document_review', currency: 'INR', amountPaise: 50_000n, language: 'hi',
      });
      const agreed = await engagements.agree(engagement.id);
      expect(agreed.status).toBe('agreed');
    });
  });
});
