-- ═══════════════════════════════════════════════════════════════════════
--  0055 — an unlocked agenda's items can actually be removed
--
--  0011's `check_agenda_items_immutable_once_locked` runs BEFORE INSERT,
--  UPDATE and DELETE, and ended with `RETURN NEW`. For a DELETE, NEW is
--  NULL — and a BEFORE row trigger that returns NULL tells Postgres to
--  skip the row. So every delete of an agenda item was silently cancelled,
--  locked or not: no error, no row removed.
--
--  It went unnoticed because nothing deleted an item until drafts became
--  editable (saving a draft twice now replaces its items). The second save
--  then collided with the first save's items on (agenda_id, ordinal).
--
--  The rule itself is unchanged: a LOCKED agenda's items still cannot be
--  added or removed, and their content still cannot change. Only the
--  return value is corrected, the way 0041's annotation trigger already
--  does it.
-- ═══════════════════════════════════════════════════════════════════════

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
  -- NEW is NULL for a DELETE; returning it would silently cancel the delete.
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
