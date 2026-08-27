import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { AppError } from '../../common/errors/app-error';
import { PG_POOL } from '../../database/db.module';
import { DomainManifestInput, FamilyManifestInput, ResolvedDomain, ResolvedFamily } from './types';

/**
 * The only place inheritance resolution happens (SPEC-PLATFORM.md §4:
 * "Resolution is family -> domain -> category, last write wins. The
 * loader resolves once and caches; no module walks the hierarchy
 * itself."). Every other module gets a ResolvedFamily/ResolvedDomain
 * from here — never a raw manifest.
 *
 * In-process Map cache: correct for one deployable (CLAUDE.md — modular
 * monolith). Invalidated explicitly by FamilyManifestService and
 * DomainManifestService on every publish, which is also how "changing a
 * label or price in a manifest changes the app with no deploy" holds —
 * there is nothing else to restart.
 */
@Injectable()
export class DomainLoaderService {
  private readonly familyCache = new Map<string, ResolvedFamily>();
  private readonly domainCache = new Map<string, ResolvedDomain>();

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  invalidateFamily(familyCode: string): void {
    this.familyCache.delete(familyCode);
    for (const [domainCode, resolved] of this.domainCache) {
      if (resolved.familyCode === familyCode) this.domainCache.delete(domainCode);
    }
  }

  invalidateDomain(domainCode: string): void {
    this.domainCache.delete(domainCode);
  }

  /** Drops every cached entry. Used when re-seeding a whole environment (and by tests that truncate the DB directly). */
  clearAll(): void {
    this.familyCache.clear();
    this.domainCache.clear();
  }

  async getFamily(familyCode: string): Promise<ResolvedFamily> {
    const cached = this.familyCache.get(familyCode);
    if (cached) return cached;

    const res = await this.pool.query<{ manifest: FamilyManifestInput }>(
      `SELECT manifest FROM domain_families WHERE code = $1`,
      [familyCode],
    );
    const row = res.rows[0];
    if (!row) {
      throw new AppError('FAMILY_NOT_FOUND', `no domain family "${familyCode}"`, { status: HttpStatus.NOT_FOUND });
    }

    const m = row.manifest;
    const resolved: ResolvedFamily = {
      code: m.code,
      version: m.version,
      labels: m.labels,
      engagementTypes: m.engagementTypes,
      flagshipEngagement: m.flagshipEngagement,
      policy: m.policy,
      supportResources: m.supportResources,
      theme: m.theme,
    };
    this.familyCache.set(familyCode, resolved);
    return resolved;
  }

  async getDomain(domainCode: string): Promise<ResolvedDomain> {
    const cached = this.domainCache.get(domainCode);
    if (cached) return cached;

    const res = await this.pool.query<{
      manifest: DomainManifestInput;
      family_code: string;
      publicly_listed: boolean;
      min_providers_to_list: number;
    }>(
      `SELECT manifest, family_code, publicly_listed, min_providers_to_list FROM domains WHERE code = $1`,
      [domainCode],
    );
    const row = res.rows[0];
    if (!row) {
      throw new AppError('DOMAIN_NOT_FOUND', `no domain "${domainCode}"`, { status: HttpStatus.NOT_FOUND });
    }

    const family = await this.getFamily(row.family_code);
    const m = row.manifest;

    const resolved: ResolvedDomain = {
      domainCode: m.code,
      familyCode: row.family_code,
      family,
      labels: { ...family.labels, domain: m.labels.domain },
      engagementTypes: m.engagementTypes ?? family.engagementTypes,
      flagshipEngagement: family.flagshipEngagement,
      languages: m.languages,
      defaultLanguage: m.defaultLanguage,
      resultSource: m.resultSource ?? null,
      calendar: m.calendar ?? [],
      priceBands: m.priceBands ?? {},
      policy: { ...family.policy, ...(m.policyOverrides ?? {}) },
      theme: {
        signature: m.themeOverrides?.signature ?? family.theme.signature,
        tokens: { ...family.theme.tokens, ...(m.themeOverrides?.tokens ?? {}) },
      },
      publiclyListed: row.publicly_listed,
      minProvidersToList: row.min_providers_to_list,
    };
    this.domainCache.set(domainCode, resolved);
    return resolved;
  }
}
