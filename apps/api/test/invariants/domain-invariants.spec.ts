import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool, resetDatabase } from '../test-utils';

/**
 * Raw-SQL invariant tests for the M2 domain-engine schema, same spirit
 * as test/invariants/ledger-invariants.spec.ts: go straight at the
 * database, no app services, to prove Postgres itself enforces these
 * rules.
 */
describe('domain engine invariants (raw SQL)', () => {
  const pool = createPool();

  beforeEach(async () => {
    await resetDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seedFamily(code = 'fam_1'): Promise<void> {
    await pool.query(
      `INSERT INTO domain_families (code, status, manifest, manifest_version) VALUES ($1, 'active', '{}'::jsonb, '1.0.0')`,
      [code],
    );
  }

  async function seedDomain(domainCode = 'dom_1', familyCode = 'fam_1'): Promise<void> {
    await pool.query(
      `INSERT INTO domains (code, family_code, status, manifest, manifest_version)
       VALUES ($1, $2, 'active', '{}'::jsonb, '1.0.0')`,
      [domainCode, familyCode],
    );
  }

  it('rejects a domain naming a family that does not exist', async () => {
    await expect(
      pool.query(
        `INSERT INTO domains (code, family_code, status, manifest, manifest_version)
         VALUES ('dom_x', 'no_such_family', 'active', '{}'::jsonb, '1.0.0')`,
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it('rejects two root categories with the same slug in one domain', async () => {
    await seedFamily();
    await seedDomain();
    await pool.query(
      `INSERT INTO categories (domain_code, parent_id, slug, labels) VALUES ('dom_1', NULL, 'mains', '{"en":"Mains"}'::jsonb)`,
    );
    await expect(
      pool.query(
        `INSERT INTO categories (domain_code, parent_id, slug, labels) VALUES ('dom_1', NULL, 'mains', '{"en":"Mains 2"}'::jsonb)`,
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it('allows the same slug at the root of two different domains', async () => {
    await seedFamily();
    await seedDomain('dom_1');
    await seedDomain('dom_2');
    await pool.query(
      `INSERT INTO categories (domain_code, parent_id, slug, labels) VALUES ('dom_1', NULL, 'mains', '{"en":"Mains"}'::jsonb)`,
    );
    await expect(
      pool.query(
        `INSERT INTO categories (domain_code, parent_id, slug, labels) VALUES ('dom_2', NULL, 'mains', '{"en":"Mains"}'::jsonb)`,
      ),
    ).resolves.toBeDefined();
  });

  it('rejects two sibling categories under the same parent with the same slug', async () => {
    await seedFamily();
    await seedDomain();
    const parent = await pool.query<{ id: string }>(
      `INSERT INTO categories (domain_code, parent_id, slug, labels) VALUES ('dom_1', NULL, 'mains', '{"en":"Mains"}'::jsonb) RETURNING id`,
    );
    await pool.query(
      `INSERT INTO categories (domain_code, parent_id, slug, labels) VALUES ('dom_1', $1, 'gs', '{"en":"GS"}'::jsonb)`,
      [parent.rows[0].id],
    );
    await expect(
      pool.query(
        `INSERT INTO categories (domain_code, parent_id, slug, labels) VALUES ('dom_1', $1, 'gs', '{"en":"GS dup"}'::jsonb)`,
        [parent.rows[0].id],
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it('rejects a category_skills weight of zero', async () => {
    await seedFamily();
    await seedDomain();
    const category = await pool.query<{ id: string }>(
      `INSERT INTO categories (domain_code, parent_id, slug, labels) VALUES ('dom_1', NULL, 'gs', '{"en":"GS"}'::jsonb) RETURNING id`,
    );
    const skill = await pool.query<{ id: string }>(
      `INSERT INTO skills (family_code, code, labels) VALUES ('fam_1', 'answer_writing.gs.polity', '{"en":"Polity"}'::jsonb) RETURNING id`,
    );
    await expect(
      pool.query(
        `INSERT INTO category_skills (category_id, skill_id, weight) VALUES ($1, $2, 0)`,
        [category.rows[0].id, skill.rows[0].id],
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it('rejects publishing the same family manifest version twice', async () => {
    await seedFamily();
    await pool.query(
      `INSERT INTO domain_family_manifest_versions (family_code, version, manifest) VALUES ('fam_1', '1.0.0', '{}'::jsonb)`,
    );
    await expect(
      pool.query(
        `INSERT INTO domain_family_manifest_versions (family_code, version, manifest) VALUES ('fam_1', '1.0.0', '{}'::jsonb)`,
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it('rejects publishing the same domain manifest version twice', async () => {
    await seedFamily();
    await seedDomain();
    await pool.query(
      `INSERT INTO domain_manifest_versions (domain_code, version, manifest) VALUES ('dom_1', '1.0.0', '{}'::jsonb)`,
    );
    await expect(
      pool.query(
        `INSERT INTO domain_manifest_versions (domain_code, version, manifest) VALUES ('dom_1', '1.0.0', '{}'::jsonb)`,
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it('rejects a skill code duplicated within one family', async () => {
    await seedFamily();
    await pool.query(
      `INSERT INTO skills (family_code, code, labels) VALUES ('fam_1', 'answer_writing.essay', '{"en":"Essay"}'::jsonb)`,
    );
    await expect(
      pool.query(
        `INSERT INTO skills (family_code, code, labels) VALUES ('fam_1', 'answer_writing.essay', '{"en":"Essay again"}'::jsonb)`,
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it('allows the same skill code to exist independently in two different families', async () => {
    await seedFamily('fam_1');
    await seedFamily('fam_2');
    await pool.query(
      `INSERT INTO skills (family_code, code, labels) VALUES ('fam_1', 'answer_writing.essay', '{"en":"Essay"}'::jsonb)`,
    );
    await expect(
      pool.query(
        `INSERT INTO skills (family_code, code, labels) VALUES ('fam_2', 'answer_writing.essay', '{"en":"Essay"}'::jsonb)`,
      ),
    ).resolves.toBeDefined();
  });
});
