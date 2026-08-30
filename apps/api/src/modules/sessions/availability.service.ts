import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/db.module';
import { invalidRrule, invalidAvailabilityWindow, slotNotAvailable } from './errors';

/** Sunday-first, matching Postgres `EXTRACT(dow)`. */
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

const WEEKLY_BYDAY = /^FREQ=WEEKLY;BYDAY=(SU|MO|TU|WE|TH|FR|SA)(,(SU|MO|TU|WE|TH|FR|SA))*$/;

export interface AvailabilityRuleInput {
  timezone: string;
  /** Subset of RFC 5545: `FREQ=WEEKLY;BYDAY=MO,WE`. Anything else is refused. */
  rrule: string;
  startMinute: number;
  endMinute: number;
  effectiveFrom?: string;
  effectiveTo?: string | null;
}

export interface AvailabilityRule extends AvailabilityRuleInput {
  id: string;
  providerId: string;
}

export interface BookingPolicy {
  minNoticeMinutes: number;
  bufferMinutes: number;
  maxAdvanceDays: number;
  slotMinutes: number;
}

export const DEFAULT_BOOKING_POLICY: BookingPolicy = {
  minNoticeMinutes: 720,
  bufferMinutes: 15,
  maxAdvanceDays: 60,
  slotMinutes: 60,
};

export interface Slot {
  start: Date;
  end: Date;
}

/**
 * When a provider can actually be booked (SPEC-PLATFORM.md §9).
 *
 * Slot generation runs **in Postgres**, deliberately. Every hard part
 * here is a timezone question — does 18:00 local stay 18:00 across a DST
 * change, does a rule written in Asia/Kolkata mean the same instant to a
 * seeker in London — and `timestamp AT TIME ZONE 'IANA/Name'` answers
 * those with the tz database rather than with arithmetic somebody has to
 * get right by hand. Doing it in JS would mean reimplementing that, and
 * the failure mode is silent: a slot an hour off, twice a year, for the
 * providers who happen to live somewhere with DST.
 *
 * The RRULE support is a documented subset — `FREQ=WEEKLY;BYDAY=…`.
 * Anything else is refused at the boundary rather than partially
 * understood, because a rule quietly misread books sessions at times the
 * provider never offered.
 */
@Injectable()
export class AvailabilityService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  private parseWeekdays(rrule: string): number[] {
    if (!WEEKLY_BYDAY.test(rrule)) throw invalidRrule(rrule);
    const days = rrule.split('BYDAY=')[1].split(',');
    return days.map((d) => BYDAY.indexOf(d as (typeof BYDAY)[number]));
  }

  async addRule(providerId: string, input: AvailabilityRuleInput): Promise<AvailabilityRule> {
    this.parseWeekdays(input.rrule);
    if (input.endMinute <= input.startMinute) {
      throw invalidAvailabilityWindow(input.startMinute, input.endMinute);
    }
    // Validated by asking Postgres, so the accepted set is exactly the
    // tz database the slot generation will later use — not a list in
    // application code that can drift from it.
    await this.assertTimezone(input.timezone);

    const res = await this.pool.query<{ id: string }>(
      `INSERT INTO provider_availability_rules
         (provider_id, timezone, rrule, start_minute, end_minute, effective_from, effective_to)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, current_date), $7::date)
       RETURNING id`,
      [
        providerId,
        input.timezone,
        input.rrule,
        input.startMinute,
        input.endMinute,
        input.effectiveFrom ?? null,
        input.effectiveTo ?? null,
      ],
    );
    return { ...input, id: res.rows[0].id, providerId };
  }

  private async assertTimezone(timezone: string): Promise<void> {
    const res = await this.pool.query<{ ok: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = $1) AS ok`,
      [timezone],
    );
    if (!res.rows[0].ok) throw invalidAvailabilityWindow(0, 0, `unknown timezone "${timezone}"`);
  }

  async listRules(providerId: string): Promise<AvailabilityRule[]> {
    const res = await this.pool.query<{
      id: string;
      timezone: string;
      rrule: string;
      start_minute: number;
      end_minute: number;
      effective_from: Date;
      effective_to: Date | null;
    }>(
      `SELECT id, timezone, rrule, start_minute, end_minute, effective_from, effective_to
         FROM provider_availability_rules WHERE provider_id = $1 ORDER BY start_minute`,
      [providerId],
    );
    return res.rows.map((r) => ({
      id: r.id,
      providerId,
      timezone: r.timezone,
      rrule: r.rrule,
      startMinute: r.start_minute,
      endMinute: r.end_minute,
      effectiveFrom: r.effective_from.toISOString().slice(0, 10),
      effectiveTo: r.effective_to ? r.effective_to.toISOString().slice(0, 10) : null,
    }));
  }

  async removeRule(providerId: string, ruleId: string): Promise<void> {
    await this.pool.query(`DELETE FROM provider_availability_rules WHERE id = $1 AND provider_id = $2`, [
      ruleId,
      providerId,
    ]);
  }

  async addException(
    providerId: string,
    input: { onDate: string; startMinute?: number | null; endMinute?: number | null; reason?: string },
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO provider_availability_exceptions (provider_id, on_date, start_minute, end_minute, reason)
       VALUES ($1, $2::date, $3, $4, $5)`,
      [providerId, input.onDate, input.startMinute ?? null, input.endMinute ?? null, input.reason ?? null],
    );
  }

  async getPolicy(providerId: string): Promise<BookingPolicy> {
    const res = await this.pool.query<{
      min_notice_minutes: number;
      buffer_minutes: number;
      max_advance_days: number;
      slot_minutes: number;
    }>(
      `SELECT min_notice_minutes, buffer_minutes, max_advance_days, slot_minutes
         FROM provider_booking_policy WHERE provider_id = $1`,
      [providerId],
    );
    const row = res.rows[0];
    // A provider who has never opened the screen gets the conservative
    // defaults, not "bookable in ten minutes".
    if (!row) return { ...DEFAULT_BOOKING_POLICY };
    return {
      minNoticeMinutes: row.min_notice_minutes,
      bufferMinutes: row.buffer_minutes,
      maxAdvanceDays: row.max_advance_days,
      slotMinutes: row.slot_minutes,
    };
  }

  async setPolicy(providerId: string, policy: Partial<BookingPolicy>): Promise<BookingPolicy> {
    const current = await this.getPolicy(providerId);
    const next = { ...current, ...policy };
    await this.pool.query(
      `INSERT INTO provider_booking_policy (provider_id, min_notice_minutes, buffer_minutes, max_advance_days, slot_minutes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider_id) DO UPDATE
          SET min_notice_minutes = EXCLUDED.min_notice_minutes,
              buffer_minutes = EXCLUDED.buffer_minutes,
              max_advance_days = EXCLUDED.max_advance_days,
              slot_minutes = EXCLUDED.slot_minutes`,
      [providerId, next.minNoticeMinutes, next.bufferMinutes, next.maxAdvanceDays, next.slotMinutes],
    );
    return next;
  }

  /**
   * The bookable slots in a window.
   *
   * Everything is applied here rather than left to the caller: the
   * notice period, the advance limit, exceptions, buffers around
   * existing sessions. A client that had to apply any of them itself
   * would be a client that can get it wrong, and the same list is what
   * `assertBookable` checks against at booking time — so what a seeker
   * is shown and what the server will accept cannot drift apart.
   */
  async slotsFor(providerId: string, fromIso: string, toIso: string): Promise<Slot[]> {
    const policy = await this.getPolicy(providerId);

    const res = await this.pool.query<{ slot_start: Date; slot_end: Date }>(
      `
      WITH bounds AS (
        SELECT
          GREATEST($2::timestamptz, now() + ($4 || ' minutes')::interval) AS from_ts,
          LEAST($3::timestamptz, now() + ($5 || ' days')::interval)       AS to_ts
      ),
      days AS (
        -- One row per (rule, local date) the rule could fire on. The
        -- date series is generated in the RULE's timezone, because
        -- "every Monday" is a statement about the provider's calendar.
        SELECT r.id AS rule_id, r.timezone, r.start_minute, r.end_minute,
               d::date AS local_date
          FROM provider_availability_rules r
          CROSS JOIN bounds b
          CROSS JOIN LATERAL generate_series(
            (b.from_ts AT TIME ZONE r.timezone)::date,
            (b.to_ts   AT TIME ZONE r.timezone)::date,
            interval '1 day'
          ) AS d
         WHERE r.provider_id = $1
           AND d::date >= r.effective_from
           AND (r.effective_to IS NULL OR d::date <= r.effective_to)
           -- The BYDAY half of the rule, evaluated against the local date.
           AND position(
                 (ARRAY['SU','MO','TU','WE','TH','FR','SA'])[EXTRACT(dow FROM d)::int + 1]
                 IN split_part(r.rrule, 'BYDAY=', 2)
               ) > 0
      ),
      windows AS (
        -- Local wall-clock -> instant, via the tz database. This is the
        -- line that makes 18:00 stay 18:00 across a DST change.
        SELECT
          ((local_date + (start_minute || ' minutes')::interval) AT TIME ZONE timezone) AS win_start,
          ((local_date + (end_minute   || ' minutes')::interval) AT TIME ZONE timezone) AS win_end
        FROM days
      ),
      candidate AS (
        SELECT s AS slot_start, s + ($6 || ' minutes')::interval AS slot_end
          FROM windows w
          CROSS JOIN LATERAL generate_series(
            w.win_start, w.win_end - ($6 || ' minutes')::interval, ($6 || ' minutes')::interval
          ) AS s
      )
      SELECT DISTINCT c.slot_start, c.slot_end
        FROM candidate c
        CROSS JOIN bounds b
       WHERE c.slot_start >= b.from_ts
         AND c.slot_end <= b.to_ts
         -- Blocked by an exception: whole-day, or an overlapping window.
         AND NOT EXISTS (
           SELECT 1
             FROM provider_availability_exceptions e
             JOIN provider_availability_rules r2 ON r2.provider_id = e.provider_id
            WHERE e.provider_id = $1
              AND e.on_date = (c.slot_start AT TIME ZONE r2.timezone)::date
              AND (
                (e.start_minute IS NULL AND e.end_minute IS NULL)
                OR tstzrange(
                     (e.on_date + (e.start_minute || ' minutes')::interval) AT TIME ZONE r2.timezone,
                     (e.on_date + (e.end_minute   || ' minutes')::interval) AT TIME ZONE r2.timezone
                   ) && tstzrange(c.slot_start, c.slot_end)
              )
         )
         -- Taken, including the buffer either side. A cancelled session
         -- frees its slot; anything else still holds it.
         AND NOT EXISTS (
           -- The provider is reached through the engagement rather than
           -- denormalised onto the sessions row: a second copy of the
           -- same fact is a second thing that can be wrong.
           SELECT 1
             FROM sessions s2
             JOIN engagements e2 ON e2.id = s2.engagement_id
            WHERE e2.provider_id = $1
              AND s2.status <> 'cancelled'
              AND tstzrange(
                    s2.scheduled_start - ($7 || ' minutes')::interval,
                    s2.scheduled_end   + ($7 || ' minutes')::interval
                  ) && tstzrange(c.slot_start, c.slot_end)
         )
       ORDER BY c.slot_start
      `,
      [
        providerId,
        fromIso,
        toIso,
        policy.minNoticeMinutes,
        policy.maxAdvanceDays,
        policy.slotMinutes,
        policy.bufferMinutes,
      ],
    );

    return res.rows.map((r) => ({ start: r.slot_start, end: r.slot_end }));
  }

  /**
   * The same question, asked at booking time.
   *
   * Deliberately answered by generating the slots again rather than by a
   * cheaper overlap check: the rule a seeker was shown and the rule the
   * server enforces must be the same rule, or the two drift and the
   * difference shows up as "the slot I picked was refused".
   */
  async assertBookable(providerId: string, start: Date, end: Date): Promise<void> {
    const slots = await this.slotsFor(
      providerId,
      new Date(start.getTime() - 60_000).toISOString(),
      new Date(end.getTime() + 60_000).toISOString(),
    );
    const ok = slots.some((s) => s.start.getTime() === start.getTime() && s.end.getTime() === end.getTime());
    if (!ok) throw slotNotAvailable(providerId, start.toISOString());
  }
}
