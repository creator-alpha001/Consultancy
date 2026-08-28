-- ═══════════════════════════════════════════════════════════════════════
--  0023 — disputes: evidence, rulings, appeals
--
--  M7's bar (SPEC-PLATFORM.md §18) is "a dispute is raised, ruled,
--  appealed, settled — **no code change**." That phrase is the design
--  constraint: the tier ladder is family-manifest data (policy.
--  disputeTiers), and nothing in this schema or in `disputes/` names a
--  tier, knows how many there are, or knows which one is final. Core
--  walks the ladder the pack supplies.
--
--  Two CLAUDE.md rules become triggers here:
--    #18 "AI never rules on a dispute" — a ruling's author must be a
--        human user holding the admin role. There is no system actor
--        that can satisfy this, by construction.
--    #20 "the original-language text is authoritative in disputes" — the
--        dispute body and every piece of evidence store their original
--        text and its language, and are append-only, so a translation
--        can never quietly replace the text that was actually written.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TYPE dispute_status AS ENUM (
  'open',          -- raised, awaiting a ruling at the current tier
  'ruled',         -- a ruling exists at the current tier; appealable, or settleable
  'appealed',      -- escalated to the next tier in the pack's ladder; awaiting a ruling there
  'settled',       -- a ruling has been carried out against the escrow — terminal
  'withdrawn'      -- the raiser stood down before any ruling — terminal
);

CREATE TYPE dispute_outcome AS ENUM (
  'release_to_provider',
  'refund_to_seeker',
  'split'
);

CREATE TABLE disputes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id  uuid NOT NULL REFERENCES engagements(id),
  raised_by      uuid NOT NULL REFERENCES users(id),
  -- Free text, not an enum: the set of reasons a family recognises is
  -- pack data (the exam family's "evaluation not returned" is not a
  -- music school's "tutor did not attend"). Core never switches on it.
  reason_code    text NOT NULL,
  body_original  text NOT NULL,
  body_lang      text NOT NULL,
  -- Which rung of policy.disputeTiers this dispute currently sits on.
  -- An integer, not an enum — core does not know the ladder.
  tier           integer NOT NULL DEFAULT 1 CHECK (tier >= 1),
  status         dispute_status NOT NULL DEFAULT 'open',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- One dispute per engagement. A second grievance about the same
  -- engagement is evidence on the existing dispute, not a new one.
  UNIQUE (engagement_id)
);

CREATE TRIGGER trg_touch_disputes BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE OR REPLACE FUNCTION check_dispute_transition() RETURNS trigger AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM (VALUES
      ('open',     'ruled'),
      ('open',     'withdrawn'),
      ('ruled',    'appealed'),
      ('ruled',    'settled'),
      ('appealed', 'ruled')
    ) AS allowed(from_status, to_status)
    WHERE allowed.from_status = OLD.status::text
      AND allowed.to_status = NEW.status::text
  ) THEN
    RAISE EXCEPTION 'invalid dispute transition % -> %', OLD.status, NEW.status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_dispute_transition
  BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION check_dispute_transition();

-- ─── Evidence ───

CREATE TABLE dispute_evidence (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id        uuid NOT NULL REFERENCES disputes(id),
  -- 'agenda' | 'assessment' | 'session_consent' | 'submission' | 'note'.
  -- Text, not an enum: what counts as evidence differs by engagement
  -- type and family, and new kinds must not need a migration.
  kind              text NOT NULL,
  ref_type          text,
  ref_id            uuid,
  -- The authoritative copy (#20). For agenda evidence this is the
  -- agenda's own original-language text, copied at packet-assembly time
  -- so a later change order cannot alter what the adjudicator saw.
  content_original  text NOT NULL,
  content_lang      text NOT NULL,
  added_by          uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dispute_evidence_dispute_idx ON dispute_evidence (dispute_id);

CREATE TRIGGER trg_dispute_evidence_append_only
  BEFORE UPDATE OR DELETE ON dispute_evidence
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- ─── Rulings ───

CREATE TABLE dispute_rulings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id           uuid NOT NULL REFERENCES disputes(id),
  tier                 integer NOT NULL CHECK (tier >= 1),
  -- Hard rule #18. Enforced as a trigger below, not just a comment:
  -- this column must name a human holding the admin role.
  ruled_by             uuid NOT NULL REFERENCES users(id),
  outcome              dispute_outcome NOT NULL,
  -- Set only for 'split', and only strictly inside (0, escrow amount) —
  -- a "split" of nothing or of everything is a release or a refund, and
  -- must be recorded as the outcome it actually is.
  seeker_refund_paise  bigint CHECK (seeker_refund_paise IS NULL OR seeker_refund_paise > 0),
  rationale            text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  -- One ruling per tier. An appeal produces a ruling at the NEXT tier,
  -- never a second ruling at the same one.
  UNIQUE (dispute_id, tier),
  CHECK (
    (outcome = 'split' AND seeker_refund_paise IS NOT NULL) OR
    (outcome <> 'split' AND seeker_refund_paise IS NULL)
  )
);

CREATE TRIGGER trg_dispute_rulings_append_only
  BEFORE UPDATE OR DELETE ON dispute_rulings
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- CLAUDE.md #18: "AI never writes a provider's assessment and never
-- rules on a dispute. It surfaces patterns and drafts suggestions a
-- human accepts or rejects." The accepting human is `ruled_by`, and this
-- is where that stops being a promise.
CREATE OR REPLACE FUNCTION check_ruling_author_is_human_admin() RETURNS trigger AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM users WHERE id = NEW.ruled_by;

  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION
      'dispute ruling must be made by a human admin: user % has role %',
      NEW.ruled_by, coalesce(v_role, 'none')
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ruling_author_is_human_admin
  BEFORE INSERT ON dispute_rulings
  FOR EACH ROW EXECUTE FUNCTION check_ruling_author_is_human_admin();

-- A split must actually split: strictly more than nothing, strictly less
-- than the whole escrow. Checked against the engagement's real escrow,
-- so a ruling can never award more money than is being held.
CREATE OR REPLACE FUNCTION check_split_ruling_within_escrow() RETURNS trigger AS $$
DECLARE
  v_amount_paise bigint;
BEGIN
  IF NEW.outcome <> 'split' THEN
    RETURN NEW;
  END IF;

  SELECT e.amount_paise INTO v_amount_paise
    FROM escrows e
    JOIN disputes d ON d.engagement_id = e.engagement_id
   WHERE d.id = NEW.dispute_id;

  IF v_amount_paise IS NULL THEN
    RAISE EXCEPTION 'dispute % has no escrow to split', NEW.dispute_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.seeker_refund_paise >= v_amount_paise THEN
    RAISE EXCEPTION
      'split ruling on dispute % awards % of an escrow holding % — a full award is a refund, not a split',
      NEW.dispute_id, NEW.seeker_refund_paise, v_amount_paise
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_split_ruling_within_escrow
  BEFORE INSERT ON dispute_rulings
  FOR EACH ROW EXECUTE FUNCTION check_split_ruling_within_escrow();

-- ─── Appeals ───

CREATE TABLE dispute_appeals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id     uuid NOT NULL REFERENCES disputes(id),
  ruling_id      uuid NOT NULL REFERENCES dispute_rulings(id),
  appealed_by    uuid NOT NULL REFERENCES users(id),
  from_tier      integer NOT NULL CHECK (from_tier >= 1),
  to_tier        integer NOT NULL CHECK (to_tier >= 2),
  body_original  text NOT NULL,
  body_lang      text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- One appeal per ruling: you appeal a decision once, to the next rung.
  UNIQUE (ruling_id),
  CHECK (to_tier > from_tier)
);

CREATE TRIGGER trg_dispute_appeals_append_only
  BEFORE UPDATE OR DELETE ON dispute_appeals
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- Only a party to the engagement may appeal its dispute. (Which rung is
-- final, and who adjudicates it, is pack policy — read by `disputes/`,
-- deliberately unknown here.)
CREATE OR REPLACE FUNCTION check_appeal_by_engagement_party() RETURNS trigger AS $$
DECLARE
  v_seeker_id uuid;
  v_provider_id uuid;
BEGIN
  SELECT e.seeker_id, e.provider_id INTO v_seeker_id, v_provider_id
    FROM engagements e
    JOIN disputes d ON d.engagement_id = e.id
   WHERE d.id = NEW.dispute_id;

  IF NEW.appealed_by NOT IN (v_seeker_id, v_provider_id) THEN
    RAISE EXCEPTION
      'user % is not a party to dispute % and cannot appeal it',
      NEW.appealed_by, NEW.dispute_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_appeal_by_engagement_party
  BEFORE INSERT ON dispute_appeals
  FOR EACH ROW EXECUTE FUNCTION check_appeal_by_engagement_party();
