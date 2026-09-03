import { BadRequestException, Controller, Get, HttpStatus, Inject, Param, Query } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { displayNameFor } from '../../common/display-name';
import { Public } from '../identity/auth.guard';
import { MatchingService } from '../verification/matching.service';
import { ProviderRate, RatesService } from '../verification/rates.service';
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
  /**
   * What this provider sells, with the price and what you get for it.
   *
   * On the CARD, not just the profile: a seeker comparing people could
   * not see what any of them charged until they had clicked into a
   * booking form. Showing it is not a #15 violation — that rule forbids
   * ORDERING by price, and this list is ordered by what the service is.
   */
  services: ProviderRate[];
  /**
   * Which field this person's verified skills reach, derived from the
   * skills themselves rather than stored on the profile.
   *
   * A search spanning every family has to say which one each result
   * belongs to, or a list mixing an evaluator, an advisor and a
   * counsellor is unreadable. `familyCode` is the first when someone's
   * skills span more than one — a real case, not an error: a single
   * verified skill can map to categories in several domains, which is
   * the mechanism the whole taxonomy exists for (SPEC-PLATFORM.md §5).
   */
  familyCode: string | null;
  domainCodes: string[];
  categoryIds: string[];
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
    @Inject(RatesService) private readonly rates: RatesService,
  ) {}

  /**
   * Providers, narrowed by whichever of category, domain, family and
   * language the caller named — or by none of them.
   *
   * Public because the catalogue is public: a seeker deciding whether to
   * sign up needs to see that real mentors exist. Nothing here is
   * personal data beyond a display name.
   *
   * **Naming no filter is the normal case, not a wildcard.** A person
   * with a problem does not begin by choosing a taxonomy branch, and a
   * search that forces them to only works for people who already know
   * the vocabulary — which is precisely the people who need it least.
   * The two paths differ in meaning, not just in breadth:
   *
   *  - With a category, this is MATCHING: a provider must hold every
   *    skill that category maps to, and is ordered against the first of
   *    them. That is the query a booking flow needs.
   *  - Without one, this is DISCOVERY: anyone verified for any skill in
   *    scope, ordered on their strongest. That is the query a browse
   *    screen needs.
   *
   * Neither ordering considers price, here or anywhere (#15).
   */
  @Get()
  @Public()
  async search(
    @Query('categoryId') categoryId?: string,
    @Query('language') language?: string,
    @Query('minTier') minTier?: string,
    @Query('domain') domain?: string,
    @Query('family') family?: string,
  ): Promise<ProviderCard[]> {
    const tier = minTier as MentorTier | undefined;

    const ordered = categoryId
      ? await this.matchedForCategory(categoryId, language, tier)
      : await this.ranking.rankProvidersAcrossSkills(
          await this.matching.searchVerifiedProviders({
            familyCode: family,
            domainCode: domain,
            langCode: language,
            minTier: tier,
          }),
        );
    if (ordered.length === 0) return [];

    const cards = await this.cards(ordered);
    const byId = new Map(cards.map((c) => [c.providerId, c]));
    return ordered.map((id) => byId.get(id)).filter((c): c is ProviderCard => c !== undefined);
  }

  /** The matching path: every skill the category needs, ordered against its first. */
  private async matchedForCategory(
    categoryId: string,
    language?: string,
    minTier?: MentorTier,
  ): Promise<string[]> {
    const providerIds = await this.matching.getVerifiedProvidersForCategory(categoryId, {
      langCode: language,
      minTier,
    });
    if (providerIds.length === 0) return [];

    // Rank against the category's first mapped skill — one specific
    // search, one specific order. Not a standing "top mentors" list.
    const skillRes = await this.pool.query<{ skill_id: string }>(
      `SELECT skill_id FROM category_skills WHERE category_id = $1 ORDER BY skill_id LIMIT 1`,
      [categoryId],
    );
    return skillRes.rows[0]
      ? this.ranking.rankProviders(providerIds, skillRes.rows[0].skill_id)
      : providerIds;
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
      /**
       * What this provider charges, so the booking screen can show a
       * price instead of an empty box. A list, never a sorted comparison:
       * price orders nothing on this platform (#15).
       */
      rates: ProviderRate[];
    }
  > {
    /*
     * Guard the cast before it reaches Postgres. `id` goes into a
     * `::uuid[]` and anything that is not one made the query throw —
     * which surfaced as a 500 from a malformed URL, so any caller could
     * crash this endpoint by typing a bad id. It is a missing provider,
     * and it answers as one.
     */
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new AppError('PROVIDER_NOT_FOUND', `no provider "${id}"`, { status: HttpStatus.NOT_FOUND });
    }

    const [card] = await this.cards([id]);
    /*
     * A missing provider is NOT_FOUND, not a bad request. As a 400 it was
     * indistinguishable from a malformed call, so clients that correctly
     * treat 404 as "render this as absent" blew up on it instead.
     */
    if (!card) {
      throw new AppError('PROVIDER_NOT_FOUND', `no provider "${id}"`, { status: HttpStatus.NOT_FOUND });
    }

    const [credentials, trackRecord, reviewSummary, reviews, rates] = await Promise.all([
      this.publicCredentials(id),
      this.trackRecord(id),
      this.reviews.summaryFor(id),
      this.reviews.listAboutProviderWithContext(id, 30),
      this.rates.list(id),
    ]);

    return { ...card, credentials, trackRecord, reviewSummary, reviews, rates };
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

    const [users, skills, languages, blocked, services, reach] = await Promise.all([
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
      this.pool.query<{
        provider_id: string;
        id: string;
        engagement_type: string;
        skill_id: string | null;
        skill_code: string | null;
        skill_labels: Record<string, string> | null;
        currency: string;
        amount_paise: string;
        duration_minutes: number | null;
        turnaround_hours: number | null;
      }>(
        `SELECT r.provider_id, r.id, r.engagement_type, r.skill_id,
                sk.code AS skill_code, sk.labels AS skill_labels,
                r.currency, r.amount_paise::text, r.duration_minutes, r.turnaround_hours
           FROM provider_rates r
           LEFT JOIN skills sk ON sk.id = r.skill_id
          WHERE r.provider_id = ANY($1::uuid[]) AND r.active
          -- By what it is, never by what it costs (#15).
          ORDER BY r.engagement_type, sk.code NULLS FIRST`,
        [providerIds],
      ),
      /*
       * Where each provider's verified skills actually reach. Derived
       * through category_skills rather than read off the profile,
       * because that mapping IS the answer: one verification surfacing
       * in every domain whose categories map to it is the whole point
       * of the taxonomy, and a stored "their domain" column would go
       * stale the moment a category gained a skill.
       */
      this.pool.query<{
        provider_id: string;
        category_id: string;
        domain_code: string;
        family_code: string;
      }>(
        `SELECT DISTINCT ps.provider_id, c.id AS category_id, c.domain_code, d.family_code
           FROM provider_skills ps
           JOIN category_skills cs ON cs.skill_id = ps.skill_id
           JOIN categories c ON c.id = cs.category_id AND c.active
           JOIN domains d ON d.code = c.domain_code
          WHERE ps.provider_id = ANY($1::uuid[])
            AND ps.active
          ORDER BY d.family_code, c.domain_code, c.id`,
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
      services: services.rows
        .filter((r) => r.provider_id === u.id)
        .map((r) => ({
          id: r.id,
          engagementType: r.engagement_type,
          skillId: r.skill_id,
          skillCode: r.skill_code,
          skillLabels: r.skill_labels,
          currency: r.currency,
          amountPaise: r.amount_paise,
          durationMinutes: r.duration_minutes,
          turnaroundHours: r.turnaround_hours,
        })),
      ...reachFor(reach.rows, u.id),
    }));
  }
}

/** One provider's slice of the reach query, as the card carries it. */
function reachFor(
  rows: Array<{ provider_id: string; category_id: string; domain_code: string; family_code: string }>,
  providerId: string,
): Pick<ProviderCard, 'familyCode' | 'domainCodes' | 'categoryIds'> {
  const mine = rows.filter((r) => r.provider_id === providerId);
  return {
    // Ordered by family in the query, so "first" is deterministic
    // rather than whatever the planner happened to return.
    familyCode: mine[0]?.family_code ?? null,
    domainCodes: [...new Set(mine.map((r) => r.domain_code))],
    categoryIds: [...new Set(mine.map((r) => r.category_id))],
  };
}
