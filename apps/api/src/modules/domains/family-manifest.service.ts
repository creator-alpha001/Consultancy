import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { DomainLoaderService } from './domain-loader.service';
import { validateFamilyManifest } from './manifest-validation';
import { ResolvedFamily } from './types';

/**
 * Owns domain_families, its version history, and the family-level
 * projections (assessment_templates, credential_types, skills) that
 * exist for referential integrity elsewhere. `manifest` jsonb is the
 * single authored source of truth; those tables are resynced from it on
 * every publish — never hand-edited independently.
 */
@Injectable()
export class FamilyManifestService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DomainLoaderService) private readonly loader: DomainLoaderService,
  ) {}

  async publish(rawManifest: unknown, publishedBy?: string): Promise<ResolvedFamily> {
    const manifest = validateFamilyManifest(rawManifest);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO domain_families (code, status, manifest, manifest_version)
         VALUES ($1, 'active', $2::jsonb, $3)
         ON CONFLICT (code) DO UPDATE
           SET status = 'active', manifest = EXCLUDED.manifest, manifest_version = EXCLUDED.manifest_version`,
        [manifest.code, JSON.stringify(manifest), manifest.version],
      );

      await client.query(
        `INSERT INTO domain_family_manifest_versions (family_code, version, manifest, published_by)
         VALUES ($1, $2, $3::jsonb, $4)
         ON CONFLICT (family_code, version) DO NOTHING`,
        [manifest.code, manifest.version, JSON.stringify(manifest), publishedBy ?? null],
      );

      // Templates before skills — skills.template_id references this table.
      const templateIdByCode = new Map<string, string>();
      for (const t of manifest.assessmentTemplates) {
        const res = await client.query<{ id: string }>(
          `INSERT INTO assessment_templates (family_code, code, labels, dimensions)
           VALUES ($1, $2, $3::jsonb, $4::jsonb)
           ON CONFLICT (family_code, code) DO UPDATE
             SET labels = EXCLUDED.labels, dimensions = EXCLUDED.dimensions, active = true
           RETURNING id`,
          [manifest.code, t.code, JSON.stringify(t.labels), JSON.stringify(t.dimensions)],
        );
        templateIdByCode.set(t.code, res.rows[0].id);
      }
      await client.query(
        `UPDATE assessment_templates SET active = false
          WHERE family_code = $1 AND NOT (code = ANY($2::text[]))`,
        [manifest.code, manifest.assessmentTemplates.map((t) => t.code)],
      );

      for (const c of manifest.credentialTypes) {
        await client.query(
          `INSERT INTO credential_types (family_code, code, labels, verifier, min_tier_granted, active)
           VALUES ($1, $2, $3::jsonb, $4, $5, $6)
           ON CONFLICT (family_code, code) DO UPDATE
             SET labels = EXCLUDED.labels, verifier = EXCLUDED.verifier,
                 min_tier_granted = EXCLUDED.min_tier_granted, active = EXCLUDED.active`,
          [manifest.code, c.code, JSON.stringify(c.labels), c.verifier, c.minTierGranted ?? null, c.active ?? true],
        );
      }
      await client.query(
        `UPDATE credential_types SET active = false
          WHERE family_code = $1 AND NOT (code = ANY($2::text[]))`,
        [manifest.code, manifest.credentialTypes.map((c) => c.code)],
      );

      for (const s of manifest.skills) {
        const templateId = s.template ? templateIdByCode.get(s.template) ?? null : null;
        await client.query(
          `INSERT INTO skills (family_code, code, labels, template_id, is_domain_bound, active)
           VALUES ($1, $2, $3::jsonb, $4, $5, true)
           ON CONFLICT (family_code, code) DO UPDATE
             SET labels = EXCLUDED.labels, template_id = EXCLUDED.template_id,
                 is_domain_bound = EXCLUDED.is_domain_bound, active = true`,
          [manifest.code, s.code, JSON.stringify(s.labels), templateId, s.isDomainBound ?? false],
        );
      }
      await client.query(
        `UPDATE skills SET active = false WHERE family_code = $1 AND NOT (code = ANY($2::text[]))`,
        [manifest.code, manifest.skills.map((s) => s.code)],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    this.loader.invalidateFamily(manifest.code);
    return this.loader.getFamily(manifest.code);
  }

  async getSkillIdsByCode(familyCode: string, codes: string[]): Promise<Map<string, string>> {
    if (codes.length === 0) return new Map();
    const res = await this.pool.query<{ code: string; id: string }>(
      `SELECT code, id FROM skills WHERE family_code = $1 AND code = ANY($2::text[]) AND active`,
      [familyCode, codes],
    );
    return new Map(res.rows.map((r) => [r.code, r.id]));
  }

  /**
   * Given an engagement's required skill ids, finds the assessment
   * template one of them binds — the mechanism SPEC-PLATFORM.md §10
   * describes ("applied via skills"). Returns null with no error when
   * none of the skills bind a template: that's the Wave 3 case (hard
   * rule #3), not a failure.
   */
  async resolveTemplateForSkillIds(skillIds: string[]): Promise<string | null> {
    if (skillIds.length === 0) return null;
    const res = await this.pool.query<{ template_id: string | null }>(
      `SELECT template_id FROM skills WHERE id = ANY($1::uuid[]) AND template_id IS NOT NULL LIMIT 1`,
      [skillIds],
    );
    return res.rows[0]?.template_id ?? null;
  }

  async getTemplateIdsByCode(familyCode: string, codes: string[]): Promise<Map<string, string>> {
    if (codes.length === 0) return new Map();
    const res = await this.pool.query<{ code: string; id: string }>(
      `SELECT code, id FROM assessment_templates WHERE family_code = $1 AND code = ANY($2::text[]) AND active`,
      [familyCode, codes],
    );
    return new Map(res.rows.map((r) => [r.code, r.id]));
  }
}
