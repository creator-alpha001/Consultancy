import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, resetDatabase, seedEngagement, seedUsers } from '../test-utils';

/**
 * Raw-SQL invariant tests for M4's credential pipeline and the
 * paid-work eligibility gate — same spirit as the other invariant
 * suites: prove Postgres itself enforces these, not just the service.
 */
describe('provider credential invariants (raw SQL)', () => {
  const pool = createPool();

  beforeEach(async () => {
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedCredentialType(code = 'exam_rank', flags: { requires?: boolean; grants?: boolean } = {}): Promise<string> {
    await pool.query(
      `INSERT INTO domain_families (code, status, manifest, manifest_version) VALUES ('fam_cred', 'active', '{}'::jsonb, '1.0.0') ON CONFLICT (code) DO NOTHING`,
    );
    const res = await pool.query<{ id: string }>(
      `INSERT INTO credential_types (family_code, code, labels, verifier, min_tier_granted, requires_paid_work_sanction, grants_paid_work_sanction)
       VALUES ('fam_cred', $1, '{"en":"Test credential"}'::jsonb, 'public_result_list', 't3', $2, $3)
       RETURNING id`,
      [code, flags.requires ?? false, flags.grants ?? false],
    );
    return res.rows[0].id;
  }

  async function seedCredential(providerId: string, credentialTypeId: string, domainCode: string): Promise<string> {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO provider_credentials (provider_id, credential_type_id, domain_code) VALUES ($1, $2, $3) RETURNING id`,
      [providerId, credentialTypeId, domainCode],
    );
    return res.rows[0].id;
  }

  async function seedDomain(code = 'dom_cred'): Promise<void> {
    await pool.query(
      `INSERT INTO domain_families (code, status, manifest, manifest_version) VALUES ('fam_cred', 'active', '{}'::jsonb, '1.0.0') ON CONFLICT (code) DO NOTHING`,
    );
    await pool.query(
      `INSERT INTO domains (code, family_code, status, manifest, manifest_version)
       VALUES ($1, 'fam_cred', 'active', '{}'::jsonb, '1.0.0') ON CONFLICT (code) DO NOTHING`,
      [code],
    );
  }

  it('rejects submitted -> verified directly (must pass through under_review)', async () => {
    const { seekerId } = await seedUsers(pool);
    await seedDomain();
    const typeId = await seedCredentialType();
    const credentialId = await seedCredential(seekerId, typeId, 'dom_cred');
    await expect(
      pool.query(`UPDATE provider_credentials SET status = 'verified', reviewed_by = $2, reviewed_at = now() WHERE id = $1`, [credentialId, seekerId]),
    ).rejects.toThrow(/invalid provider credential transition/);
  });

  it('rejects marking verified without recording who reviewed it', async () => {
    const { seekerId } = await seedUsers(pool);
    await seedDomain();
    const typeId = await seedCredentialType();
    const credentialId = await seedCredential(seekerId, typeId, 'dom_cred');
    await pool.query(`UPDATE provider_credentials SET status = 'under_review' WHERE id = $1`, [credentialId]);
    await expect(
      pool.query(`UPDATE provider_credentials SET status = 'verified' WHERE id = $1`, [credentialId]),
    ).rejects.toThrow(/must record who reviewed it|check constraint/);
  });

  it('allows the full submitted -> under_review -> verified path with a reviewer recorded', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    await seedDomain();
    const typeId = await seedCredentialType();
    const credentialId = await seedCredential(providerId, typeId, 'dom_cred');
    await pool.query(`UPDATE provider_credentials SET status = 'under_review' WHERE id = $1`, [credentialId]);
    await pool.query(
      `UPDATE provider_credentials SET status = 'verified', reviewed_by = $2, reviewed_at = now() WHERE id = $1`,
      [credentialId, seekerId],
    );
    const res = await pool.query<{ status: string }>(`SELECT status FROM provider_credentials WHERE id = $1`, [credentialId]);
    expect(res.rows[0].status).toBe('verified');
  });

  it('rejects a duplicate result-list entry for the same source/year/roll number', async () => {
    await seedDomain();
    await pool.query(
      `INSERT INTO result_list_entries (domain_code, source_code, cycle_year, roll_no, candidate_name)
       VALUES ('dom_cred', 'src_1', 2025, 'ROLL1', 'A Sharma')`,
    );
    await expect(
      pool.query(
        `INSERT INTO result_list_entries (domain_code, source_code, cycle_year, roll_no, candidate_name)
         VALUES ('dom_cred', 'src_1', 2025, 'ROLL1', 'Someone Else')`,
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it('provider_skills.tier respects the declared t0 < t1 < ... < t4 ordering', async () => {
    const { providerId } = await seedUsers(pool);
    await pool.query(
      `INSERT INTO domain_families (code, status, manifest, manifest_version) VALUES ('fam_cred', 'active', '{}'::jsonb, '1.0.0')`,
    );
    const skill = await pool.query<{ id: string }>(
      `INSERT INTO skills (family_code, code, labels) VALUES ('fam_cred', 'skill.ordering', '{"en":"x"}'::jsonb) RETURNING id`,
    );
    await pool.query(
      `INSERT INTO provider_skills (provider_id, skill_id, tier) VALUES ($1, $2, 't2')`,
      [providerId, skill.rows[0].id],
    );
    const res = await pool.query<{ meets: boolean }>(`SELECT tier >= 't2'::mentor_tier AS meets FROM provider_skills WHERE provider_id = $1`, [providerId]);
    expect(res.rows[0].meets).toBe(true);
    const res2 = await pool.query<{ meets: boolean }>(`SELECT tier >= 't3'::mentor_tier AS meets FROM provider_skills WHERE provider_id = $1`, [providerId]);
    expect(res2.rows[0].meets).toBe(false);
  });
});

describe('paid-work eligibility gate (raw SQL)', () => {
  const pool = createPool();

  beforeEach(async () => {
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedVerifiedCredential(
    providerId: string,
    domainCode: string,
    familyCode: string,
    code: string,
    flags: { requires?: boolean; grants?: boolean },
  ): Promise<void> {
    const type = await pool.query<{ id: string }>(
      `INSERT INTO credential_types (family_code, code, labels, verifier, requires_paid_work_sanction, grants_paid_work_sanction)
       VALUES ($1, $2, '{"en":"x"}'::jsonb, 'sanction_document', $3, $4) RETURNING id`,
      [familyCode, code, flags.requires ?? false, flags.grants ?? false],
    );
    const credential = await pool.query<{ id: string }>(
      `INSERT INTO provider_credentials (provider_id, credential_type_id, domain_code, status) VALUES ($1, $2, $3, 'under_review') RETURNING id`,
      [providerId, type.rows[0].id, domainCode],
    );
    await pool.query(
      `UPDATE provider_credentials SET status = 'verified', reviewed_by = $2, reviewed_at = now() WHERE id = $1`,
      [credential.rows[0].id, providerId],
    );
  }

  async function seedFamilyAndDomain(): Promise<void> {
    await pool.query(
      `INSERT INTO domain_families (code, status, manifest, manifest_version) VALUES ('fam_paid', 'active', '{}'::jsonb, '1.0.0')`,
    );
    await pool.query(
      `INSERT INTO domains (code, family_code, status, manifest, manifest_version) VALUES ('dom_paid', 'fam_paid', 'active', '{}'::jsonb, '1.0.0')`,
    );
  }

  it('blocks draft -> agreed on a PAID engagement for a provider holding a verified requires-sanction credential', async () => {
    await seedFamilyAndDomain();
    const { seekerId, providerId } = await seedUsers(pool);
    await seedVerifiedCredential(providerId, 'dom_paid', 'fam_paid', 'serving_officer', { requires: true });

    const engagementId = await seedEngagement(pool, seekerId, providerId);
    await pool.query(`UPDATE engagements SET amount_paise = 10000 WHERE id = $1`, [engagementId]);

    await expect(
      pool.query(`UPDATE engagements SET status = 'agreed' WHERE id = $1`, [engagementId]),
    ).rejects.toThrow(/cannot take paid work pending departmental sanction/);
  });

  it('allows draft -> agreed once a grants-sanction credential is ALSO verified', async () => {
    await seedFamilyAndDomain();
    const { seekerId, providerId } = await seedUsers(pool);
    await seedVerifiedCredential(providerId, 'dom_paid', 'fam_paid', 'serving_officer', { requires: true });
    await seedVerifiedCredential(providerId, 'dom_paid', 'fam_paid', 'departmental_sanction', { grants: true });

    const engagementId = await seedEngagement(pool, seekerId, providerId);
    await pool.query(`UPDATE engagements SET amount_paise = 10000 WHERE id = $1`, [engagementId]);

    await pool.query(`UPDATE engagements SET status = 'agreed' WHERE id = $1`, [engagementId]);
    const res = await pool.query<{ status: string }>(`SELECT status FROM engagements WHERE id = $1`, [engagementId]);
    expect(res.rows[0].status).toBe('agreed');
  });

  it('does not block a provider with no requires-sanction credential at all', async () => {
    await seedFamilyAndDomain();
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    await pool.query(`UPDATE engagements SET amount_paise = 10000 WHERE id = $1`, [engagementId]);
    await expect(
      pool.query(`UPDATE engagements SET status = 'agreed' WHERE id = $1`, [engagementId]),
    ).resolves.toBeDefined();
  });

  it('does not block an engagement with no amount_paise set (not paid work)', async () => {
    await seedFamilyAndDomain();
    const { seekerId, providerId } = await seedUsers(pool);
    await seedVerifiedCredential(providerId, 'dom_paid', 'fam_paid', 'serving_officer', { requires: true });
    const engagementId = await seedEngagement(pool, seekerId, providerId); // amount_paise left NULL
    await expect(
      pool.query(`UPDATE engagements SET status = 'agreed' WHERE id = $1`, [engagementId]),
    ).resolves.toBeDefined();
  });
});
