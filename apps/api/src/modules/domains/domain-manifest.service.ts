import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { TaxonomyService } from '../taxonomy/taxonomy.service';
import { AppError } from '../../common/errors/app-error';
import { collectSkillCodes, collectTemplateOverrideCodes, resolveCategoryTree } from './category-tree';
import { DomainLoaderService } from './domain-loader.service';
import { FamilyManifestService } from './family-manifest.service';
import { validateDomainManifest } from './manifest-validation';
import { ResolvedDomain } from './types';

/**
 * Owns `domains` and its version history. Resolves the manifest's skill
 * and assessment-template *codes* to IDs (it owns those family-scoped
 * tables via FamilyManifestService) and hands taxonomy/ an
 * already-resolved category tree — taxonomy/ never touches a manifest.
 */
@Injectable()
export class DomainManifestService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DomainLoaderService) private readonly loader: DomainLoaderService,
    @Inject(FamilyManifestService) private readonly families: FamilyManifestService,
    @Inject(TaxonomyService) private readonly taxonomy: TaxonomyService,
  ) {}

  async publish(rawManifest: unknown, publishedBy?: string): Promise<ResolvedDomain> {
    const manifest = validateDomainManifest(rawManifest);

    let family;
    try {
      family = await this.loader.getFamily(manifest.family);
    } catch {
      throw new AppError('MANIFEST_INVALID', `domain manifest references unknown family "${manifest.family}"`, {
        detail: { issues: [`family: no domain family "${manifest.family}"`] },
      });
    }

    if (manifest.engagementTypes) {
      const notOffered = manifest.engagementTypes.filter((t) => !family.engagementTypes.includes(t));
      if (notOffered.length > 0) {
        throw new AppError('MANIFEST_INVALID', 'domain offers engagement types its family does not', {
          detail: { issues: [`engagementTypes: not offered by family "${manifest.family}": ${notOffered.join(', ')}`] },
        });
      }
    }

    const skillCodes = collectSkillCodes(manifest.categories);
    const skillIdByCode = await this.families.getSkillIdsByCode(manifest.family, skillCodes);
    const missingSkills = skillCodes.filter((c) => !skillIdByCode.has(c));
    if (missingSkills.length > 0) {
      throw new AppError('MANIFEST_INVALID', 'domain manifest references unknown skill(s)', {
        detail: { issues: missingSkills.map((c) => `categories: unknown skill "${c}"`) },
      });
    }

    const templateOverrideCodes = collectTemplateOverrideCodes(manifest.categories);
    const templateIdByCode = await this.families.getTemplateIdsByCode(manifest.family, templateOverrideCodes);
    const missingTemplates = templateOverrideCodes.filter((c) => !templateIdByCode.has(c));
    if (missingTemplates.length > 0) {
      throw new AppError('MANIFEST_INVALID', 'domain manifest references unknown assessment template(s)', {
        detail: { issues: missingTemplates.map((c) => `categories: unknown assessment template "${c}"`) },
      });
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO domains (code, family_code, status, manifest, manifest_version)
         VALUES ($1, $2, 'active', $3::jsonb, $4)
         ON CONFLICT (code) DO UPDATE
           SET manifest = EXCLUDED.manifest, manifest_version = EXCLUDED.manifest_version, status = 'active'`,
        [manifest.code, manifest.family, JSON.stringify(manifest), manifest.version],
      );
      await client.query(
        `INSERT INTO domain_manifest_versions (domain_code, version, manifest, published_by)
         VALUES ($1, $2, $3::jsonb, $4)
         ON CONFLICT (domain_code, version) DO NOTHING`,
        [manifest.code, manifest.version, JSON.stringify(manifest), publishedBy ?? null],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await this.taxonomy.syncCategories(
      manifest.code,
      resolveCategoryTree(manifest.categories, skillIdByCode, templateIdByCode),
    );

    this.loader.invalidateDomain(manifest.code);
    return this.loader.getDomain(manifest.code);
  }
}
