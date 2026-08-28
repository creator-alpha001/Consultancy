-- ═══════════════════════════════════════════════════════════════════════
--  0022 — reviews, and per-skill provider stats
--
--  CLAUDE.md hard rule #17 is the shape of this migration as much as
--  anything it creates: "no streaks, leaderboards, percentile
--  comparisons, or outcome predictions." So there is no rank column, no
--  score, no percentile, and nothing here compares one user to another.
--  A review is a fact about one engagement; the stats view aggregates a
--  provider's own history, per skill.
--
--  And per the no-derived-column rule (the same reasoning as money's "no
--  `balance` column"), provider stats are a VIEW. Nothing stores a
--  review count or an average that could drift away from the reviews
--  that justify it.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TYPE review_direction AS ENUM (
  'seeker_on_provider',
  'provider_on_seeker'
);

CREATE TABLE reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id  uuid NOT NULL REFERENCES engagements(id),
  reviewer_id    uuid NOT NULL REFERENCES users(id),
  subject_id     uuid NOT NULL REFERENCES users(id),
  direction      review_direction NOT NULL,
  rating         smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  -- Same multilingual discipline as agendas (SPEC-PLATFORM.md §8): the
  -- text is stored in the language it was written in, and that original
  -- is never overwritten by a translation.
  body_original  text NOT NULL DEFAULT '',
  body_lang      text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- One review per direction per engagement. Both parties may review;
  -- neither may review twice.
  UNIQUE (engagement_id, direction),
  CHECK (reviewer_id <> subject_id)
);

CREATE INDEX reviews_subject_idx ON reviews (subject_id);

COMMENT ON TABLE reviews IS
  'Immutable once written (trg_reviews_append_only). A review that can be
   silently rewritten after a dispute is a trust hole, so corrections are
   a new engagement''s review, never an edit of an old one.';

CREATE TRIGGER trg_reviews_append_only
  BEFORE UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- ─── Invariant: you may only review an engagement you were part of, in
--     the direction your role actually implies, and only once it has
--     genuinely ended. ───

CREATE OR REPLACE FUNCTION check_review_is_legitimate() RETURNS trigger AS $$
DECLARE
  v_engagement engagements%ROWTYPE;
BEGIN
  SELECT * INTO v_engagement FROM engagements WHERE id = NEW.engagement_id;

  IF v_engagement.status NOT IN ('completed', 'refunded') THEN
    RAISE EXCEPTION
      'engagement % cannot be reviewed while %: reviews are only possible once it has ended',
      NEW.engagement_id, v_engagement.status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.direction = 'seeker_on_provider' THEN
    IF NEW.reviewer_id <> v_engagement.seeker_id OR NEW.subject_id <> v_engagement.provider_id THEN
      RAISE EXCEPTION
        'seeker_on_provider review on engagement % must be written by its seeker about its provider',
        NEW.engagement_id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  ELSE
    IF NEW.reviewer_id <> v_engagement.provider_id OR NEW.subject_id <> v_engagement.seeker_id THEN
      RAISE EXCEPTION
        'provider_on_seeker review on engagement % must be written by its provider about its seeker',
        NEW.engagement_id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_review_is_legitimate
  BEFORE INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION check_review_is_legitimate();

-- ─── Per-skill provider stats — derived, never stored ───
--
--  SPEC-PLATFORM.md §18 M7: "per-skill stats." Keyed on the skill,
--  because that is what a provider is verified in (§5) — a provider is
--  strong at polity answer writing and weak at essays, and one global
--  number would hide exactly that. `engagement_skills` is the snapshot
--  taken at agree() time, so an engagement counts toward the skills it
--  actually required when it ran, not whatever its category maps to now.

CREATE VIEW provider_skill_stats AS
SELECT
  ps.provider_id,
  ps.skill_id,
  ps.tier,
  count(DISTINCT e.id) FILTER (WHERE e.status = 'completed')            AS completed_engagements,
  count(DISTINCT e.id) FILTER (WHERE e.status = 'refunded')             AS refunded_engagements,
  count(DISTINCT r.id)                                                  AS review_count,
  avg(r.rating) FILTER (WHERE r.id IS NOT NULL)                         AS avg_rating,
  max(e.updated_at) FILTER (WHERE e.status = 'completed')               AS last_completed_at
FROM provider_skills ps
LEFT JOIN engagement_skills es
       ON es.skill_id = ps.skill_id
LEFT JOIN engagements e
       ON e.id = es.engagement_id
      AND e.provider_id = ps.provider_id
      AND e.status IN ('completed', 'refunded')
LEFT JOIN reviews r
       ON r.engagement_id = e.id
      AND r.direction = 'seeker_on_provider'
      AND r.subject_id = ps.provider_id
WHERE ps.active
GROUP BY ps.provider_id, ps.skill_id, ps.tier;

COMMENT ON VIEW provider_skill_stats IS
  'Derived per-skill history for one provider. Deliberately carries no
   rank, percentile, or peer comparison of any kind (CLAUDE.md #17) —
   callers that order providers do so internally for matching, and never
   surface a position to a user.';
