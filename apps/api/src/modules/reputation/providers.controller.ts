import { BadRequestException, Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { Public } from '../identity/auth.guard';
import { MatchingService } from '../verification/matching.service';
import { MentorTier } from '../verification/types';
import { RankingService } from './ranking.service';
import { ReviewService } from './review.service';

export interface ProviderCard {
  providerId: string;
  displayName: string;
  languages: string[];
  skills: Array<{
    skillId: string;
    skillCode: string;
    labels: Record<string, string>;
    tier: MentorTier;
    completedEngagements: number;
    reviewCount: number;
    avgRating: number | null;
  }>;
  paidWorkBlocked: boolean;
}

/**
 * A verified credential, as an achievement.
 *
 * `details` carries ONLY the keys the credential type's manifest marked
 * publishable, and that list defaults to empty — so a credential with no
 * declared public fields shows its label and its verified date and
 * nothing else. The roll number, the claimed name and the document
 * reference that PROVED it never appear here (#30).
 */
export interface PublicCredential {
  credentialCode: string;
  labels: Record<string, string>;
  domainCode: string;
  verifiedAt: string | null;
  details: Record<string, unknown>;
}

/** What a provider's track record actually is, drawn from their own history. */
export interface ProviderTrackRecord {
  completedEngagements: number;
  refundedEngagements: number;
  distinctSeekers: number;
  /** Of seekers who worked with them more than once — the strongest signal there is. */
  repeatSeekers: number;
  firstCompletedAt: string | null;
  lastCompletedAt: string | null;
}

/**
 * Provider discovery — how a seeker finds someone to work with.
 *
 * Two rules shape everything this returns:
 *
 *  - **CLAUDE.md #30.** Verification documents are never public; a
 *    profile shows the *conclusion* (a verified skill at a tier) and
 *    never the evidence. Nothing in `provider_credentials` is reachable
 *    from here, by design.
 *  - **CLAUDE.md #17.** Ordering exists; a leaderboard does not. The
 *    list comes back in an order for THIS search, with no rank number,
 *    percentile or badge — and no ordering anywhere considers price
 *    (#15).
 *
 * Emails are never returned. A display name is derived from the address
 * so a human can tell two mentors apart without us publishing a contact
 * route that would take the relationship off-platform.
 */
@Controller('providers')
export class ProvidersController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(MatchingService) private readonly matching: MatchingService,
    @Inject(RankingService) private readonly ranking: RankingService,
    @Inject(ReviewService) private readonly reviews: ReviewService,
  ) {}

  /**
   * Providers verified for a category, in the language asked for.
   *
   * Public because the catalogue is public: a seeker deciding whether to
   * sign up needs to see that real mentors exist. Nothing here is
   * personal data beyond a display name.
   */
  @Get()
  @Public()
  async search(
    @Query('categoryId') categoryId?: string,
    @Query('language') language?: string,
    @Query('minTier') minTier?: string,
  ): Promise<ProviderCard[]> {
    if (!categoryId) throw new BadRequestException('categoryId is required');

    const providerIds = await this.matching.getVerifiedProvidersForCategory(categoryId, {
      langCode: language,
      minTier: minTier as MentorTier | undefined,
    });
    if (providerIds.length === 0) return [];

    // Rank against the category's first mapped skill — one specific
    // search, one specific order. Not a standing "top mentors" list.
    const skillRes = await this.pool.query<{ skill_id: string }>(
      `SELECT skill_id FROM category_skills WHERE category_id = $1 ORDER BY skill_id LIMIT 1`,
      [categoryId],
    );
    const ordered = skillRes.rows[0]
      ? await this.ranking.rankProviders(providerIds, skillRes.rows[0].skill_id)
      : providerIds;

    const cards = await this.cards(ordered);
    const byId = new Map(cards.map((c) => [c.providerId, c]));
    return ordered.map((id) => byId.get(id)).filter((c): c is ProviderCard => c !== undefined);
  }

  /**
   * The full profile: what they are verified for, what they have
   * achieved, what their record is, and what people who actually worked
   * with them said.
   *
   * Every review here came from a completed engagement — the database
   * refuses one otherwise — so there is no such thing as a review from
   * someone who never turned up.
   */
  @Get(':id')
  @Public()
  async profile(@Param('id') id: string): Promise<
    ProviderCard & {
      credentials: PublicCredential[];
      trackRecord: ProviderTrackRecord;
      reviewSummary: unknown;
      reviews: unknown[];
    }
  > {
    const [card] = await this.cards([id]);
    if (!card) throw new BadRequestException('no such provider');

    const [credentials, trackRecord, reviewSummary, reviews] = await Promise.all([
      this.publicCredentials(id),
      this.trackRecord(id),
      this.reviews.summaryFor(id),
      this.reviews.listAboutProviderWithContext(id, 30),
    ]);

    return { ...card, credentials, trackRecord, reviewSummary, reviews };
  }

  /**
   * Verified credentials, filtered through each type's `public_fields`
   * allow-list.
   *
   * Only `status = 'verified'` — a submitted or rejected credential is
   * nobody's business but the provider's and the reviewer's. And the
   * filtering happens HERE rather than in the query, so the allow-list
   * is applied to exactly the keys that exist rather than to a shape we
   * assumed.
   */
  private async publicCredentials(providerId: string): Promise<PublicCredential[]> {
    const res = await this.pool.query<{
      code: string;
      labels: Record<string, string>;
      domain_code: string;
      reviewed_at: Date | null;
      verifier_data: Record<string, unknown>;
      public_fields: string[];
    }>(
      `SELECT ct.code, ct.labels, pc.domain_code, pc.reviewed_at, pc.verifier_data, ct.public_fields
         FROM provider_credentials pc
         JOIN credential_types ct ON ct.id = pc.credential_type_id
        WHERE pc.provider_id = $1 AND pc.status = 'verified'
        ORDER BY pc.reviewed_at DESC NULLS LAST`,
      [providerId],
    );

    return res.rows.map((row) => {
      const details: Record<string, unknown> = {};
      for (const key of row.public_fields ?? []) {
        const value = row.verifier_data?.[key];
        if (value !== undefined && value !== null) details[key] = value;
      }
      return {
        credentialCode: row.code,
        labels: row.labels,
        domainCode: row.domain_code,
        verifiedAt: row.reviewed_at ? row.reviewed_at.toISOString() : null,
        details,
      };
    });
  }

  /**
   * Their own history. `repeatSeekers` is the one number here a provider
   * cannot talk their way into: people came back.
   *
   * Refunded engagements are counted and shown rather than hidden — a
   * record that only reports successes is not a record.
   */
  private async trackRecord(providerId: string): Promise<ProviderTrackRecord> {
    const res = await this.pool.query<{
      completed: string; refunded: string; distinct_seekers: string;
      repeat_seekers: string; first_at: Date | null; last_at: Date | null;
    }>(
      `WITH mine AS (
         SELECT seeker_id, status, updated_at
           FROM engagements
          WHERE provider_id = $1 AND status IN ('completed', 'refunded')
       ), per_seeker AS (
         SELECT seeker_id, count(*) AS n FROM mine WHERE status = 'completed' GROUP BY seeker_id
       )
       SELECT
         (SELECT count(*) FROM mine WHERE status = 'completed')::text        AS completed,
         (SELECT count(*) FROM mine WHERE status = 'refunded')::text         AS refunded,
         (SELECT count(*) FROM per_seeker)::text                             AS distinct_seekers,
         (SELECT count(*) FROM per_seeker WHERE n > 1)::text                 AS repeat_seekers,
         (SELECT min(updated_at) FROM mine WHERE status = 'completed')       AS first_at,
         (SELECT max(updated_at) FROM mine WHERE status = 'completed')       AS last_at`,
      [providerId],
    );
    const r = res.rows[0];
    return {
      completedEngagements: Number(r.completed),
      refundedEngagements: Number(r.refunded),
      distinctSeekers: Number(r.distinct_seekers),
      repeatSeekers: Number(r.repeat_seekers),
      firstCompletedAt: r.first_at ? r.first_at.toISOString() : null,
      lastCompletedAt: r.last_at ? r.last_at.toISOString() : null,
    };
  }

  private async cards(providerIds: string[]): Promise<ProviderCard[]> {
    if (providerIds.length === 0) return [];

    const [users, skills, languages, blocked] = await Promise.all([
      this.pool.query<{ id: string; email: string }>(
        `SELECT id, email FROM users WHERE id = ANY($1::uuid[]) AND role = 'provider'`,
        [providerIds],
      ),
      this.pool.query<{
        provider_id: string;
        skill_id: string;
        skill_code: string;
        labels: Record<string, string>;
        tier: MentorTier;
        completed_engagements: string;
        review_count: string;
        avg_rating: string | null;
      }>(
        `SELECT st.provider_id, st.skill_id, s.code AS skill_code, s.labels, st.tier,
                st.completed_engagements, st.review_count, st.avg_rating
           FROM provider_skill_stats st
           JOIN skills s ON s.id = st.skill_id
          WHERE st.provider_id = ANY($1::uuid[])
          ORDER BY st.tier DESC, st.completed_engagements DESC`,
        [providerIds],
      ),
      this.pool.query<{ provider_id: string; lang_code: string }>(
        `SELECT provider_id, lang_code FROM provider_languages WHERE provider_id = ANY($1::uuid[])`,
        [providerIds],
      ),
      this.pool.query<{ provider_id: string }>(
        `SELECT provider_id FROM provider_paid_work_blocked WHERE provider_id = ANY($1::uuid[])`,
        [providerIds],
      ),
    ]);

    const blockedSet = new Set(blocked.rows.map((r) => r.provider_id));

    return users.rows.map((u) => ({
      providerId: u.id,
      displayName: displayNameFor(u.email),
      languages: languages.rows.filter((l) => l.provider_id === u.id).map((l) => l.lang_code),
      skills: skills.rows
        .filter((s) => s.provider_id === u.id)
        .map((s) => ({
          skillId: s.skill_id,
          skillCode: s.skill_code,
          labels: s.labels,
          tier: s.tier,
          completedEngagements: Number(s.completed_engagements),
          reviewCount: Number(s.review_count),
          avgRating: s.avg_rating === null ? null : Number(s.avg_rating),
        })),
      paidWorkBlocked: blockedSet.has(u.id),
    }));
  }
}

/**
 * "asha.rathore@example.com" → "A. Rathore".
 *
 * Deliberately lossy. The full address is a contact route, and #29/#30's
 * spirit is that a profile publishes conclusions, not identifiers — a
 * seeker needs to tell two mentors apart, not to email one directly.
 */
function displayNameFor(email: string): string {
  const local = email.split('@')[0].replace(/\+.*$/, '');
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return 'Mentor';
  const surname = parts[parts.length - 1];
  const capped = surname.charAt(0).toUpperCase() + surname.slice(1);
  return parts.length > 1 ? `${parts[0].charAt(0).toUpperCase()}. ${capped}` : capped;
}
