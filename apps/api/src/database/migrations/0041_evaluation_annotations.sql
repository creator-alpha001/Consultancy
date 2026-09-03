-- ═══════════════════════════════════════════════════════════════════════
--  0041 — annotations: remarks anchored to a place on the work
--
--  The design document calls the marked-up answer sheet the product's
--  signature element and the one place it spends its boldness. What
--  existed was `evaluations.annotated_ref`, a free-text box whose own
--  placeholder read "Pointer to the annotated document (no file storage
--  yet)". An evaluation could carry rubric scores and one overall note,
--  and nothing could say "THIS sentence is the problem".
--
--  Why a table rather than a JSON blob on `evaluations`: an annotation is
--  addressable. The seeker taps pin 4, a dispute cites pin 4, and a
--  reviewer later asks which remarks existed before the work was
--  returned. None of that survives being a nested array nobody can
--  reference.
--
--  ── The position model ──────────────────────────────────────────────
--
--  `page` plus NORMALISED x/y in 0..1, not pixels. Pixels are a property
--  of the image as some particular browser scaled it; the same answer
--  photographed at 3024px and viewed on a 360px phone must put the pin in
--  the same place, and a fraction of the page survives both. It also
--  survives the source being re-encoded or the viewer zooming.
--
--  x/y are NULLABLE, together. A PDF that no browser here can lay out
--  still deserves remarks — those anchor to a page and no finer. Allowing
--  half a coordinate would mean every reader has to decide what a pin
--  with an x and no y means, so the constraint below forbids it.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE evaluation_annotations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id  uuid NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,

  -- What the seeker sees on the pin. Assigned by the service, contiguous
  -- from 1, so "pin 4" means the same thing to both parties and in a
  -- dispute.
  ordinal        integer NOT NULL CHECK (ordinal > 0),

  page           integer NOT NULL DEFAULT 1 CHECK (page > 0),
  anchor_x       numeric(6,5) CHECK (anchor_x >= 0 AND anchor_x <= 1),
  anchor_y       numeric(6,5) CHECK (anchor_y >= 0 AND anchor_y <= 1),

  -- The remark itself. The original language is authoritative (#20), so
  -- it is stored beside the text rather than assumed from the domain.
  body_text      text NOT NULL CHECK (length(trim(body_text)) > 0),
  body_lang      text NOT NULL,

  created_at     timestamptz NOT NULL DEFAULT now(),

  -- Both or neither. See the note above.
  CONSTRAINT annotation_anchor_complete
    CHECK ((anchor_x IS NULL) = (anchor_y IS NULL)),

  CONSTRAINT annotation_ordinal_unique UNIQUE (evaluation_id, ordinal)
);

CREATE INDEX evaluation_annotations_eval_idx
  ON evaluation_annotations (evaluation_id, page, ordinal);

COMMENT ON COLUMN evaluation_annotations.anchor_x IS
  'Fraction across the page, 0..1. NULL together with anchor_y for a
   remark that belongs to a page rather than to a point on it.';

-- ─── Returned work is a record, not a draft ───
--
-- Once an evaluation is returned the seeker has read it, may have acted
-- on it, and may be about to dispute it. A remark that could still be
-- edited or deleted at that point is not evidence of anything — the same
-- reasoning that makes a locked agenda immutable (#11).
--
-- Enforced here rather than in the service because "the assessment the
-- seeker saw is the assessment that exists" is a property of the record,
-- and a service check is one forgotten call away from not holding.
CREATE OR REPLACE FUNCTION check_annotation_evaluation_open() RETURNS trigger AS $$
DECLARE
  v_returned_at timestamptz;
  v_evaluation_id uuid;
BEGIN
  v_evaluation_id := COALESCE(NEW.evaluation_id, OLD.evaluation_id);
  SELECT returned_at INTO v_returned_at FROM evaluations WHERE id = v_evaluation_id;

  IF v_returned_at IS NOT NULL THEN
    RAISE EXCEPTION
      'evaluation % was returned at %; its annotations are a record and cannot be changed',
      v_evaluation_id, v_returned_at
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_annotation_evaluation_open
  BEFORE INSERT OR UPDATE OR DELETE ON evaluation_annotations
  FOR EACH ROW EXECUTE FUNCTION check_annotation_evaluation_open();
