-- ═══════════════════════════════════════════════════════════════════════
--  0053 — a recording is a thing that ran, not a flag
--
--  Until now `sessions.recording_active` was the whole of recording: a
--  boolean the consent trigger guarded, with nothing behind it. That was
--  honest while the room was a sandbox. With a real vendor it is not
--  enough, for three reasons:
--
--  1. Stopping needs the vendor's handle. A cloud recorder is stopped by
--     reference, and a reference kept only in memory is lost on the next
--     deploy — leaving a recorder running after someone withdrew consent,
--     which is the exact breach CLAUDE.md #21 exists to prevent.
--  2. Evidence needs to say where it went. A dispute reviewer asking for
--     "the recording" needs the storage prefix and the file list the
--     vendor reported, not a boolean that was once true.
--  3. A session may be recorded, stopped, and recorded again. Each run is
--     its own row; the retention clock on `sessions` still starts at the
--     first (0037).
--
--  ── What the database enforces ─────────────────────────────────────
--
--  * A run cannot BEGIN without every participant's consent — the same
--    rule the flag trigger enforces, applied at the row that actually
--    represents a recorder. Two guards on one rule is deliberate: the
--    flag and the row are written in one transaction, and either one
--    alone could be bypassed by a future code path that forgot the other.
--  * At most one open run per session.
--  * A run's identity is immutable and it closes exactly once. Reopening
--    a stopped run would rewrite what the evidence says happened.
--
--  Vendor-specific fields live in `provider_reference` (jsonb) so core
--  DDL names no vendor (hard rule #1 applies to vendors for the same
--  reason it applies to domains).
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE session_recordings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid NOT NULL REFERENCES sessions(id),
  provider           text NOT NULL,
  provider_reference jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_prefix     text,
  started_at         timestamptz NOT NULL DEFAULT now(),
  stopped_at         timestamptz,
  -- What the vendor reported on stop. Opaque to core; read by a reviewer.
  files              jsonb,
  -- Set when the vendor could not be told to stop cleanly. The run is
  -- still closed if the vendor confirmed it had already exited.
  stop_note          text
);

CREATE UNIQUE INDEX session_recordings_one_open
  ON session_recordings (session_id) WHERE stopped_at IS NULL;

CREATE INDEX session_recordings_session ON session_recordings (session_id, started_at);

CREATE OR REPLACE FUNCTION check_recording_run_consent() RETURNS trigger AS $$
DECLARE
  v_participant_count int;
  v_consenting_count  int;
BEGIN
  SELECT count(*) INTO v_participant_count
    FROM session_participants WHERE session_id = NEW.session_id;
  SELECT count(*) INTO v_consenting_count
    FROM session_consents WHERE session_id = NEW.session_id AND consent_given;
  IF v_participant_count = 0 OR v_consenting_count < v_participant_count THEN
    RAISE EXCEPTION
      'session % cannot start a recording: % of % participants consented',
      NEW.session_id, v_consenting_count, v_participant_count
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recording_run_requires_consent
  BEFORE INSERT ON session_recordings
  FOR EACH ROW EXECUTE FUNCTION check_recording_run_consent();

CREATE OR REPLACE FUNCTION check_recording_run_update() RETURNS trigger AS $$
BEGIN
  IF NEW.session_id <> OLD.session_id
     OR NEW.provider <> OLD.provider
     OR NEW.provider_reference <> OLD.provider_reference
     OR NEW.started_at <> OLD.started_at
     OR NEW.storage_prefix IS DISTINCT FROM OLD.storage_prefix THEN
    RAISE EXCEPTION 'a recording run''s identity is immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.stopped_at IS NOT NULL THEN
    RAISE EXCEPTION 'recording run % is already stopped', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recording_run_update
  BEFORE UPDATE ON session_recordings
  FOR EACH ROW EXECUTE FUNCTION check_recording_run_update();

-- Deleting a run would erase the fact that a recording was made. The
-- FILES may be deleted when retention ends (0037); the row that says they
-- existed may not.
CREATE OR REPLACE FUNCTION refuse_recording_run_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'recording runs are never deleted'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recording_run_no_delete
  BEFORE DELETE ON session_recordings
  FOR EACH ROW EXECUTE FUNCTION refuse_recording_run_delete();
