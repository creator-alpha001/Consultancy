-- ═══════════════════════════════════════════════════════════════════════
--  0011 — agendas
--
--  SPEC-PLATFORM.md §8: "the heart of the product." Locking freezes the
--  agenda and hashes it; changes go through a change order that creates
--  a NEW version — never an in-place edit. The original-language text is
--  authoritative in a dispute (CLAUDE.md #20) — translations sit beside
--  it, never replace it.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE agendas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id         uuid NOT NULL REFERENCES engagements(id),
  version               integer NOT NULL DEFAULT 1,
  original_lang         text NOT NULL,
  expected_deliverable  text NOT NULL,
  -- "I will know this worked if..." — protects the provider from scope creep.
  out_of_scope          text NOT NULL DEFAULT '',
  success_criteria      text NOT NULL,
  context               text NOT NULL DEFAULT '',
  locked_at             timestamptz,
  locked_hash           text,
  -- Set exactly once, when a change order supersedes this version. The
  -- only field a locked agenda may still have written to it — see the
  -- immutability trigger below.
  superseded_at         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK ((locked_at IS NULL) = (locked_hash IS NULL))
);

-- Exactly one active (non-superseded) agenda per engagement at a time.
CREATE UNIQUE INDEX ux_agendas_active_per_engagement
  ON agendas (engagement_id) WHERE superseded_at IS NULL;

CREATE TRIGGER trg_touch_agendas BEFORE UPDATE ON agendas
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE agenda_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_id     uuid NOT NULL REFERENCES agendas(id) ON DELETE CASCADE,
  ordinal       integer NOT NULL,
  -- Original-language text plus its language and any translations,
  -- side by side — never discard the original (CLAUDE.md #20).
  label_lang    text NOT NULL,
  label_text    text NOT NULL,
  translations  jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- In-session checklist (§8, wired up properly once sessions/ exists in
  -- M5) — either party ticks; both see progress.
  checked_at    timestamptz,
  UNIQUE (agenda_id, ordinal)
);

-- ─── Immutability: once locked, an agenda's content is frozen ───

CREATE OR REPLACE FUNCTION check_agenda_immutable_once_locked() RETURNS trigger AS $$
BEGIN
  IF OLD.locked_at IS NULL THEN
    RETURN NEW; -- not locked yet — anything goes
  END IF;

  -- The only permitted post-lock write: setting superseded_at, once, on
  -- an otherwise-unchanged row (a change order superseding this version).
  IF NEW.superseded_at IS NOT NULL AND OLD.superseded_at IS NULL
     AND NEW.original_lang = OLD.original_lang
     AND NEW.expected_deliverable = OLD.expected_deliverable
     AND NEW.out_of_scope = OLD.out_of_scope
     AND NEW.success_criteria = OLD.success_criteria
     AND NEW.context = OLD.context
     AND NEW.locked_at = OLD.locked_at
     AND NEW.locked_hash = OLD.locked_hash
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'agenda % is locked — changes require a change order, not an edit', OLD.id
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agenda_immutable
  BEFORE UPDATE ON agendas
  FOR EACH ROW EXECUTE FUNCTION check_agenda_immutable_once_locked();

CREATE OR REPLACE FUNCTION check_agenda_items_immutable_once_locked() RETURNS trigger AS $$
DECLARE
  v_locked_at timestamptz;
BEGIN
  SELECT locked_at INTO v_locked_at FROM agendas WHERE id = COALESCE(NEW.agenda_id, OLD.agenda_id);
  IF v_locked_at IS NOT NULL AND TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'agenda % is locked — items cannot be added or removed' , COALESCE(NEW.agenda_id, OLD.agenda_id)
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  -- Ticking a checklist item during a session is allowed post-lock; a
  -- content edit (label_text/translations) is not.
  IF v_locked_at IS NOT NULL AND TG_OP = 'UPDATE'
     AND (NEW.label_text <> OLD.label_text OR NEW.label_lang <> OLD.label_lang)
  THEN
    RAISE EXCEPTION 'agenda item %  content is locked — use a change order', OLD.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agenda_items_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON agenda_items
  FOR EACH ROW EXECUTE FUNCTION check_agenda_items_immutable_once_locked();

-- The agenda side of the reactive working-promotion (escrow side is in 0010).
CREATE OR REPLACE FUNCTION on_agenda_locked_promote_engagement() RETURNS trigger AS $$
BEGIN
  IF NEW.locked_at IS NOT NULL AND OLD.locked_at IS NULL THEN
    PERFORM try_promote_engagement_to_working(NEW.engagement_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agenda_promotes_engagement
  AFTER UPDATE ON agendas
  FOR EACH ROW EXECUTE FUNCTION on_agenda_locked_promote_engagement();
