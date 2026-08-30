-- The audit log.
--
-- CLAUDE.md hard rule #14 names it directly — "`audit_log` and ledger
-- tables are append-only" — and it did not exist (TRACKER D46). Nothing
-- recorded who changed a fee schedule, published a manifest, ruled a
-- dispute or decided a credential. Those are exactly the actions a
-- dispute or a regulator asks about later, and the ledger's own history
-- covers none of them: it records that money moved, not who decided it
-- should.
CREATE TABLE IF NOT EXISTS audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Null means the platform itself acted (a relay, a scheduled job).
  -- Distinguishable from "we did not record it", which is the state this
  -- table exists to make impossible.
  actor_id     uuid REFERENCES users(id),
  actor_role   text,

  -- What was done, in past tense and stable: switched on, never parsed
  -- for meaning by anything but a person reading the log.
  action       text NOT NULL CHECK (length(trim(action)) > 0),

  -- What it was done to. Deliberately not a foreign key: the log must
  -- outlive the row it describes, and a cascade that deleted history
  -- when a record was removed would defeat the point.
  subject_type text NOT NULL CHECK (length(trim(subject_type)) > 0),
  subject_id   uuid,

  -- The before/after or the reason. Never credentials, never a full
  -- phone or account number — the log is read by more people than the
  -- record it describes.
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Truncated at the API boundary already; stored for correlating a
  -- burst of actions, not for identifying a person.
  ip_prefix    text,

  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_subject_idx ON audit_log (subject_type, subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action, created_at DESC);

-- Append-only, same as the ledger. A log that can be edited is not
-- evidence of anything.
DROP TRIGGER IF EXISTS trg_audit_log_append_only ON audit_log;
CREATE TRIGGER trg_audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
