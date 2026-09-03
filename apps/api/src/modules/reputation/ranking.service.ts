import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { ProviderSkillStats } from './types';

interface StatsDbRow {
  provider_id: string;
  skill_id: string;
  tier: string;
  completed_engagements: string;
  refunded_engagements: string;
  review_count: string;
  avg_rating: string | null;
  last_completed_at: Date | null;
}

function mapStats(row: StatsDbRow): ProviderSkillStats {
  return {
    providerId: row.provider_id,
    skillId: row.skill_id,
    tier: row.tier,
    completedEngagements: Number(row.completed_engagements),
    refundedEngagements: Number(row.refunded_engagements),
    reviewCount: Number(row.review_count),
    avgRating: row.avg_rating === null ? null : Number(row.avg_rating),
    lastCompletedAt: row.last_completed_at,
  };
}

/**
 * Per-skill stats and the ordering used to present matched providers.
 *
 * CLAUDE.md #17 — "no streaks, leaderboards, percentile comparisons, or
 * outcome predictions" — shapes what this deliberately does NOT do:
 *
 *  - it never returns a position, a percentile, or a peer comparison.
 *    `rankProviders` returns provider ids in an order, and the order
 *    itself is not a number anyone is shown.
 *  - there is no "top providers" or "trending" query. Ordering exists
 *    only in the context of a specific search, for a specific skill.
 *  - a provider reading their own stats sees their own history and
 *    nothing about anyone else's.
 *
 * And per hard rule #15, no ordering here — or anywhere — considers
 * price. That omission is the feature.
 */
@Injectable()
export class RankingService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** One provider's own history, per skill. The only stats surface a provider sees about themselves. */
  async getProviderStats(providerId: string): Promise<ProviderSkillStats[]> {
    const res = await this.pool.query<StatsDbRow>(
      `SELECT * FROM provider_skill_stats WHERE provider_id = $1 ORDER BY skill_id`,
      [providerId],
    );
    return res.rows.map(mapStats);
  }

  async getProviderStatsForSkill(providerId: string, skillId: string): Promise<ProviderSkillStats | null> {
    const res = await this.pool.query<StatsDbRow>(
      `SELECT * FROM provider_skill_stats WHERE provider_id = $1 AND skill_id = $2`,
      [providerId, skillId],
    );
    return res.rows[0] ? mapStats(res.rows[0]) : null;
  }

  /**
   * Orders an already-matched set of providers for one skill. The caller
   * supplies the candidates (from `MatchingService`, which is what
   * decides eligibility); this only decides presentation order within
   * them.
   *
   * Ordering: verified tier first, then rating, then experience, then
   * recency — with unreviewed providers sorted by tier and recency
   * rather than being buried, so a newly verified provider can actually
   * get their first engagement. A pure rating sort is a cold-start trap
   * that quietly closes the marketplace to new supply.
   */
  async rankProviders(providerIds: string[], skillId: string): Promise<string[]> {
    if (providerIds.length === 0) return [];

    const res = await this.pool.query<{ provider_id: string }>(
      `SELECT s.provider_id
         FROM provider_skill_stats s
        WHERE s.provider_id = ANY($1::uuid[])
          AND s.skill_id = $2
        ORDER BY s.tier DESC,
                 -- NULLS LAST would bury every unreviewed provider; instead
                 -- they simply carry no rating signal and are ordered on
                 -- the rest.
                 coalesce(s.avg_rating, 0) DESC,
                 s.completed_engagements DESC,
                 s.last_completed_at DESC NULLS LAST,
                 s.provider_id`,
      [providerIds, skillId],
    );

    // A provider with no stats row for this skill (verified but inactive)
    // still belongs in the result, at the end — never silently dropped.
    const ordered = res.rows.map((r) => r.provider_id);
    const seen = new Set(ordered);
    return [...ordered, ...providerIds.filter((id) => !seen.has(id))];
  }

  /**
   * The same ordering, for a search that named no category.
   *
   * Browsing across fields has no single skill to rank against, so each
   * provider is ordered on their strongest one. This is still a specific
   * search producing a specific order — not the standing "top providers"
   * table #17 forbids — and price is no more part of it here than
   * anywhere else (#15).
   */
  async rankProvidersAcrossSkills(providerIds: string[]): Promise<string[]> {
    if (providerIds.length === 0) return [];

    const res = await this.pool.query<{ provider_id: string }>(
      `SELECT s.provider_id
         FROM provider_skill_stats s
        WHERE s.provider_id = ANY($1::uuid[])
        GROUP BY s.provider_id
        ORDER BY max(s.tier) DESC,
                 coalesce(max(s.avg_rating), 0) DESC,
                 sum(s.completed_engagements) DESC,
                 max(s.last_completed_at) DESC NULLS LAST,
                 s.provider_id`,
      [providerIds],
    );

    const ordered = res.rows.map((r) => r.provider_id);
    const seen = new Set(ordered);
    return [...ordered, ...providerIds.filter((id) => !seen.has(id))];
  }
}
