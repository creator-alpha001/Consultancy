-- ═══════════════════════════════════════════════════════════════════════
--  0010 — the real engagement lifecycle
--
--  Upgrades the M1 stub (`status text`) to a real state machine. This is
--  where CLAUDE.md hard rule #12 stops being a comment and becomes a
--  trigger: "No engagement enters a working state without escrow held
--  AND agenda locked. The DB enforces it; do not catch and ignore."
--
--  Two triggers do the enforcing:
--    - a guard on `engagements`: entering 'working' without a locked
--      agenda AND a held escrow raises, unconditionally, regardless of
--      caller.
--    - reactive promotion: whichever of "agenda locked" / "escrow held"
--      happens second calls the same guarded transition. Locking an
--      agenda before escrow exists must still succeed — only the
--      *promotion attempt* is conditional, never the precondition check.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TYPE engagement_status AS ENUM (
  'draft',       -- being set up: seeker + provider + terms, agenda not yet locked, no escrow
  'agreed',      -- terms fixed; waiting on agenda lock and/or escrow hold
  'working',     -- BOTH preconditions met — the only state work may happen in
  'delivered',   -- seeker has submitted
  'assessed',    -- provider has returned a complete evaluation
  'completed',   -- escrow released
  'disputed',    -- frozen pending a ruling (disputes/, M7)
  'cancelled',   -- ended before any money moved
  'refunded'     -- ended with escrow returned to the seeker
);

-- Drop the M1 stub default so a bare cast can't silently invent a status
-- the enum doesn't have.
ALTER TABLE engagements ALTER COLUMN status DROP DEFAULT;
ALTER TABLE engagements
  ALTER COLUMN status TYPE engagement_status USING status::engagement_status;
ALTER TABLE engagements ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE engagements ADD COLUMN domain_code   text REFERENCES domains(code);
ALTER TABLE engagements ADD COLUMN category_id   uuid REFERENCES categories(id);
ALTER TABLE engagements ADD COLUMN engagement_type text NOT NULL DEFAULT 'document_review';
ALTER TABLE engagements ADD COLUMN amount_paise  bigint CHECK (amount_paise > 0);
ALTER TABLE engagements ADD COLUMN language      text;

COMMENT ON COLUMN engagements.engagement_type IS
  'document_review | live_session | written_qa | async_task. Free text,
   not an FK — the set of valid values is family data (manifest
   engagementTypes), not a core enum. M3 only implements the
   document_review path end to end; the others get their type-specific
   machinery (sessions/, board/) in later milestones.';

CREATE OR REPLACE FUNCTION check_engagement_transition() RETURNS trigger AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM (VALUES
      ('draft',     'agreed'),
      ('draft',     'cancelled'),
      ('agreed',    'working'),
      ('agreed',    'cancelled'),
      ('working',   'delivered'),
      ('working',   'disputed'),
      ('working',   'refunded'),
      ('delivered', 'assessed'),
      ('delivered', 'disputed'),
      ('delivered', 'refunded'),
      ('assessed',  'completed'),
      ('assessed',  'disputed'),
      ('assessed',  'refunded'),
      ('disputed',  'completed'),
      ('disputed',  'refunded')
    ) AS allowed(from_status, to_status)
    WHERE allowed.from_status = OLD.status::text
      AND allowed.to_status = NEW.status::text
  ) THEN
    RAISE EXCEPTION 'invalid engagement transition % -> %', OLD.status, NEW.status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_engagement_transition
  BEFORE UPDATE ON engagements
  FOR EACH ROW EXECUTE FUNCTION check_engagement_transition();

-- ─── Hard rule #12, enforced unconditionally ───

CREATE OR REPLACE FUNCTION check_engagement_working_preconditions() RETURNS trigger AS $$
DECLARE
  v_agenda_locked boolean;
  v_escrow_held boolean;
BEGIN
  IF NEW.status <> 'working' OR OLD.status = 'working' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM agendas WHERE engagement_id = NEW.id AND locked_at IS NOT NULL AND superseded_at IS NULL
  ) INTO v_agenda_locked;

  SELECT EXISTS (
    SELECT 1 FROM escrows WHERE engagement_id = NEW.id AND status = 'held'
  ) INTO v_escrow_held;

  IF NOT (v_agenda_locked AND v_escrow_held) THEN
    RAISE EXCEPTION
      'engagement % cannot enter working: agenda_locked=%, escrow_held=%',
      NEW.id, v_agenda_locked, v_escrow_held
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_engagement_working_preconditions
  BEFORE UPDATE ON engagements
  FOR EACH ROW EXECUTE FUNCTION check_engagement_working_preconditions();

-- Attempts the agreed -> working promotion; a no-op (not an error) if the
-- other precondition isn't met yet, since either side may lock/hold first.
CREATE OR REPLACE FUNCTION try_promote_engagement_to_working(p_engagement_id uuid) RETURNS void AS $$
DECLARE
  v_agenda_locked boolean;
  v_escrow_held boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM agendas WHERE engagement_id = p_engagement_id AND locked_at IS NOT NULL AND superseded_at IS NULL
  ) INTO v_agenda_locked;

  SELECT EXISTS (
    SELECT 1 FROM escrows WHERE engagement_id = p_engagement_id AND status = 'held'
  ) INTO v_escrow_held;

  IF v_agenda_locked AND v_escrow_held THEN
    UPDATE engagements SET status = 'working' WHERE id = p_engagement_id AND status = 'agreed';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- The escrow side of the reactive promotion (the agenda side is wired in
-- 0011, once the `agendas` table exists).
CREATE OR REPLACE FUNCTION on_escrow_held_promote_engagement() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'held' AND OLD.status <> 'held' THEN
    PERFORM try_promote_engagement_to_working(NEW.engagement_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_escrow_promotes_engagement
  AFTER UPDATE ON escrows
  FOR EACH ROW EXECUTE FUNCTION on_escrow_held_promote_engagement();
