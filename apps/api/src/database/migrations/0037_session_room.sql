-- The things that happen inside a session (SPEC-PLATFORM.md §9).
--
-- §9 lists what a session must support. Some of it is irreducibly
-- client-and-SFU work — adaptive bitrate, the network-quality
-- indicator, screen share, live translated subtitles — and none of that
-- is faked here. What IS backend-modelable, and was missing entirely:
-- in-call chat, file share, the session timer, reconnection credit, and
-- a retention rule for recordings.

-- In-call chat.
--
-- Append-only, like reviews and the ledger. A session's chat is
-- evidence in a dispute — the place where "they said they would send it
-- afterwards" either exists or does not — and a message that can be
-- edited afterwards is evidence of nothing.
CREATE TABLE session_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id),
  sender_id  uuid NOT NULL REFERENCES users(id),

  -- Original language is authoritative and never overwritten by a
  -- translation (CLAUDE.md #20), same as an agenda.
  body       text NOT NULL CHECK (length(trim(body)) > 0),
  body_lang  text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX session_messages_idx ON session_messages (session_id, created_at);

DROP TRIGGER IF EXISTS trg_session_messages_append_only ON session_messages;
CREATE TRIGGER trg_session_messages_append_only
  BEFORE UPDATE OR DELETE ON session_messages
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- Files handed over during a session.
--
-- The file itself lives in `attachments` behind a grant (#29) — this
-- records that it was shared here, and with whom. Sharing is what
-- creates the grant, so a file mentioned in a session is a file the
-- other party can actually open.
CREATE TABLE session_shared_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES sessions(id),
  attachment_id uuid NOT NULL REFERENCES attachments(id),
  shared_by     uuid NOT NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, attachment_id)
);
CREATE INDEX session_shared_files_idx ON session_shared_files (session_id, created_at);

-- Reconnection with session-time credit (§9).
--
-- A dropped connection is not the seeker's fault and usually not the
-- provider's. Recording each interruption lets the time lost be credited
-- rather than argued about — and CLAUDE.md #23 already says a
-- platform-side failure must never cost the provider.
CREATE TABLE session_interruptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES sessions(id),
  user_id     uuid NOT NULL REFERENCES users(id),
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,

  CONSTRAINT interruption_is_forward CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX session_interruptions_idx ON session_interruptions (session_id, started_at);

-- Only one open interruption per person per session: a second "I
-- dropped" while already dropped would double-count the credit.
CREATE UNIQUE INDEX session_interruptions_one_open
  ON session_interruptions (session_id, user_id)
  WHERE ended_at IS NULL;

-- The timer, and what happens to a recording afterwards.
ALTER TABLE sessions
  -- When the "five minutes left" warning was raised. Null = not yet.
  -- Stored rather than computed so it is raised exactly once, and so a
  -- dispute can show it was raised at all.
  ADD COLUMN warning_raised_at timestamptz,
  -- Credited from interruptions, in seconds. Derived from
  -- `session_interruptions` and cached here only at end-of-session,
  -- when the interruptions are final.
  ADD COLUMN credited_seconds int NOT NULL DEFAULT 0 CHECK (credited_seconds >= 0),
  -- §9: "Encrypted, region-locked, 90-day retention extended only under
  -- legal hold." The encryption and region are storage configuration;
  -- the retention decision is data, and it lives here.
  ADD COLUMN recording_retention_until timestamptz,
  ADD COLUMN recording_legal_hold boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN sessions.recording_retention_until IS
  'When the recording may be deleted. Set when recording first starts.
   A legal hold suspends deletion regardless of this date — which is why
   the two are separate columns rather than one nullable date.';
