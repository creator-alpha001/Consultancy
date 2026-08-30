-- Private uploads (CLAUDE.md #29, TRACKER "no object storage").
--
-- "Uploads and documents are private: `attachment_grants` only, signed
-- URLs with 5-minute expiry, watermarked with viewer identity." None of
-- that existed. `submissions.content_ref` and a credential's
-- `documentRef` were free text standing in for a storage pointer, so
-- the most sensitive material on the platform — someone's answer script,
-- someone's identity document — had no access model at all.
--
-- The rule this table exists to make true is #30's companion: a
-- verification document is never public, and who looked at one is a
-- question that gets asked later.

CREATE TABLE attachments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who uploaded it. Always has access to their own; everyone else needs
  -- a grant.
  owner_id          uuid NOT NULL REFERENCES users(id),

  -- The object-storage key. Opaque and never guessable from the id: a
  -- key that can be derived from a row id is a key that leaks when the
  -- id does.
  storage_key       text NOT NULL UNIQUE,

  content_type      text NOT NULL CHECK (length(trim(content_type)) > 0),
  byte_size         bigint NOT NULL CHECK (byte_size > 0),

  -- Content hash, so the same document uploaded twice is provably the
  -- same document — and so a swapped file after a decision is provable.
  sha256            text NOT NULL CHECK (length(sha256) = 64),

  -- What the uploader called it. Shown back to them; never used as the
  -- storage key.
  original_filename text,

  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attachments_owner_idx ON attachments (owner_id, created_at DESC);

-- The whole access model. No grant, no access — there is no "public"
-- flag here on purpose, because #29 and #30 leave no case for one.
CREATE TABLE attachment_grants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id uuid NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  grantee_id    uuid NOT NULL REFERENCES users(id),

  -- Null means the platform granted it as part of a workflow (a
  -- credential going to whichever reviewer picks it up), rather than a
  -- person choosing to share.
  granted_by    uuid REFERENCES users(id),

  -- Why this person can see this. Read back during a dispute, so it is
  -- required rather than nullable.
  reason        text NOT NULL CHECK (length(trim(reason)) > 0),

  -- Null = until revoked. A grant tied to a piece of work should carry
  -- one; a grant to the counterparty of an engagement usually does not.
  expires_at    timestamptz,
  revoked_at    timestamptz,

  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Granting to the owner is meaningless rather than dangerous — they
-- already have access — and the owner is a join away, which a CHECK
-- cannot follow. Refused at the service instead.

-- One live grant per person per attachment. A second row would make
-- revocation a question of "which one", which is the wrong question to
-- have to ask about access to someone's identity document.
CREATE UNIQUE INDEX attachment_grants_one_live
  ON attachment_grants (attachment_id, grantee_id)
  WHERE revoked_at IS NULL;

CREATE INDEX attachment_grants_grantee_idx ON attachment_grants (grantee_id) WHERE revoked_at IS NULL;

-- Submissions and evaluations point at a real attachment now. Nullable
-- because the existing text refs stay for rows created before this
-- existed — the old column is not rewritten, and nothing pretends the
-- historical placeholders were ever real storage pointers.
ALTER TABLE submissions  ADD COLUMN attachment_id uuid REFERENCES attachments(id);
ALTER TABLE evaluations  ADD COLUMN annotated_attachment_id uuid REFERENCES attachments(id);
