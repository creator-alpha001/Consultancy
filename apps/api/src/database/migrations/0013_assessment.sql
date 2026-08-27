-- ═══════════════════════════════════════════════════════════════════════
--  0013 — submissions and evaluations
--
--  SPEC-PLATFORM.md §10: "An assessment cannot be returned unless every
--  dimension in its bound template is scored — whatever that count is."
--  Enforced by trigger at the point returned_at is set, not trusted to
--  the service layer. A category with no bound template (Wave 3 hook,
--  CLAUDE.md hard rule #3) skips the check entirely rather than failing
--  it — "no assessment" is a valid outcome, not a violation.
--
--  `content_ref` is a placeholder for the real private-storage pointer
--  (S3 key + attachment_grants, per CLAUDE.md #29) — no object storage
--  is wired up in this environment. Recorded in TRACKER.md as a stub.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES engagements(id),
  seeker_id     uuid NOT NULL REFERENCES users(id),
  content_ref   text NOT NULL,
  note          text NOT NULL DEFAULT '',
  submitted_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON submissions (engagement_id);

CREATE TABLE evaluations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id  uuid NOT NULL REFERENCES engagements(id),
  submission_id  uuid NOT NULL REFERENCES submissions(id),
  provider_id    uuid NOT NULL REFERENCES users(id),
  -- Nullable on purpose (hard rule #3) — resolved from the engagement's
  -- category/skills at open time; a category with no template leaves
  -- this null and the dimension check below is skipped entirely.
  template_id    uuid REFERENCES assessment_templates(id),
  annotated_ref  text,
  overall_note   text NOT NULL DEFAULT '',
  returned_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id)
);

CREATE TRIGGER trg_touch_evaluations BEFORE UPDATE ON evaluations
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE assessment_scores (
  evaluation_id  uuid NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  dimension_code text NOT NULL,
  -- Placeholder 0-100 scale — no scoring range is specified anywhere we
  -- have (SPEC-FEATURES.md, which would define this, was not supplied).
  -- Recorded as a decision in TRACKER.md; confirm before this reaches
  -- an evaluator-facing screen.
  score          numeric(5,2) NOT NULL CHECK (score BETWEEN 0 AND 100),
  comment        text NOT NULL DEFAULT '',
  PRIMARY KEY (evaluation_id, dimension_code)
);

-- A score must name a dimension the evaluation's own template actually
-- defines — otherwise a typo'd dimension_code would silently never count
-- toward completeness.
CREATE OR REPLACE FUNCTION check_score_dimension_known() RETURNS trigger AS $$
DECLARE
  v_template_id uuid;
  v_known boolean;
BEGIN
  SELECT template_id INTO v_template_id FROM evaluations WHERE id = NEW.evaluation_id;
  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'evaluation % has no assessment template — it cannot be scored', NEW.evaluation_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM assessment_templates at, jsonb_array_elements(at.dimensions) dim
     WHERE at.id = v_template_id AND dim->>'code' = NEW.dimension_code
  ) INTO v_known;

  IF NOT v_known THEN
    RAISE EXCEPTION 'dimension "%" is not defined by the template bound to evaluation %', NEW.dimension_code, NEW.evaluation_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_score_dimension_known
  BEFORE INSERT OR UPDATE ON assessment_scores
  FOR EACH ROW EXECUTE FUNCTION check_score_dimension_known();

-- The completeness gate itself.
CREATE OR REPLACE FUNCTION check_evaluation_complete_before_return() RETURNS trigger AS $$
DECLARE
  v_required integer;
  v_scored integer;
BEGIN
  IF NEW.returned_at IS NULL OR OLD.returned_at IS NOT NULL THEN
    RETURN NEW; -- only checked at the moment of first return
  END IF;

  IF NEW.template_id IS NULL THEN
    RETURN NEW; -- no template bound — "no assessment" is valid, not incomplete
  END IF;

  SELECT jsonb_array_length(dimensions) INTO v_required
    FROM assessment_templates WHERE id = NEW.template_id;

  SELECT count(*) INTO v_scored FROM assessment_scores WHERE evaluation_id = NEW.id;

  IF v_scored < v_required THEN
    RAISE EXCEPTION 'evaluation % has % of % required dimensions scored',
      NEW.id, v_scored, v_required
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_evaluation_complete_before_return
  BEFORE UPDATE ON evaluations
  FOR EACH ROW EXECUTE FUNCTION check_evaluation_complete_before_return();

-- ─── Reactive promotions: working -> delivered -> assessed ───

CREATE OR REPLACE FUNCTION on_submission_promote_engagement() RETURNS trigger AS $$
BEGIN
  UPDATE engagements SET status = 'delivered' WHERE id = NEW.engagement_id AND status = 'working';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_submission_promotes_engagement
  AFTER INSERT ON submissions
  FOR EACH ROW EXECUTE FUNCTION on_submission_promote_engagement();

CREATE OR REPLACE FUNCTION on_evaluation_returned_promote_engagement() RETURNS trigger AS $$
BEGIN
  IF NEW.returned_at IS NOT NULL AND OLD.returned_at IS NULL THEN
    UPDATE engagements SET status = 'assessed' WHERE id = NEW.engagement_id AND status = 'delivered';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_evaluation_promotes_engagement
  AFTER UPDATE ON evaluations
  FOR EACH ROW EXECUTE FUNCTION on_evaluation_returned_promote_engagement();
