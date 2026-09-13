import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { AppError } from '../../common/errors/app-error';
import { PG_POOL } from '../../database/db.module';

export interface ProviderRate {
  id: string;
  engagementType: string;
  skillId: string | null;
  skillCode: string | null;
  skillLabels: Record<string, string> | null;
  currency: string;
  amountPaise: string;
  /** Time with the seeker. Live work only. */
  durationMinutes: number | null;
  /** Time until it comes back. Async work only. */
  turnaroundHours: number | null;
}

export type CommitmentKind = 'duration' | 'turnaround';

/**
 * Which commitments an engagement type makes, most-prominent first.
 *
 * A type promises contact time ("forty-five minutes with you"), a
 * deadline ("back within three days"), or — for a combined format —
 * both. Derived from the type rather than stored, because it is a
 * property of what the work IS: a family adding a live format should not
 * have to remember to flag it somewhere else.
 *
 * The order matters. The first kind is the headline promise, and is what
 * a single unlabelled commitment figure is taken to mean; a combined
 * type states its deadline first because that is what the seeker is
 * waiting on before the call can happen at all.
 *
 * This table is the last hardcoded piece of engagement-type knowledge in
 * core, and 0052 moved the database's version of it here on purpose —
 * SQL could not express it without naming a family's type in core DDL.
 * It belongs in the manifest beside `engagementTypes`; TRACKER.md D-
 * records that. Until then, a new combined type is one line here.
 */
export function commitmentKindsFor(engagementType: string): CommitmentKind[] {
  switch (engagementType) {
    case 'live_session':
      return ['duration'];
    case 'review_with_live':
      return ['turnaround', 'duration'];
    default:
      return ['turnaround'];
  }
}

/** The headline promise. Kept for callers that only render one figure. */
export function commitmentKindFor(engagementType: string): CommitmentKind {
  return commitmentKindsFor(engagementType)[0];
}

/**
 * What a provider charges.
 *
 * The price of an engagement used to come entirely from the seeker: the
 * booking screen showed the domain's typical band and an empty box, and
 * whatever was typed became the amount. A provider had no way to state a
 * rate, so the platform was asking people to accept work at a price they
 * had never agreed to.
 *
 * ── The rule this file must not break ───────────────────────────────
 *
 * A rate is DISPLAYED and used to prefill. It is never an ordering input.
 * Hard rule #15 forbids price sorting on proposals at any layer, and
 * introducing a price column is exactly the moment somebody reaches for
 * `ORDER BY amount_paise`. Nothing here returns a sorted-by-price list,
 * and `rateFor` answers one question about one provider.
 */
@Injectable()
export class RatesService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(providerId: string): Promise<ProviderRate[]> {
    const res = await this.pool.query<{
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
      `SELECT r.id, r.engagement_type, r.skill_id, s.code AS skill_code, s.labels AS skill_labels,
              r.currency, r.amount_paise::text, r.duration_minutes, r.turnaround_hours
         FROM provider_rates r
         LEFT JOIN skills s ON s.id = r.skill_id
        WHERE r.provider_id = $1 AND r.active
        -- Ordered by what it is FOR, never by what it costs (#15).
        ORDER BY r.engagement_type, s.code NULLS FIRST`,
      [providerId],
    );
    return res.rows.map((r) => ({
      id: r.id,
      engagementType: r.engagement_type,
      skillId: r.skill_id,
      skillCode: r.skill_code,
      skillLabels: r.skill_labels,
      currency: r.currency,
      amountPaise: r.amount_paise,
      durationMinutes: r.duration_minutes,
      turnaroundHours: r.turnaround_hours,
    }));
  }

  /**
   * The rate that applies to one piece of work.
   *
   * A skill-specific rate wins over the provider's default for that
   * engagement type. Returns null when they have set neither — which is a
   * real answer, not a zero: a provider with no rate has not said what
   * they charge, and the booking screen must ask rather than assume.
   */
  async rateFor(input: {
    providerId: string;
    engagementType: string;
    skillIds?: string[];
  }): Promise<ProviderRate | null> {
    const res = await this.pool.query<{
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
      `SELECT r.id, r.engagement_type, r.skill_id, s.code AS skill_code, s.labels AS skill_labels,
              r.currency, r.amount_paise::text, r.duration_minutes, r.turnaround_hours
         FROM provider_rates r
         LEFT JOIN skills s ON s.id = r.skill_id
        WHERE r.provider_id = $1
          AND r.engagement_type = $2
          AND r.active
          AND (r.skill_id IS NULL OR r.skill_id = ANY($3::uuid[]))
        -- A rate naming a skill beats the default. NULLS LAST does that.
        ORDER BY r.skill_id NULLS LAST
        LIMIT 1`,
      [input.providerId, input.engagementType, input.skillIds ?? []],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      engagementType: row.engagement_type,
      skillId: row.skill_id,
      skillCode: row.skill_code,
      skillLabels: row.skill_labels,
      currency: row.currency,
      amountPaise: row.amount_paise,
      durationMinutes: row.duration_minutes,
      turnaroundHours: row.turnaround_hours,
    };
  }

  async set(input: {
    providerId: string;
    engagementType: string;
    skillId?: string | null;
    amountPaise: string;
    currency?: string;
    /**
     * The type's headline promise as a bare number — minutes or hours,
     * whichever `commitmentKindsFor` says comes first. The older shape,
     * kept because a client with one commitment box should not have to
     * know which unit it is in.
     */
    commitment?: number | null;
    /**
     * The same promises named rather than ordered. A client that offers
     * both boxes sends these; whichever the type does not make is
     * IGNORED rather than rejected, so a form does not have to know
     * which fields apply to the type the provider just picked.
     */
    durationMinutes?: number | null;
    turnaroundHours?: number | null;
  }): Promise<ProviderRate> {
    // Parsed as BigInt, not Number: an amount in paise is a bigint
    // everywhere on this platform, and Number would silently round a
    // large one (#5).
    let amount: bigint;
    try {
      amount = BigInt(input.amountPaise);
    } catch {
      throw new AppError('RATE_INVALID', 'that is not an amount', {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }
    if (amount <= 0n) {
      throw new AppError('RATE_INVALID', 'a rate has to be more than zero', {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }

    // A price with no stated commitment is half a listing: the seeker is
    // told what it costs and not what they get. Which unit each figure
    // is in is a property of the engagement type, so the caller supplies
    // bare numbers in order and this decides what they mean.
    const kinds = commitmentKindsFor(input.engagementType);
    const named: Record<CommitmentKind, number | null> = {
      duration: input.durationMinutes ?? null,
      turnaround: input.turnaroundHours ?? null,
    };
    // The bare figure fills the headline promise, and only when the
    // named field for it was not sent — a client using the old shape
    // and one using the new never disagree about the same number.
    if (input.commitment != null && named[kinds[0]] == null) {
      named[kinds[0]] = input.commitment;
    }

    const byKind: Record<CommitmentKind, number | null> = { duration: null, turnaround: null };
    for (const kind of kinds) {
      const value = named[kind];
      if (value === null || value === undefined) continue;
      if (!Number.isInteger(value) || value <= 0) {
        throw new AppError(
          'RATE_COMMITMENT_INVALID',
          kind === 'duration'
            ? 'give the session length in whole minutes'
            : 'give the turnaround in whole hours',
          { status: HttpStatus.UNPROCESSABLE_ENTITY },
        );
      }
      byKind[kind] = value;
    }

    const durationMinutes = byKind.duration;
    const turnaroundHours = byKind.turnaround;

    const skillId = input.skillId ?? null;
    // Two statements rather than one ON CONFLICT: the uniqueness is
    // enforced by two PARTIAL indexes (a NULL skill never equals another
    // NULL skill), and ON CONFLICT cannot name a partial index target
    // that depends on a nullable column being null.
    if (skillId === null) {
      await this.pool.query(
        `INSERT INTO provider_rates
           (provider_id, engagement_type, skill_id, currency, amount_paise, duration_minutes, turnaround_hours)
         VALUES ($1, $2, NULL, $3, $4, $5, $6)
         ON CONFLICT (provider_id, engagement_type) WHERE skill_id IS NULL
         DO UPDATE SET amount_paise = EXCLUDED.amount_paise,
                       currency = EXCLUDED.currency,
                       duration_minutes = EXCLUDED.duration_minutes,
                       turnaround_hours = EXCLUDED.turnaround_hours,
                       active = true,
                       updated_at = now()`,
        [
          input.providerId,
          input.engagementType,
          input.currency ?? 'INR',
          amount.toString(),
          durationMinutes,
          turnaroundHours,
        ],
      );
    } else {
      await this.pool.query(
        `INSERT INTO provider_rates
           (provider_id, engagement_type, skill_id, currency, amount_paise, duration_minutes, turnaround_hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (provider_id, engagement_type, skill_id) WHERE skill_id IS NOT NULL
         DO UPDATE SET amount_paise = EXCLUDED.amount_paise,
                       currency = EXCLUDED.currency,
                       duration_minutes = EXCLUDED.duration_minutes,
                       turnaround_hours = EXCLUDED.turnaround_hours,
                       active = true,
                       updated_at = now()`,
        [
          input.providerId,
          input.engagementType,
          skillId,
          input.currency ?? 'INR',
          amount.toString(),
          durationMinutes,
          turnaroundHours,
        ],
      );
    }

    const saved = await this.rateFor({
      providerId: input.providerId,
      engagementType: input.engagementType,
      skillIds: skillId ? [skillId] : [],
    });
    return saved!;
  }

  /** Withdraw a rate. Soft, so a historic engagement's price stays explicable. */
  async remove(providerId: string, rateId: string): Promise<void> {
    await this.pool.query(
      `UPDATE provider_rates SET active = false, updated_at = now()
        WHERE id = $1 AND provider_id = $2`,
      [rateId, providerId],
    );
  }
}
