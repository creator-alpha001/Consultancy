-- ═══════════════════════════════════════════════════════════════════════
--  0051 — the action-item tracker
--
--  The platform plan calls this out as the retention feature and says to
--  build it: "turns one-off advice into an ongoing relationship with your
--  product". It is also the thing that makes an evaluation worth more
--  than a mark — a remark you acted on changed something; a remark you
--  read once and forgot did not.
--
--  ── Why an action item is an annotation, not a new object ───────────
--
--  A mentor already writes them. Every anchored remark on a marked answer
--  is, in substance, "do this differently next time". Asking mentors to
--  ALSO write a separate list of action items would mean the same advice
--  entered twice, the two drifting apart, and the seeker having to guess
--  which was authoritative.
--
--  So this table holds only the seeker's own state against a remark
--  somebody else wrote. The remark itself stays immutable (migration
--  0041): ticking one records that the seeker acted, and changes nothing
--  about what was said.
--
--  ── What this deliberately does NOT do ──────────────────────────────
--
--  No streak. No completion percentage across seekers. No "you are
--  slower than 70% of aspirants". CLAUDE.md #17 and #24 — progress here
--  compares someone to their own earlier work and to nothing else, and a
--  tracker that gamified an unfinished list would be the exact opposite
--  of the duty of care this platform owes this population.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE annotation_actions (
  annotation_id uuid NOT NULL REFERENCES evaluation_annotations(id) ON DELETE CASCADE,

  -- Always the seeker whose work it was. Enforced below: nobody ticks
  -- somebody else's list.
  seeker_id     uuid NOT NULL REFERENCES users(id),

  -- Nullable so a tick can be undone. Someone who marks a thing done and
  -- then realises they have not done it should be able to say so — a
  -- one-way tick makes the list lie.
  done_at       timestamptz,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (annotation_id, seeker_id)
);

CREATE INDEX annotation_actions_seeker_idx
  ON annotation_actions (seeker_id, done_at NULLS FIRST);

COMMENT ON TABLE annotation_actions IS
  'A seeker''s own state against a remark their reviewer left. The remark
   is immutable; this records only whether they acted on it.';

-- Only on your own work, and only once the evaluation has been returned.
--
-- Before it is returned the seeker has not seen the remark, so a tick
-- would be against something they cannot have read.
CREATE OR REPLACE FUNCTION check_annotation_action_allowed() RETURNS trigger AS $$
DECLARE
  v_seeker_id uuid;
  v_returned_at timestamptz;
BEGIN
  SELECT e.seeker_id, ev.returned_at
    INTO v_seeker_id, v_returned_at
    FROM evaluation_annotations a
    JOIN evaluations ev ON ev.id = a.evaluation_id
    JOIN engagements e ON e.id = ev.engagement_id
   WHERE a.id = NEW.annotation_id;

  IF v_seeker_id IS NULL THEN
    RAISE EXCEPTION 'no annotation %', NEW.annotation_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.seeker_id <> v_seeker_id THEN
    RAISE EXCEPTION
      'annotation % belongs to a different engagement', NEW.annotation_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF v_returned_at IS NULL THEN
    RAISE EXCEPTION
      'evaluation for annotation % has not been returned yet', NEW.annotation_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_annotation_action_allowed
  BEFORE INSERT OR UPDATE ON annotation_actions
  FOR EACH ROW EXECUTE FUNCTION check_annotation_action_allowed();
