import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { MentorTier } from './types';

const DEFAULT_MIN_TIER: MentorTier = 't2'; // matches the family policy example in SPEC-PLATFORM.md §12

/**
 * SPEC-PLATFORM.md §5: "Matching intersects an engagement's required
 * skills and language with the provider's verified skills." This is
 * that intersection — the concrete mechanism behind "one verification,
 * many domains": querying by skill_id, not by domain or category, is
 * what lets a single provider_skills row surface for every domain whose
 * category maps to it.
 */
@Injectable()
export class MatchingService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** A provider must hold >= minTier in EVERY skill listed, not just one — an engagement's engagement_skills is the caller's usual source for skillIds. */
  async getVerifiedProviders(input: { skillIds: string[]; minTier?: MentorTier; langCode?: string }): Promise<string[]> {
    if (input.skillIds.length === 0) return [];
    const minTier = input.minTier ?? DEFAULT_MIN_TIER;

    const res = await this.pool.query<{ provider_id: string }>(
      `SELECT ps.provider_id
         FROM provider_skills ps
        WHERE ps.skill_id = ANY($1::uuid[])
          AND ps.active
          AND ps.tier >= $2::mentor_tier
          AND ($3::text IS NULL OR EXISTS (
                SELECT 1 FROM provider_languages pl
                 WHERE pl.provider_id = ps.provider_id AND pl.lang_code = $3 AND pl.can_evaluate
              ))
        GROUP BY ps.provider_id
       HAVING count(DISTINCT ps.skill_id) = $4`,
      [input.skillIds, minTier, input.langCode ?? null, input.skillIds.length],
    );
    return res.rows.map((r) => r.provider_id);
  }

  /**
   * Discovery, which is not matching.
   *
   * `getVerifiedProviders` above answers "who can take THIS engagement",
   * and its `HAVING count(DISTINCT skill_id) = n` is the whole point: a
   * provider must hold every skill the work requires. Browsing asks the
   * opposite question — "who is here at all" — and wants anyone verified
   * for ANY skill in scope.
   *
   * That difference is why this is a separate method and not a flag on
   * the one above. A boolean that silently turned an intersection into a
   * union would eventually be passed by a caller who meant matching, and
   * would offer a seeker a provider verified for none of the skills
   * their work actually needs.
   *
   * Every filter is optional and each narrows independently, so the
   * no-filter case is a legitimate query rather than an escape hatch: a
   * person looking for help does not begin by naming a taxonomy branch.
   */
  async searchVerifiedProviders(input: {
    familyCode?: string;
    domainCode?: string;
    categoryId?: string;
    langCode?: string;
    minTier?: MentorTier;
  }): Promise<string[]> {
    const res = await this.pool.query<{ provider_id: string }>(
      `SELECT ps.provider_id
         FROM provider_skills ps
        WHERE ps.active
          AND ps.tier >= $1::mentor_tier
          AND ($2::text IS NULL OR EXISTS (
                SELECT 1 FROM provider_languages pl
                 WHERE pl.provider_id = ps.provider_id
                   AND pl.lang_code = $2
                   AND pl.can_evaluate
              ))
          AND ($3::uuid IS NULL OR EXISTS (
                SELECT 1 FROM category_skills cs
                 WHERE cs.skill_id = ps.skill_id
                   AND cs.category_id = $3::uuid
              ))
          AND ($4::text IS NULL OR EXISTS (
                SELECT 1 FROM category_skills cs
                  JOIN categories c ON c.id = cs.category_id
                 WHERE cs.skill_id = ps.skill_id
                   AND c.domain_code = $4
                   AND c.active
              ))
          AND ($5::text IS NULL OR EXISTS (
                SELECT 1 FROM category_skills cs
                  JOIN categories c ON c.id = cs.category_id
                  JOIN domains d ON d.code = c.domain_code
                 WHERE cs.skill_id = ps.skill_id
                   AND d.family_code = $5
                   AND c.active
              ))
        GROUP BY ps.provider_id`,
      [
        input.minTier ?? DEFAULT_MIN_TIER,
        input.langCode ?? null,
        input.categoryId ?? null,
        input.domainCode ?? null,
        input.familyCode ?? null,
      ],
    );
    return res.rows.map((r) => r.provider_id);
  }

  async getVerifiedProvidersForCategory(categoryId: string, opts?: { minTier?: MentorTier; langCode?: string }): Promise<string[]> {
    const skillsRes = await this.pool.query<{ skill_id: string }>(
      `SELECT skill_id FROM category_skills WHERE category_id = $1`,
      [categoryId],
    );
    return this.getVerifiedProviders({ skillIds: skillsRes.rows.map((r) => r.skill_id), ...opts });
  }

  async getProviderTier(providerId: string, skillId: string): Promise<MentorTier | null> {
    const res = await this.pool.query<{ tier: MentorTier }>(
      `SELECT tier FROM provider_skills WHERE provider_id = $1 AND skill_id = $2 AND active`,
      [providerId, skillId],
    );
    return res.rows[0]?.tier ?? null;
  }
}
