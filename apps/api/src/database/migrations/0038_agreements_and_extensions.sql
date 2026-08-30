-- Agreements, recorded properly — and the paid session extension that
-- needs one (SPEC-PLATFORM.md §9).
--
-- ── Why an `agreements` table ────────────────────────────────────────
--
-- The platform asks people to agree to things in four places, and only
-- two of them were recorded in a way that survives being asked about:
--
--   * agenda lock       — hashed and immutable. The model to follow.
--   * recording consent — per session, per person, refusal distinguishable.
--   * 18+ attestation   — a bare timestamp. No record of WHAT was attested.
--   * terms of service  — never shown, never recorded, did not exist.
--
-- A boolean saying somebody agreed is worth nothing in a dispute if the
-- wording it referred to has since been edited. So this table stores the
-- exact text that was on the screen, its hash, its version, and the
-- language it was read in. Append-only, like the ledger and the audit
-- log: a record of consent that can be rewritten is not a record.
CREATE TABLE agreements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id),

  -- Which document. A stable code from the family pack, not an enum
  -- here: a family with an extra document must not need a migration.
  document_code  text NOT NULL CHECK (length(trim(document_code)) > 0),
  document_version text NOT NULL CHECK (length(trim(document_version)) > 0),

  -- The exact words that were on the screen. Stored in full, not by
  -- reference: "you accepted v3" is worthless if v3 was later edited,
  -- and a hash alone cannot be read back to a person.
  text_shown     text NOT NULL CHECK (length(trim(text_shown)) > 0),
  text_hash      text NOT NULL CHECK (length(text_hash) = 64),

  -- The language it was read in. Which is the language that binds
  -- (CLAUDE.md #20 — the original is authoritative, translations are
  -- convenience), so it is not decoration.
  lang           text NOT NULL,

  -- What it was about: a session, an engagement. Null for an
  -- account-level agreement like the terms or the 18+ attestation.
  -- Deliberately not a foreign key, for the same reason as `audit_log`:
  -- the agreement must outlive the thing it was about.
  subject_type   text,
  subject_id     uuid,

  ip_prefix      text,
  accepted_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agreements_user_idx ON agreements (user_id, accepted_at DESC);
CREATE INDEX agreements_document_idx ON agreements (document_code, accepted_at DESC);
CREATE INDEX agreements_subject_idx ON agreements (subject_type, subject_id);

DROP TRIGGER IF EXISTS trg_agreements_append_only ON agreements;
CREATE TRIGGER trg_agreements_append_only
  BEFORE UPDATE OR DELETE ON agreements
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- ── Paid session extensions ──────────────────────────────────────────
--
-- Charged SEPARATELY from the engagement, as its own transaction with
-- its own escrow — a product decision, taken because it can then be
-- refunded on its own and reasoned about on its own.
--
-- The seeker must accept an agreement before it is charged. What that
-- agreement SAYS is family pack data (`agreementDocuments`), not text in
-- this schema or in core code, so the wording is a business and legal
-- decision that does not need a deploy to change. See TRACKER.md — the
-- seeded wording has not been through legal review.
CREATE TYPE session_extension_status AS ENUM (
  'proposed',   -- one party has offered it
  'accepted',   -- the seeker agreed and the money is held
  'declined',
  'settled',    -- the session ended; the money moved
  'refunded'
);

CREATE TABLE session_extensions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid NOT NULL REFERENCES sessions(id),

  proposed_by    uuid NOT NULL REFERENCES users(id),
  minutes        int NOT NULL CHECK (minutes > 0 AND minutes <= 120),
  currency       text NOT NULL,
  amount_paise   bigint NOT NULL CHECK (amount_paise > 0),

  status         session_extension_status NOT NULL DEFAULT 'proposed',

  -- The agreement the seeker accepted. Required the moment it is
  -- accepted, by the CHECK below — an extension charged without a
  -- recorded agreement is exactly what this feature exists to prevent.
  agreement_id   uuid REFERENCES agreements(id),
  accepted_by    uuid REFERENCES users(id),
  accepted_at    timestamptz,

  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT extension_acceptance_is_complete CHECK (
    (status = 'proposed' OR status = 'declined')
    OR (agreement_id IS NOT NULL AND accepted_by IS NOT NULL AND accepted_at IS NOT NULL)
  )
);
CREATE INDEX session_extensions_idx ON session_extensions (session_id, created_at);

-- One live proposal per session at a time. Two open offers would make
-- "accept" ambiguous about which price was agreed.
CREATE UNIQUE INDEX session_extensions_one_open
  ON session_extensions (session_id)
  WHERE status = 'proposed';

-- ── Escrow gains a second kind ───────────────────────────────────────
--
-- An extension is held and released exactly like the engagement it
-- extends — same ledger accounts, same fee treatment, same transition
-- trigger — so it reuses `escrows` rather than growing a parallel money
-- system that would need its own reconciliation.
--
-- The "one escrow per engagement" rule is preserved exactly, as a
-- partial unique index: one PRIMARY escrow per engagement, plus any
-- number of extension escrows beside it.
ALTER TABLE escrows ADD COLUMN session_extension_id uuid REFERENCES session_extensions(id);
ALTER TABLE escrows DROP CONSTRAINT escrows_engagement_id_key;
CREATE UNIQUE INDEX escrows_one_primary_per_engagement
  ON escrows (engagement_id)
  WHERE session_extension_id IS NULL;
CREATE UNIQUE INDEX escrows_one_per_extension
  ON escrows (session_extension_id)
  WHERE session_extension_id IS NOT NULL;

COMMENT ON COLUMN escrows.session_extension_id IS
  'Null for the engagement''s own escrow. Set for a paid session extension,
   which is charged as its own transaction so it can be refunded on its own.';
