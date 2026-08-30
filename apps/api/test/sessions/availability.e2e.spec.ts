import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../src/database/db.module';
import { AvailabilityService } from '../../src/modules/sessions/availability.service';
import { SessionService } from '../../src/modules/sessions/session.service';
import { SessionsModule } from '../../src/modules/sessions/sessions.module';
import { closeTestApp, createTestApp } from '../nest-test-app';
import { resetDatabase, seedEngagement, seedUsers } from '../test-utils';

/**
 * SPEC-PLATFORM.md §9: "Booking on RRULE availability with exceptions,
 * buffers, notice periods, timezone-correct."
 *
 * Before this, a session was booked against whatever instant the caller
 * sent — 3am, in the past, or on top of an existing session, all
 * accepted.
 *
 * The timezone tests use America/New_York rather than Asia/Kolkata on
 * purpose. India has no DST, so an India-only test would pass whether or
 * not the tz database is being consulted at all — and "18:00 stays 18:00
 * across the change" is precisely the property worth proving.
 */
describe('provider availability and booking', () => {
  let app: INestApplication;
  let pool: Pool;
  let availability: AvailabilityService;
  let sessions: SessionService;

  beforeEach(async () => {
    if (!app) {
      app = await createTestApp([SessionsModule]);
      pool = app.get<Pool>(PG_POOL);
      availability = app.get(AvailabilityService);
      sessions = app.get(SessionService);
    }
    await resetDatabase(pool);
  });

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  /** A Monday well clear of "now", so the notice period never decides the result. */
  function nextMonday(weeksAhead = 1): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 7 * weeksAhead);
    while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  it('offers slots only inside the declared window, on the declared days', async () => {
    const { providerId } = await seedUsers(pool);
    await availability.addRule(providerId, {
      timezone: 'Asia/Kolkata',
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      startMinute: 10 * 60,
      endMinute: 12 * 60,
    });

    const monday = nextMonday();
    const slots = await availability.slotsFor(providerId, `${monday}T00:00:00Z`, `${monday}T23:59:59Z`);

    // 10:00 and 11:00 IST, and nothing else: two one-hour slots in a
    // two-hour window.
    expect(slots).toHaveLength(2);
    const local = slots.map((s) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(s.start),
    );
    expect(local).toEqual(['10:00', '11:00']);

    // A day the rule does not name offers nothing.
    const tuesday = new Date(`${monday}T00:00:00Z`);
    tuesday.setUTCDate(tuesday.getUTCDate() + 1);
    const tueIso = tuesday.toISOString().slice(0, 10);
    expect(await availability.slotsFor(providerId, `${tueIso}T00:00:00Z`, `${tueIso}T23:59:59Z`)).toHaveLength(0);
  });

  it('keeps a local start time fixed across a daylight-saving change', async () => {
    const { providerId } = await seedUsers(pool);
    await availability.addRule(providerId, {
      timezone: 'America/New_York',
      rrule: 'FREQ=WEEKLY;BYDAY=SU',
      startMinute: 18 * 60,
      endMinute: 19 * 60,
      effectiveFrom: '2020-01-01',
    });

    // Two Sundays either side of the 2026 US fall-back (1 November).
    // The UTC instants differ by an hour; the local time must not.
    // Both are in the future, so the notice period does not remove them
    // — an earlier version of this test used March and silently got an
    // empty list back, which passes nothing.
    // The horizon has to reach past the transition, or the second half
    // of this test measures the booking window rather than DST.
    await availability.setPolicy(providerId, { maxAdvanceDays: 365 });
    const before = await availability.slotsFor(providerId, '2026-10-25T00:00:00Z', '2026-10-26T12:00:00Z');
    const after = await availability.slotsFor(providerId, '2026-11-08T00:00:00Z', '2026-11-09T12:00:00Z');
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(1);

    const asLocal = (d: Date): string =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(d);

    expect(asLocal(before[0].start)).toBe('18:00');
    expect(asLocal(after[0].start)).toBe('18:00');
    // And the proof that this is a real DST crossing rather than two
    // identical weeks: the UTC hour moved.
    expect(before[0].start.getUTCHours()).not.toBe(after[0].start.getUTCHours());
  });

  it('respects the notice period, so nothing is bookable in ten minutes', async () => {
    const { providerId } = await seedUsers(pool);
    // Available every day, all day, from today.
    await availability.addRule(providerId, {
      timezone: 'Asia/Kolkata',
      rrule: 'FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA',
      startMinute: 0,
      endMinute: 1440,
      effectiveFrom: new Date().toISOString().slice(0, 10),
    });
    await availability.setPolicy(providerId, { minNoticeMinutes: 24 * 60 });

    const soon = await availability.slotsFor(
      providerId,
      new Date().toISOString(),
      new Date(Date.now() + 12 * 3_600_000).toISOString(),
    );
    // The whole window is inside the notice period.
    expect(soon).toHaveLength(0);

    const later = await availability.slotsFor(
      providerId,
      new Date().toISOString(),
      new Date(Date.now() + 48 * 3_600_000).toISOString(),
    );
    expect(later.length).toBeGreaterThan(0);
    expect(later[0].start.getTime()).toBeGreaterThanOrEqual(Date.now() + 24 * 3_600_000 - 60_000);
  });

  it('drops slots blocked by an exception — a whole day, or one afternoon', async () => {
    const { providerId } = await seedUsers(pool);
    await availability.addRule(providerId, {
      timezone: 'Asia/Kolkata',
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      startMinute: 10 * 60,
      endMinute: 14 * 60,
    });
    const monday = nextMonday();
    expect(await availability.slotsFor(providerId, `${monday}T00:00:00Z`, `${monday}T23:59:59Z`)).toHaveLength(4);

    // Block 11:00-12:00 local: one slot goes, three remain.
    await availability.addException(providerId, {
      onDate: monday,
      startMinute: 11 * 60,
      endMinute: 12 * 60,
      reason: 'school run',
    });
    expect(await availability.slotsFor(providerId, `${monday}T00:00:00Z`, `${monday}T23:59:59Z`)).toHaveLength(3);

    // A whole-day exception takes the rest.
    const nextWeek = nextMonday(2);
    await availability.addException(providerId, { onDate: nextWeek, reason: 'holiday' });
    expect(await availability.slotsFor(providerId, `${nextWeek}T00:00:00Z`, `${nextWeek}T23:59:59Z`)).toHaveLength(0);
  });

  it('keeps a buffer around a session already booked', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    await availability.addRule(providerId, {
      timezone: 'Asia/Kolkata',
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      startMinute: 10 * 60,
      endMinute: 14 * 60,
    });
    await availability.setPolicy(providerId, { bufferMinutes: 30 });

    const monday = nextMonday();
    const before = await availability.slotsFor(providerId, `${monday}T00:00:00Z`, `${monday}T23:59:59Z`);
    expect(before).toHaveLength(4);

    // Book the second slot. With a 30-minute buffer it also takes the
    // ones either side of it — back-to-back sessions with no gap is how
    // a day becomes unrunnable.
    await sessions.schedule({
      engagementId,
      seekerId,
      providerId,
      scheduledStart: before[1].start,
      scheduledEnd: before[1].end,
      timezone: 'Asia/Kolkata',
      enforceAvailability: true,
    });

    const after = await availability.slotsFor(providerId, `${monday}T00:00:00Z`, `${monday}T23:59:59Z`);
    expect(after.map((s) => s.start.toISOString())).not.toContain(before[1].start.toISOString());
    expect(after).toHaveLength(1);
  });

  it('refuses a booking that is not on an offered slot', async () => {
    const { seekerId, providerId } = await seedUsers(pool);
    const engagementId = await seedEngagement(pool, seekerId, providerId);
    await availability.addRule(providerId, {
      timezone: 'Asia/Kolkata',
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      startMinute: 10 * 60,
      endMinute: 12 * 60,
    });

    const monday = nextMonday();
    // 03:00 IST on the right day — inside no window anyone offered.
    const start = new Date(`${monday}T21:30:00Z`);
    await expect(
      sessions.schedule({
        engagementId,
        seekerId,
        providerId,
        scheduledStart: start,
        scheduledEnd: new Date(start.getTime() + 3_600_000),
        timezone: 'Asia/Kolkata',
        enforceAvailability: true,
      }),
    ).rejects.toMatchObject({ code: 'SESSION_SLOT_NOT_AVAILABLE' });
  });

  it('refuses a recurrence rule outside the supported subset', async () => {
    const { providerId } = await seedUsers(pool);
    // Plausible RFC 5545, and not what this engine implements. Refused
    // rather than partially understood: a rule quietly misread books
    // sessions at times the provider never offered.
    await expect(
      availability.addRule(providerId, {
        timezone: 'Asia/Kolkata',
        rrule: 'FREQ=MONTHLY;BYMONTHDAY=1',
        startMinute: 600,
        endMinute: 660,
      }),
    ).rejects.toMatchObject({ code: 'AVAILABILITY_RRULE_UNSUPPORTED' });
  });

  it('stops offering a rule once it has expired', async () => {
    const { providerId } = await seedUsers(pool);
    const monday = nextMonday();
    const dayBefore = new Date(`${monday}T00:00:00Z`);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);

    await availability.addRule(providerId, {
      timezone: 'Asia/Kolkata',
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      startMinute: 10 * 60,
      endMinute: 12 * 60,
      effectiveTo: dayBefore.toISOString().slice(0, 10),
    });

    expect(await availability.slotsFor(providerId, `${monday}T00:00:00Z`, `${monday}T23:59:59Z`)).toHaveLength(0);
  });
});
