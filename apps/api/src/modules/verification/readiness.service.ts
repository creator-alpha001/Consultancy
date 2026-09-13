import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { DomainLoaderService } from '../domains/domain-loader.service';
import { TrainingService } from './training.service';

export interface ReadinessStep {
  /** Stable, switched on by clients. Never a translated string. */
  code: string;
  done: boolean;
  /**
   * Whether a provider can be booked without it. A step that is not
   * required is still worth doing — it is just not the reason nobody can
   * find them.
   */
  blocking: boolean;
  /** Extra fact the screen needs: how many of a thing, what tier. */
  detail?: Record<string, unknown>;
}

export interface ProviderReadiness {
  bookable: boolean;
  /**
   * The families this checklist was computed for: the one they signed up
   * through, plus every family their credentials and verified skills
   * reach. Training is per family, so a client needs these to open it.
   */
  families: string[];
  steps: ReadinessStep[];
}

/** When a family publishes no minimum, verification at any tier is not enough on its own. */
const FALLBACK_MIN_TIER = 't2';

/**
 * What a provider still has to do before anyone can book them.
 *
 * Every piece of this existed and none of it was joined up: a person
 * signing up landed on a workspace that listed their engagements — of
 * which they had none — and said nothing about credentials, languages,
 * services, availability or payout details. They had to discover six
 * separate screens to become findable, in an order nobody told them, and
 * the failure was silent.
 *
 * **No family or domain is assumed.** This used to default to one exam
 * when a client named none, which is exactly the hardcoding hard rule #1
 * forbids. The families come from the provider: where they signed up,
 * what they have submitted, what they are verified in. The rules for
 * each (minimum tier, training) are READ from that family's pack.
 *
 * `blocking` distinguishes "nobody can find you" from "worth doing". A
 * checklist that marks everything urgent teaches people to ignore it.
 */
@Injectable()
export class ReadinessService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DomainLoaderService) private readonly loader: DomainLoaderService,
    @Inject(TrainingService) private readonly training: TrainingService,
  ) {}

  /** The families a provider is in or joining, most specific first. Never assumed. */
  async familiesFor(providerId: string, domainCode?: string): Promise<string[]> {
    const res = await this.pool.query<{ family_code: string }>(
      `SELECT family_code FROM (
         SELECT d.family_code, 0 AS rank FROM domains d WHERE d.code = $2
         UNION
         SELECT u.signup_family_code, 1 FROM users u WHERE u.id = $1 AND u.signup_family_code IS NOT NULL
         UNION
         SELECT d.family_code, 2 FROM provider_credentials pc JOIN domains d ON d.code = pc.domain_code
          WHERE pc.provider_id = $1
         UNION
         SELECT d.family_code, 3 FROM provider_skills ps
           JOIN category_skills cs ON cs.skill_id = ps.skill_id
           JOIN categories c ON c.id = cs.category_id
           JOIN domains d ON d.code = c.domain_code
          WHERE ps.provider_id = $1 AND ps.active
       ) f
       GROUP BY family_code
       ORDER BY min(rank), family_code`,
      [providerId, domainCode ?? null],
    );
    return res.rows.map((r) => r.family_code);
  }

  async forProvider(providerId: string, domainCode?: string): Promise<ProviderReadiness> {
    const families = await this.familiesFor(providerId, domainCode);

    const minTierByFamily = new Map<string, string>();
    let trainingDone = families.length > 0;
    const trainingByFamily: Array<{ familyCode: string; done: boolean }> = [];
    for (const code of families) {
      const family = await this.loader.getFamily(code).catch(() => null);
      minTierByFamily.set(code, family?.policy?.minTierForPaidWork ?? FALLBACK_MIN_TIER);
      const done = family ? await this.training.isComplete(providerId, code) : false;
      trainingByFamily.push({ familyCode: code, done });
      trainingDone = trainingDone && done;
    }

    const [counts, skillFamilies] = await Promise.all([
      this.pool.query<{
        verified_skills: string;
        languages: string;
        services: string;
        availability_rules: string;
        has_payout: boolean;
        credentials_pending: string;
        credentials_rejected: string;
        paid_work_blocked: boolean;
        email_verified: boolean;
        has_name: boolean;
        has_bio: boolean;
      }>(
        `SELECT
           (SELECT count(*) FROM provider_skills WHERE provider_id = $1 AND active)::text AS verified_skills,
           (SELECT count(*) FROM provider_languages WHERE provider_id = $1 AND can_evaluate)::text AS languages,
           (SELECT count(*) FROM provider_rates WHERE provider_id = $1 AND active)::text AS services,
           (SELECT count(*) FROM provider_availability_rules WHERE provider_id = $1)::text AS availability_rules,
           EXISTS (SELECT 1 FROM provider_payout_details WHERE provider_id = $1) AS has_payout,
           (SELECT count(*) FROM provider_credentials
             WHERE provider_id = $1 AND status IN ('submitted', 'under_review'))::text AS credentials_pending,
           (SELECT count(*) FROM provider_credentials
             WHERE provider_id = $1 AND status = 'rejected')::text AS credentials_rejected,
           EXISTS (SELECT 1 FROM provider_paid_work_blocked WHERE provider_id = $1) AS paid_work_blocked,
           (SELECT email_verified_at IS NOT NULL FROM users WHERE id = $1) AS email_verified,
           (SELECT display_name IS NOT NULL FROM users WHERE id = $1) AS has_name,
           EXISTS (SELECT 1 FROM provider_profiles WHERE provider_id = $1 AND bio IS NOT NULL) AS has_bio`,
        [providerId],
      ),
      // Each verified skill, with the families it serves. A skill counts
      // toward paid work where its tier meets THAT family's minimum.
      this.pool.query<{ skill_id: string; tier: string; family_code: string }>(
        `SELECT DISTINCT ps.skill_id, ps.tier::text AS tier, d.family_code
           FROM provider_skills ps
           JOIN category_skills cs ON cs.skill_id = ps.skill_id
           JOIN categories c ON c.id = cs.category_id
           JOIN domains d ON d.code = c.domain_code
          WHERE ps.provider_id = $1 AND ps.active`,
        [providerId],
      ),
    ]);

    const r = counts.rows[0];
    const verifiedSkills = Number(r.verified_skills);
    const atMinTier = new Set(
      skillFamilies.rows
        .filter((s) => s.tier >= (minTierByFamily.get(s.family_code) ?? FALLBACK_MIN_TIER))
        .map((s) => s.skill_id),
    ).size;
    const languages = Number(r.languages);
    const services = Number(r.services);
    const availability = Number(r.availability_rules);
    const pending = Number(r.credentials_pending);
    const rejected = Number(r.credentials_rejected);

    const steps: ReadinessStep[] = [
      {
        code: 'email_verified',
        // A provider is paid and has work sent to them. If their address
        // does not reach them, neither does anything the platform owes
        // them — a payout failure, a dispute, a verification decision.
        done: r.email_verified,
        blocking: true,
      },
      {
        code: 'profile_complete',
        // A seeker choosing who to trust with their work reads this first.
        done: r.has_name && r.has_bio,
        blocking: true,
        detail: { hasName: r.has_name, hasBio: r.has_bio },
      },
      {
        code: 'credential_submitted',
        // Pending counts as done: they have acted, and the wait is ours.
        done: verifiedSkills > 0 || pending > 0,
        blocking: true,
        detail: { pending, rejected },
      },
      {
        code: 'skill_verified_at_tier',
        done: atMinTier > 0,
        blocking: true,
        detail: { minTierByFamily: Object.fromEntries(minTierByFamily), verifiedSkills, atMinTier },
      },
      {
        code: 'working_language',
        done: languages > 0,
        // Language is a matching dimension everywhere (#19): with none
        // declared, no search can return them.
        blocking: true,
        detail: { languages },
      },
      {
        code: 'service_published',
        done: services > 0,
        blocking: true,
        detail: { services },
      },
      {
        code: 'training_complete',
        // Every family they work in. CLAUDE.md #25 — a mentor who has
        // never been told there is a distress-escalation path will meet
        // one unprepared, in a session, in real time.
        done: trainingDone,
        blocking: true,
        detail: { families: trainingByFamily },
      },
      {
        code: 'availability_set',
        // Only live work needs hours. Async work is bookable without them.
        done: availability > 0,
        blocking: false,
        detail: { rules: availability },
      },
      {
        code: 'payout_destination',
        // Not blocking on purpose. Money is owed the moment work is
        // accepted whether or not there is somewhere to send it.
        done: r.has_payout,
        blocking: false,
      },
    ];

    return {
      bookable: steps.every((s) => !s.blocking || s.done) && !r.paid_work_blocked,
      families,
      steps,
    };
  }
}
