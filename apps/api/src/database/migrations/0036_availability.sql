-- Booking on real availability (SPEC-PLATFORM.md §9, TRACKER M5).
--
-- Until now a session was booked against whatever `scheduled_start` the
-- caller sent. Nothing knew when a provider actually works, nothing
-- stopped a booking at 3am, in the past, or on top of an existing
-- session, and nothing gave a provider a way to say "not that week".
--
-- §9 says "RRULE availability with exceptions, buffers, notice periods,
-- timezone-correct". What is implemented is a documented SUBSET of
-- RRULE — FREQ=WEEKLY with BYDAY — stored as the rule string so a
-- fuller parser is a swap rather than a migration. Anything outside the
-- subset is refused at the boundary with a clear error rather than
-- silently misinterpreted, which is the failure mode that matters: a
-- rule nobody notices is wrong books sessions at times the provider
-- never offered.

CREATE TABLE provider_availability_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id    uuid NOT NULL REFERENCES users(id),

  -- IANA name, never a fixed offset (CLAUDE.md — "Never store a fixed
  -- offset"). The whole point is that 18:00 means 18:00 to the provider
  -- through a DST change, and an offset cannot express that.
  timezone       text NOT NULL CHECK (length(trim(timezone)) > 0),

  -- The rule as authored. Subset: FREQ=WEEKLY;BYDAY=MO,WE,FR
  rrule          text NOT NULL CHECK (rrule ~ '^FREQ=WEEKLY;BYDAY=(SU|MO|TU|WE|TH|FR|SA)(,(SU|MO|TU|WE|TH|FR|SA))*$'),

  -- Minutes from local midnight. Stored decomposed as well as in the
  -- rule because slot generation is a range query, and parsing a string
  -- per candidate day inside SQL would be both slow and unreadable.
  start_minute   int NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440),
  end_minute     int NOT NULL CHECK (end_minute > 0 AND end_minute <= 1440),

  effective_from date NOT NULL DEFAULT current_date,
  effective_to   date,

  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT availability_window_is_forward CHECK (end_minute > start_minute),
  CONSTRAINT availability_period_is_forward CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX provider_availability_rules_idx ON provider_availability_rules (provider_id, effective_from);

-- "Not that day" / "not that afternoon". Separate from the rules
-- because an exception is a fact about one date, and editing the
-- recurring rule to carve out a holiday loses the rule.
CREATE TABLE provider_availability_exceptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  uuid NOT NULL REFERENCES users(id),
  on_date      date NOT NULL,
  -- Both null = the whole day is blocked.
  start_minute int CHECK (start_minute IS NULL OR (start_minute >= 0 AND start_minute < 1440)),
  end_minute   int CHECK (end_minute IS NULL OR (end_minute > 0 AND end_minute <= 1440)),
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT exception_window_is_whole_or_partial CHECK (
    (start_minute IS NULL AND end_minute IS NULL)
    OR (start_minute IS NOT NULL AND end_minute IS NOT NULL AND end_minute > start_minute)
  )
);
CREATE INDEX provider_availability_exceptions_idx ON provider_availability_exceptions (provider_id, on_date);

-- How a provider wants to be booked. One row per provider; defaults are
-- deliberately conservative — a provider who has never opened this
-- screen should not be bookable in ten minutes' time.
CREATE TABLE provider_booking_policy (
  provider_id        uuid PRIMARY KEY REFERENCES users(id),

  -- The gap a seeker cannot book inside. Protects the provider's day
  -- from a booking they will not see in time.
  min_notice_minutes int NOT NULL DEFAULT 720 CHECK (min_notice_minutes >= 0),

  -- Space either side of a session. Back-to-back sessions with no gap
  -- is how a day becomes unrunnable.
  buffer_minutes     int NOT NULL DEFAULT 15 CHECK (buffer_minutes >= 0),

  -- How far ahead the calendar opens.
  max_advance_days   int NOT NULL DEFAULT 60 CHECK (max_advance_days > 0),

  -- Slot length offered. Not the engagement's duration — that is agreed
  -- separately; this is the granularity of the grid.
  slot_minutes       int NOT NULL DEFAULT 60 CHECK (slot_minutes > 0 AND slot_minutes <= 480),

  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_touch_provider_booking_policy BEFORE UPDATE ON provider_booking_policy
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
