-- ═══════════════════════════════════════════════════════════════════════
--  0050 — training, and the record that someone actually did it
--
--  SPEC-PLATFORM §8.2 puts a training module and quiz in the onboarding
--  funnel and names what it covers: platform rules, the refund policy,
--  and distress escalation. The last of those is not administrative.
--  CLAUDE.md #24 and #25 are explicit that competitive-exam preparation
--  runs through a population with a documented mental-health crisis, and
--  that distress-flagged content is routed to a human who knows what to
--  do with it. A provider who has never been told what that path IS will
--  meet it unprepared, in a session, in real time.
--
--  So this is a duty-of-care record, not a compliance checkbox. What it
--  has to answer later is "was this person told, and when".
--
--  ── Why the manifest version is stored ──────────────────────────────
--
--  Training content is family data and will be revised — a helpline
--  number changes, a rule changes. A completion recorded without the
--  version it was taken against cannot answer "did they read the CURRENT
--  guidance", which is the only version of the question that matters
--  after a revision. Storing it lets a family require a retake by
--  publishing new content, without invalidating the historical record of
--  what someone was actually shown.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE provider_training_completions (
  provider_id      uuid NOT NULL REFERENCES users(id),
  family_code      text NOT NULL REFERENCES domain_families(code),

  -- Family vocabulary. Core never switches on a module code (#1).
  module_code      text NOT NULL CHECK (length(trim(module_code)) > 0),

  -- The manifest version the person was shown. See above.
  manifest_version text NOT NULL,

  -- How many they got right out of how many asked. Kept because "passed"
  -- alone loses the difference between someone who scraped through and
  -- someone who knew it, and a later incident review will want that.
  score            integer NOT NULL CHECK (score >= 0),
  out_of           integer NOT NULL CHECK (out_of > 0),

  completed_at     timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (provider_id, family_code, module_code, manifest_version)
);

CREATE INDEX provider_training_provider_idx
  ON provider_training_completions (provider_id, family_code);

COMMENT ON TABLE provider_training_completions IS
  'Who completed which training module, at which manifest version, and
   how well. A duty-of-care record (CLAUDE.md #24/#25) — it exists to
   answer "was this person told, and when".';

-- A completion is evidence. Same rule as audit_log and the ledger (#14):
-- a record that can be edited after an incident is not a record.
CREATE OR REPLACE FUNCTION refuse_training_rewrite() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'provider_training_completions is append-only'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_training_append_only
  BEFORE UPDATE OR DELETE ON provider_training_completions
  FOR EACH ROW EXECUTE FUNCTION refuse_training_rewrite();
