-- ═══════════════════════════════════════════════════════════════════════
--  0015 — the credential pipeline and per-skill tiers
--
--  SPEC-PLATFORM.md §11: "submit -> automated checks -> human review ->
--  tier assignment -> periodic recheck." The automated check result is
--  recorded but never bypasses human review — it is a signal the
--  reviewer sees, not a decision. Tier assignment always happens on
--  human sign-off, writing into provider_skills, never automatically.
--
--  §5: "Providers are verified against skills, not categories." A
--  credential is evidence for one or more specific skills (which skills
--  the provider claims it proves), not for a whole credential type in
--  the abstract.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TYPE provider_credential_status AS ENUM ('submitted', 'under_review', 'verified', 'rejected');

CREATE TABLE provider_credentials (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id         uuid NOT NULL REFERENCES users(id),
  credential_type_id  uuid NOT NULL REFERENCES credential_types(id),
  -- Which domain's verifier config applies (e.g. which PSC's result
  -- list) — credential_types are family-level, but the source is per
  -- domain (SPEC-PLATFORM.md §11).
  domain_code         text NOT NULL REFERENCES domains(code),
  -- Whatever the provider submitted as evidence: roll number, year,
  -- claimed name, a document reference. Verifier-specific shape.
  verifier_data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- {verifier, passed, detail} — advisory only, never a decision.
  automated_check_result jsonb,
  status              provider_credential_status NOT NULL DEFAULT 'submitted',
  reviewed_by         uuid REFERENCES users(id),
  reviewed_at         timestamptz,
  decision_note       text NOT NULL DEFAULT '',
  submitted_at        timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (status NOT IN ('verified', 'rejected') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);

CREATE INDEX ON provider_credentials (provider_id);
CREATE INDEX ON provider_credentials (status) WHERE status = 'under_review';

CREATE TRIGGER trg_touch_provider_credentials BEFORE UPDATE ON provider_credentials
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Which skills this credential is submitted as evidence for.
CREATE TABLE provider_credential_skills (
  credential_id  uuid NOT NULL REFERENCES provider_credentials(id) ON DELETE CASCADE,
  skill_id       uuid NOT NULL REFERENCES skills(id),
  PRIMARY KEY (credential_id, skill_id)
);

CREATE OR REPLACE FUNCTION check_provider_credential_transition() RETURNS trigger AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM (VALUES
      ('submitted',    'under_review'),
      ('under_review', 'verified'),
      ('under_review', 'rejected')
    ) AS allowed(from_status, to_status)
    WHERE allowed.from_status = OLD.status::text AND allowed.to_status = NEW.status::text
  ) THEN
    RAISE EXCEPTION 'invalid provider credential transition % -> %', OLD.status, NEW.status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.status IN ('verified', 'rejected') AND (NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL) THEN
    RAISE EXCEPTION 'a % decision must record who reviewed it and when', NEW.status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_provider_credential_transition
  BEFORE UPDATE ON provider_credentials
  FOR EACH ROW EXECUTE FUNCTION check_provider_credential_transition();

-- ─── Per-skill tiers (SPEC-PLATFORM.md §5) ───

CREATE TABLE provider_skills (
  provider_id    uuid NOT NULL REFERENCES users(id),
  skill_id       uuid NOT NULL REFERENCES skills(id),
  tier           mentor_tier NOT NULL DEFAULT 't0',
  verified_at    timestamptz,
  verified_by    uuid REFERENCES users(id),
  -- Which credential established this tier. Auditable — never set tier
  -- without a credential behind it.
  credential_id  uuid REFERENCES provider_credentials(id),
  active         boolean NOT NULL DEFAULT true,
  PRIMARY KEY (provider_id, skill_id)
);
CREATE INDEX ON provider_skills (skill_id, tier) WHERE active;

COMMENT ON TABLE provider_skills IS
  'Tier is PER SKILL, never global (CLAUDE.md hard rule). A provider may
   be t3 on one skill and unverified on another. This is the table that
   makes "one verification, many domains" real: a skill row here matches
   every domain whose category maps to that skill_id via category_skills.';

-- ─── Working languages (CLAUDE.md hard rule #19: language is a
-- first-class matching dimension everywhere) ───

CREATE TABLE provider_languages (
  provider_id   uuid NOT NULL REFERENCES users(id),
  lang_code     text NOT NULL,
  can_evaluate  boolean NOT NULL DEFAULT true,
  PRIMARY KEY (provider_id, lang_code)
);
