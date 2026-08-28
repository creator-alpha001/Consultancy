-- ═══════════════════════════════════════════════════════════════════════
--  0031 — reviews with substance, and credentials shown as achievements
--
--  Two gaps, both about what a seeker can actually learn before they part
--  with money.
--
--  1. A profile showed a tier and a star average and nothing else. The
--     platform HOLDS verified credentials — cleared mains, appeared at
--     interview, a published rank — and showed none of them. That is the
--     evidence of competence a seeker most wants, and it was invisible.
--
--  2. A review was one integer and a paragraph. That is not enough to
--     choose between two mentors, and it gives the reviewed party no way
--     to answer.
--
--  CLAUDE.md #30 governs the first: profiles show the CONCLUSION, never
--  the evidence. `provider_credentials.verifier_data` holds roll numbers,
--  claimed names and document references — none of which may ever be
--  published. But the achievement itself has publishable facts (which
--  year, which exam), and those live in the same jsonb.
--
--  So publication is an explicit ALLOW-LIST per credential type, carried
--  in the family manifest and projected here. It defaults to empty: a
--  credential type that says nothing publishes nothing but its own label.
--  Core never names a field, so a family that verifies music grades
--  publishes different facts with no code change (#1).
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE credential_types
  ADD COLUMN public_fields text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN credential_types.public_fields IS
  'Allow-list of verifier_data keys that may appear on a public profile.
   Empty by default — fail closed. Never includes anything identifying:
   a roll number or a claimed name is evidence, not an achievement.';

-- ── Dimensioned reviews ────────────────────────────────────────────────
--  One star cannot distinguish "explained it brilliantly but was three
--  days late" from "on time and useless". The dimensions themselves come
--  from the family manifest, so core names none of them.
--
--  Distinct from assessment templates (#16): those grade the WORK against
--  a rubric bound to a category. These describe what the person was like
--  to work with.

CREATE TABLE review_dimension_scores (
  review_id      uuid NOT NULL REFERENCES reviews(id) ON DELETE RESTRICT,
  dimension_code text NOT NULL,
  score          smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, dimension_code)
);

CREATE INDEX review_dimension_scores_dim_idx ON review_dimension_scores (dimension_code);

-- Append-only for the same reason the review itself is: a score that can
-- be quietly revised after a dispute is not evidence of anything.
CREATE TRIGGER trg_review_dimension_scores_append_only
  BEFORE UPDATE OR DELETE ON review_dimension_scores
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- ── Right of reply ─────────────────────────────────────────────────────
--  A review the reviewed party cannot answer is a weapon rather than a
--  record. One reply, by the subject only, append-only like everything
--  else in this neighbourhood.

CREATE TABLE review_replies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id     uuid NOT NULL UNIQUE REFERENCES reviews(id),
  author_id     uuid NOT NULL REFERENCES users(id),
  body_original text NOT NULL,
  body_lang     text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(body_original)) > 0)
);

COMMENT ON TABLE review_replies IS
  'One reply per review, written by the review''s SUBJECT and nobody
   else. Append-only: an answer that can be edited later is worth as
   little as a review that can be.';

CREATE OR REPLACE FUNCTION check_reply_author_is_subject() RETURNS trigger AS $$
DECLARE
  v_subject uuid;
BEGIN
  SELECT subject_id INTO v_subject FROM reviews WHERE id = NEW.review_id;
  IF v_subject IS NULL THEN
    RAISE EXCEPTION 'review % does not exist', NEW.review_id;
  END IF;
  IF v_subject <> NEW.author_id THEN
    RAISE EXCEPTION
      'only the subject of a review may reply to it (review %, subject %, author %)',
      NEW.review_id, v_subject, NEW.author_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_review_replies_author BEFORE INSERT ON review_replies
  FOR EACH ROW EXECUTE FUNCTION check_reply_author_is_subject();

CREATE TRIGGER trg_review_replies_append_only
  BEFORE UPDATE OR DELETE ON review_replies
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- ── Summaries ──────────────────────────────────────────────────────────
--  Views, never stored counts — the same reasoning as money's "no
--  `balance` column" and 0022's per-skill stats. A stored average
--  eventually disagrees with the reviews that justify it.
--
--  Note what is absent: no rank, no percentile, no comparison to any
--  other provider (#17). A distribution of a person's OWN reviews tells a
--  seeker how consistent they are, which is a fact about them alone.

CREATE VIEW provider_review_summary AS
SELECT
  r.subject_id                                        AS provider_id,
  count(*)                                            AS review_count,
  avg(r.rating)::numeric(3,2)                         AS avg_rating,
  count(*) FILTER (WHERE r.rating = 5)                AS count_5,
  count(*) FILTER (WHERE r.rating = 4)                AS count_4,
  count(*) FILTER (WHERE r.rating = 3)                AS count_3,
  count(*) FILTER (WHERE r.rating = 2)                AS count_2,
  count(*) FILTER (WHERE r.rating = 1)                AS count_1,
  count(*) FILTER (WHERE rr.id IS NOT NULL)           AS replied_count,
  max(r.created_at)                                   AS last_review_at
FROM reviews r
LEFT JOIN review_replies rr ON rr.review_id = r.id
WHERE r.direction = 'seeker_on_provider'
GROUP BY r.subject_id;

CREATE VIEW provider_review_dimension_summary AS
SELECT
  r.subject_id                        AS provider_id,
  s.dimension_code,
  count(*)                            AS score_count,
  avg(s.score)::numeric(3,2)          AS avg_score
FROM reviews r
JOIN review_dimension_scores s ON s.review_id = r.id
WHERE r.direction = 'seeker_on_provider'
GROUP BY r.subject_id, s.dimension_code;
