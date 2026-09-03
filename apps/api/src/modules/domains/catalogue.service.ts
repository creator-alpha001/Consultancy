import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { AppError } from '../../common/errors/app-error';
import { AuditService } from '../../common/audit/audit.service';
import { PG_POOL } from '../../database/db.module';
import { CatalogueFamily, DomainListing, DomainReadiness } from './types';

/**
 * The catalogue: what families and domains EXIST, as opposed to what one
 * of them resolves to.
 *
 * Why this is not part of DomainLoaderService
 * ───────────────────────────────────────────
 * The loader resolves a single family or domain by walking the
 * inheritance chain and caches the whole resolved object. That is the
 * right shape for "render this domain" and the wrong shape for "what is
 * there": listing twenty-seven domains through it would resolve and cache
 * twenty-seven full manifests — every skill, credential type, rubric and
 * agreement document — to display a name and a language list.
 *
 * So the catalogue reads a deliberately narrow projection straight from
 * the manifest JSON. It is uncached on purpose: it is a handful of rows
 * on a page a person visits once per session, and a cache here would need
 * invalidating on every publish, every listing change and every provider
 * verification, which is three ways to serve a stale catalogue in
 * exchange for a query nobody was waiting on.
 *
 * The public/ops split is structural, not a flag
 * ──────────────────────────────────────────────
 * `publicCatalogue()` can only ever return listed, active rows — there is
 * no parameter that widens it. `opsCatalogue()` is a separate method
 * behind a separate admin-only route. A single method whose visibility
 * depended on a boolean argument, or on the caller's role, is precisely
 * how an unlisted domain eventually leaks: the check moves from the query
 * to the caller, and one caller forgets.
 */
@Injectable()
export class CatalogueService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * Families and their domains, as an anonymous visitor sees them.
   *
   * A domain appears only when it is `active`, `publicly_listed`, AND its
   * family is `active`. The family gate matters: retiring a family must
   * take its domains off the shelf without anyone having to remember to
   * unlist each one.
   *
   * Families with no listed domain are omitted entirely rather than
   * returned empty — a field with nothing behind it is not a category a
   * visitor should be offered (SPEC-PLATFORM.md §18).
   */
  async publicCatalogue(): Promise<CatalogueFamily[]> {
    const res = await this.pool.query<{
      family_code: string;
      family_manifest: { labels?: Record<string, unknown>; theme?: unknown };
      domain_code: string;
      domain_manifest: { labels?: Record<string, unknown>; languages?: string[]; defaultLanguage?: string; priceBands?: unknown };
      sort_order: number;
    }>(
      `SELECT f.code                AS family_code,
              f.manifest            AS family_manifest,
              d.code                AS domain_code,
              d.manifest            AS domain_manifest,
              d.sort_order
         FROM domains d
         JOIN domain_families f ON f.code = d.family_code
        WHERE d.status = 'active'
          AND d.publicly_listed
          AND f.status = 'active'
        ORDER BY f.code, d.sort_order, d.code`,
    );
    return groupByFamily(res.rows);
  }

  /**
   * Every family and domain regardless of state, with the signals that
   * decide whether a domain is ready to open.
   *
   * `providerCount` is the number of distinct providers holding an active
   * verified skill that any category in the domain maps to — the same
   * join the matching service searches through, so the number here is the
   * number a seeker would actually find, not a proxy for it.
   *
   * This is what makes `min_providers_to_list` mean something. The column
   * has existed since the first migration and nothing has ever read it,
   * so "listing a domain with no providers is worse than not listing it"
   * has been a sentence in a document rather than a number anyone could
   * see. It is still not enforced automatically — opening a domain stays
   * a human decision — but the human can now see whether supply exists.
   */
  async opsCatalogue(): Promise<DomainReadiness[]> {
    const res = await this.pool.query<{
      family_code: string;
      family_status: string;
      family_manifest: { labels?: Record<string, unknown> };
      domain_code: string;
      domain_manifest: { labels?: Record<string, unknown>; languages?: string[] };
      status: string;
      publicly_listed: boolean;
      min_providers_to_list: number;
      provider_count: string;
    }>(
      `SELECT f.code   AS family_code,
              f.status::text AS family_status,
              f.manifest AS family_manifest,
              d.code   AS domain_code,
              d.manifest AS domain_manifest,
              d.status::text,
              d.publicly_listed,
              d.min_providers_to_list,
              COALESCE(p.provider_count, 0) AS provider_count
         FROM domains d
         JOIN domain_families f ON f.code = d.family_code
         LEFT JOIN LATERAL (
           SELECT count(DISTINCT ps.provider_id) AS provider_count
             FROM categories c
             JOIN category_skills cs ON cs.category_id = c.id
             JOIN provider_skills ps ON ps.skill_id = cs.skill_id AND ps.active
            WHERE c.domain_code = d.code
              AND c.active
         ) p ON true
        ORDER BY f.code, d.sort_order, d.code`,
    );

    return res.rows.map((r) => {
      const providerCount = Number(r.provider_count);
      return {
        familyCode: r.family_code,
        familyStatus: r.family_status,
        familyLabels: (r.family_manifest?.labels as CatalogueFamily['labels']) ?? {},
        domainCode: r.domain_code,
        labels: (r.domain_manifest?.labels as DomainListing['labels']) ?? {},
        languages: r.domain_manifest?.languages ?? [],
        status: r.status,
        publiclyListed: r.publicly_listed,
        providerCount,
        minProvidersToList: r.min_providers_to_list,
        // Advisory, never automatic: a domain can meet its supply floor
        // and still not be ready for reasons no query knows about.
        meetsSupplyFloor: providerCount >= r.min_providers_to_list,
      };
    });
  }
  /**
   * Opens or closes a domain to the public.
   *
   * The whole point of the catalogue is that publishing a family is
   * enough to make it reachable. Without this, the last step of that
   * journey was a hand-written UPDATE — which meant opening a domain was
   * untraceable, unreviewable, and impossible for anyone without database
   * access, and the catalogue was a read-only view of a decision made
   * elsewhere.
   *
   * Three deliberate choices:
   *
   *  - **The supply floor is reported, never enforced.** Opening a domain
   *    also depends on whether its category tree has been checked against
   *    a current published source, which no query knows. Refusing on a
   *    count alone would block a correct decision; the caller is told the
   *    count instead and the audit entry records it.
   *  - **Audited as a consequential decision** (#14), with the supply
   *    figure captured AT THE TIME. Six months later "why was this opened
   *    with two people on it" needs the number that was on screen, not
   *    today's.
   *  - **Idempotent.** Opening an already-open domain is not an error; it
   *    records nothing new and returns the current state.
   */
  async setListing(input: {
    domainCode: string;
    publiclyListed: boolean;
    actorId: string;
    actorRole: string;
    ipPrefix?: string;
  }): Promise<DomainReadiness> {
    const before = await this.readiness(input.domainCode);
    if (!before) {
      throw new AppError('DOMAIN_NOT_FOUND', `no domain "${input.domainCode}"`, {
        status: HttpStatus.NOT_FOUND,
      });
    }
    if (before.publiclyListed === input.publiclyListed) return before;

    await this.pool.query(
      `UPDATE domains SET publicly_listed = $2, updated_at = now() WHERE code = $1`,
      [input.domainCode, input.publiclyListed],
    );

    await this.audit.record({
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: input.publiclyListed ? 'domain.listed' : 'domain.unlisted',
      subjectType: 'domain',
      subjectId: input.domainCode,
      detail: {
        familyCode: before.familyCode,
        // Captured now, on purpose — see above.
        providerCount: before.providerCount,
        minProvidersToList: before.minProvidersToList,
        metSupplyFloor: before.meetsSupplyFloor,
      },
      ipPrefix: input.ipPrefix,
    });

    return { ...before, publiclyListed: input.publiclyListed };
  }

  /** One domain's readiness row, or null if there is no such domain. */
  private async readiness(domainCode: string): Promise<DomainReadiness | null> {
    const all = await this.opsCatalogue();
    return all.find((d) => d.domainCode === domainCode) ?? null;
  }
}

function groupByFamily(
  rows: Array<{
    family_code: string;
    family_manifest: { labels?: Record<string, unknown>; theme?: unknown };
    domain_code: string;
    domain_manifest: {
      labels?: Record<string, unknown>;
      languages?: string[];
      defaultLanguage?: string;
      priceBands?: unknown;
    };
    sort_order: number;
  }>,
): CatalogueFamily[] {
  const families = new Map<string, CatalogueFamily>();
  for (const row of rows) {
    let family = families.get(row.family_code);
    if (!family) {
      family = {
        code: row.family_code,
        labels: (row.family_manifest?.labels as CatalogueFamily['labels']) ?? {},
        theme: (row.family_manifest?.theme as CatalogueFamily['theme']) ?? undefined,
        domains: [],
      };
      families.set(row.family_code, family);
    }
    family.domains.push({
      domainCode: row.domain_code,
      familyCode: row.family_code,
      labels: (row.domain_manifest?.labels as DomainListing['labels']) ?? {},
      languages: row.domain_manifest?.languages ?? [],
      defaultLanguage: row.domain_manifest?.defaultLanguage ?? 'en',
      priceBands: (row.domain_manifest?.priceBands as DomainListing['priceBands']) ?? {},
    });
  }
  return [...families.values()];
}
