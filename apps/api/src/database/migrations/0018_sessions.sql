-- ═══════════════════════════════════════════════════════════════════════
--  0018 — sessions
--
--  SPEC-PLATFORM.md §9. This migration covers the backend-modelable
--  core: booking against a fixed window, room provider reference,
--  consent, and status. It deliberately does NOT model RRULE
--  availability/exceptions/buffers/notice-periods (§9's "Booking on
--  RRULE availability" — that's a scheduling-UI-sized feature on its
--  own) — see TRACKER.md. A session here is booked directly against an
--  agreed start/end; the availability engine is future work.
--
--  Recording consent (CLAUDE.md #21): explicit opt-in from BOTH parties
--  at the start of EVERY session, not blanket Terms consent. A refusal
--  is still a row — consent_given = false — never an absent one, so
--  "did they refuse or were they never asked" is always answerable.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TYPE session_status AS ENUM ('scheduled', 'in_progress', 'completed', 'no_show', 'cancelled');

CREATE TABLE sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id    uuid NOT NULL REFERENCES engagements(id),
  scheduled_start  timestamptz NOT NULL,
  scheduled_end    timestamptz NOT NULL,
  -- IANA zone the parties booked in, alongside the UTC instants above —
  -- CLAUDE.md convention: never store a fixed offset.
  timezone         text NOT NULL,
  room_provider    text,             -- set once a room is actually created
  room_reference   text,
  -- Adaptive bitrate and the video<->audio_only switch itself are a
  -- client/SFU concern (CLAUDE.md #22 — required, not an enhancement);
  -- this column only records which mode the session is currently in.
  mode             text NOT NULL DEFAULT 'video' CHECK (mode IN ('video', 'audio_only')),
  recording_active boolean NOT NULL DEFAULT false,
  status           session_status NOT NULL DEFAULT 'scheduled',
  started_at       timestamptz,
  ended_at         timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (scheduled_end > scheduled_start)
);
CREATE INDEX ON sessions (engagement_id);

CREATE TRIGGER trg_touch_sessions BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE OR REPLACE FUNCTION check_session_transition() RETURNS trigger AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM (VALUES
      ('scheduled',   'in_progress'),
      ('scheduled',   'no_show'),
      ('scheduled',   'cancelled'),
      ('in_progress', 'completed')
    ) AS allowed(from_status, to_status)
    WHERE allowed.from_status = OLD.status::text AND allowed.to_status = NEW.status::text
  ) THEN
    RAISE EXCEPTION 'invalid session transition % -> %', OLD.status, NEW.status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_session_transition
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION check_session_transition();

-- session_participants already models N participants (schema hook for
-- Wave 2+ group sessions) even though every M5 flow uses exactly two.
CREATE TABLE session_participants (
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id),
  joined_at   timestamptz,
  left_at     timestamptz,
  PRIMARY KEY (session_id, user_id)
);

CREATE TABLE session_consents (
  session_id      uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id),
  consent_given   boolean NOT NULL,
  decided_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

COMMENT ON TABLE session_consents IS
  'One row per party per session, always — a refusal is consent_given =
   false, never a missing row. CLAUDE.md #21: refusal is logged and
   shifts evidentiary burden in a dispute; it must be distinguishable
   from "never asked."';

-- Recording cannot be switched on unless EVERY participant who has
-- decided has consented, AND every participant has in fact decided.
CREATE OR REPLACE FUNCTION check_recording_requires_full_consent() RETURNS trigger AS $$
DECLARE
  v_participant_count integer;
  v_consenting_count integer;
BEGIN
  IF NEW.recording_active = false OR OLD.recording_active = true THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_participant_count FROM session_participants WHERE session_id = NEW.id;
  SELECT count(*) INTO v_consenting_count
    FROM session_consents
   WHERE session_id = NEW.id AND consent_given = true;

  IF v_participant_count = 0 OR v_consenting_count < v_participant_count THEN
    RAISE EXCEPTION
      'session % cannot record: % of % participants have consented',
      NEW.id, v_consenting_count, v_participant_count
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recording_requires_consent
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION check_recording_requires_full_consent();

-- ─── Transcripts — stored separately from recording (§9: "cheaper and
-- more useful in disputes than video") ───

CREATE TABLE transcripts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES sessions(id),
  language     text NOT NULL,
  -- Placeholder for a real private-storage pointer, same caveat as
  -- submissions.content_ref (CLAUDE.md #29) — no object storage wired
  -- up in this environment.
  content_ref  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id)
);
