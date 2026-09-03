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

/**
 * Which commitment an engagement type takes.
 *
 * `live_session` is the only type whose promise is contact time; the rest
 * are "you get it back by". Derived from the type rather than stored,
 * because it is a property of what the work IS — a family adding a new
 * live format should not have to remember to flag it somewhere else.
 */
export function commitmentKindFor(engagementType: string): 'duration' | 'turnaround' {
  return engagementType === 'live_session' ? 'duration' : 'turnaround';
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
    /** Minutes for live work, hours-to-return for async. One or the other. */
    commitment?: number | null;
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
    // told what it costs and not what they get. Which unit applies is a
    // property of the engagement type, so the caller supplies one number
    // and this decides what it means.
    const kind = commitmentKindFor(input.engagementType);
    const commitment = input.commitment ?? null;
    if (commitment !== null && (!Number.isInteger(commitment) || commitment <= 0)) {
      throw new AppError(
        'RATE_COMMITMENT_INVALID',
        kind === 'duration'
          ? 'give the session length in whole minutes'
          : 'give the turnaround in whole hours',
        { status: HttpStatus.UNPROCESSABLE_ENTITY },
      );
    }
    const durationMinutes = kind === 'duration' ? commitment : null;
    const turnaroundHours = kind === 'turnaround' ? commitment : null;

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
