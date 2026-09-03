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
  steps: ReadinessStep[];
}

/**
 * What a provider still has to do before anyone can book them.
 *
 * Every piece of this existed and none of it was joined up: a person
 * signing up landed on a workspace that listed their engagements — of
 * which they had none — and said nothing about credentials, languages,
 * services, availability or payout details. They had to discover six
 * separate screens to become findable, in an order nobody told them, and
 * the failure was silent: an unverified provider with no hours simply
 * never appeared in a search and never learnt why.
 *
 * The rules here are READ from the pack, not written here. The minimum
 * tier for paid work is family policy, so a family that verifies harder
 * gets a stricter checklist with no code change (#4).
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

  async forProvider(providerId: string, domainCode: string): Promise<ProviderReadiness> {
    const domain = await this.loader.getDomain(domainCode).catch(() => null);
    const minTier = domain?.policy?.minTierForPaidWork ?? 't2';
    const trainingDone = domain
      ? await this.training.isComplete(providerId, domain.familyCode)
      : true;

    const res = await this.pool.query<{
      verified_skills: string;
      skills_at_min_tier: string;
      languages: string;
      services: string;
      availability_rules: string;
      has_payout: boolean;
      credentials_pending: string;
      credentials_rejected: string;
      paid_work_blocked: boolean;
    }>(
      `SELECT
         (SELECT count(*) FROM provider_skills WHERE provider_id = $1 AND active)::text
           AS verified_skills,
         (SELECT count(*) FROM provider_skills
           WHERE provider_id = $1 AND active AND tier >= $2::mentor_tier)::text
           AS skills_at_min_tier,
         (SELECT count(*) FROM provider_languages WHERE provider_id = $1 AND can_evaluate)::text
           AS languages,
         (SELECT count(*) FROM provider_rates WHERE provider_id = $1 AND active)::text
           AS services,
         (SELECT count(*) FROM provider_availability_rules WHERE provider_id = $1)::text
           AS availability_rules,
         EXISTS (SELECT 1 FROM provider_payout_details WHERE provider_id = $1)
           AS has_payout,
         (SELECT count(*) FROM provider_credentials
           WHERE provider_id = $1 AND status IN ('submitted', 'under_review'))::text
           AS credentials_pending,
         (SELECT count(*) FROM provider_credentials
           WHERE provider_id = $1 AND status = 'rejected')::text
           AS credentials_rejected,
         EXISTS (SELECT 1 FROM provider_paid_work_blocked WHERE provider_id = $1)
           AS paid_work_blocked`,
      [providerId, minTier],
    );

    const r = res.rows[0];
    const verifiedSkills = Number(r.verified_skills);
    const atMinTier = Number(r.skills_at_min_tier);
    const languages = Number(r.languages);
    const services = Number(r.services);
    const availability = Number(r.availability_rules);
    const pending = Number(r.credentials_pending);
    const rejected = Number(r.credentials_rejected);

    const steps: ReadinessStep[] = [
      {
        code: 'credential_submitted',
        // Pending counts as done: they have acted, and the wait is ours.
        // Marking it incomplete while a reviewer holds it would tell them
        // to do something they have already done.
        done: verifiedSkills > 0 || pending > 0,
        blocking: true,
        detail: { pending, rejected },
      },
      {
        code: 'skill_verified_at_tier',
        done: atMinTier > 0,
        blocking: true,
        detail: { minTier, verifiedSkills, atMinTier },
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
        done: trainingDone,
        // Blocking, and this is the one that is least negotiable.
        // CLAUDE.md #25 — a mentor who has never been told there is a
        // distress-escalation path will meet one unprepared, in a
        // session, in real time. Letting them take paid work first is a
        // decision to find out the hard way.
        blocking: true,
      },
      {
        code: 'availability_set',
        // Only live work needs hours. Async work is bookable without
        // them, so this blocks nothing on its own.
        done: availability > 0,
        blocking: false,
        detail: { rules: availability },
      },
      {
        code: 'payout_destination',
        // Not blocking on purpose. Money is owed the moment work is
        // accepted whether or not there is somewhere to send it, and
        // refusing bookings over an unfilled form would cost a provider
        // work for no protection.
        done: r.has_payout,
        blocking: false,
      },
    ];

    return {
      bookable: steps.every((s) => !s.blocking || s.done) && !r.paid_work_blocked,
      steps,
    };
  }
}
