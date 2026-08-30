-- User-facing safety reporting (TRACKER D45).
--
-- CLAUDE.md scopes `safety/` to "reports, distress escalation,
-- contact-leak detection". Only detection existed: a person harassed in
-- a session, or sent something abusive, had no way to tell anyone. The
-- screening classifier catches text on its way in; nothing handled a
-- person deciding for themselves that something is wrong.
--
-- Policy decided with the product owner, because no spec covers it:
--   * reported CONTENT is held from public view immediately, the same
--     mechanism a distress flag uses (#25) — reversible in minutes;
--   * a PERSON is never auto-suspended, and an engagement is never
--     frozen, because one report must not be able to stop someone
--     else's paid work;
--   * the reporter is told their report was received and reviewed, and
--     never what happened to the other party.

CREATE TYPE report_subject_type AS ENUM (
  'user', 'question', 'answer', 'review', 'session', 'engagement'
);

-- 'reviewing' is distinct from 'open' so a queue can be worked without
-- two reviewers picking up the same report. Both resolved states are
-- terminal: see the transition trigger below.
CREATE TYPE report_status AS ENUM ('open', 'reviewing', 'actioned', 'dismissed');

CREATE TABLE reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  reporter_id       uuid NOT NULL REFERENCES users(id),

  subject_type      report_subject_type NOT NULL,
  -- Polymorphic, so deliberately not a foreign key — the same reason
  -- `audit_log.subject_id` is not one. A report must outlive the thing
  -- it is about, or deleting the content would delete the complaint.
  subject_id        uuid NOT NULL,

  -- Who the report is ABOUT. Resolved by the service from the subject,
  -- never taken from the client. Null where a subject has no single
  -- owner. Carried on the row so the self-report check below can be a
  -- database constraint rather than a hope.
  subject_owner_id  uuid REFERENCES users(id),

  -- The family owns safety policy (CLAUDE.md), so the reason codes are
  -- declared in its manifest and validated against it on write — NOT an
  -- enum here. A new family with a different set of reasons must not
  -- need a migration (hard rule #4).
  family_code       text NOT NULL REFERENCES domain_families(code),
  reason_code       text NOT NULL CHECK (length(trim(reason_code)) > 0),

  -- The reporter's own words. Original language is authoritative and is
  -- never discarded (#20), same as an agenda.
  detail_original   text,
  detail_lang       text,

  status            report_status NOT NULL DEFAULT 'open',

  -- Whether THIS report is what put a hold on the content. A hold is
  -- released when the last report holding it is dismissed, so the
  -- release path needs to know which reports are holding.
  holds_content     boolean NOT NULL DEFAULT false,

  resolved_by       uuid REFERENCES users(id),
  resolved_at       timestamptz,
  -- For the reviewer's record. NEVER returned to the reporter: the
  -- outcome is the other party's disciplinary record, not theirs.
  resolution_note   text,

  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Reporting yourself is always a mistake or an attempt to get your own
  -- content held. Enforced here so no code path can bypass it.
  CONSTRAINT report_is_not_self CHECK (subject_owner_id IS NULL OR subject_owner_id <> reporter_id),

  -- A resolution is a person's decision: it has a resolver and a time,
  -- or the report is not resolved. Half-resolved is not a state.
  CONSTRAINT report_resolution_is_complete CHECK (
    (status IN ('actioned', 'dismissed')) = (resolved_at IS NOT NULL)
    AND (resolved_at IS NULL) = (resolved_by IS NULL)
  )
);

-- One live report per person per subject. A second complaint about the
-- same thing from the same person is noise in the queue, and would let
-- one reporter pile up holds. Once resolved the partial index lets them
-- report again — which is deliberately the recourse for a report they
-- believe was wrongly dismissed.
CREATE UNIQUE INDEX reports_one_live_per_reporter_subject
  ON reports (reporter_id, subject_type, subject_id)
  WHERE status IN ('open', 'reviewing');

CREATE INDEX reports_queue_idx ON reports (status, created_at) WHERE status IN ('open', 'reviewing');
CREATE INDEX reports_subject_idx ON reports (subject_type, subject_id);
CREATE INDEX reports_reporter_idx ON reports (reporter_id, created_at DESC);
CREATE INDEX reports_subject_owner_idx ON reports (subject_owner_id, created_at DESC);

-- Resolution is terminal.
--
-- A ruling that can be quietly re-opened and re-decided is not a record
-- of anything, and this table is evidence in exactly the cases that end
-- badly. Recourse for a wrong dismissal is a new report, which the
-- partial unique index above permits precisely because the old one is
-- resolved.
CREATE OR REPLACE FUNCTION reject_report_reopen() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('actioned', 'dismissed') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'report % is already resolved (%) — raise a new report instead', OLD.id, OLD.status;
  END IF;
  IF NEW.reporter_id <> OLD.reporter_id OR NEW.subject_id <> OLD.subject_id
     OR NEW.subject_type <> OLD.subject_type OR NEW.reason_code <> OLD.reason_code THEN
    RAISE EXCEPTION 'a report''s identity and claim are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reports_no_reopen
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION reject_report_reopen();

-- ── Holding reported content ────────────────────────────────────────
--
-- Questions already have `held_for_review`, which is the same idea
-- arrived at from the other direction (the classifier holding on the way
-- in), so a reported question reuses it rather than getting a second
-- vocabulary for the same state.
--
-- Answers and reviews needed something new, and it is deliberately NOT a
-- column on those tables. `reviews` is append-only by trigger — a review
-- the reviewed party cannot edit is the whole point — and adding a
-- moderation column would have meant carving an exception into that
-- trigger. A hold is a fact ABOUT a row, not a change to it, so it lives
-- beside it and the row stays untouched.
--
-- Generic on purpose: holding a new kind of content later needs a read
-- path to consult this table, not another migration.
CREATE TABLE content_holds (
  subject_type report_subject_type NOT NULL,
  subject_id   uuid NOT NULL,
  held_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subject_type, subject_id)
);

COMMENT ON TABLE content_holds IS
  'Content out of public view pending review. A row here is a hold; releasing
   deletes it. The reason and the decision live in `reports` and `audit_log` —
   this table answers only "is it visible", which is what read paths ask.';

-- A held review must also stop counting toward the provider's rating.
-- Filtering it out of the list but leaving it in the average would hide
-- the words and keep the score, which is the wrong half.
CREATE OR REPLACE VIEW provider_review_summary AS
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
  AND NOT EXISTS (SELECT 1 FROM content_holds h WHERE h.subject_type = 'review' AND h.subject_id = r.id)
GROUP BY r.subject_id;

CREATE OR REPLACE VIEW provider_review_dimension_summary AS
SELECT
  r.subject_id                        AS provider_id,
  s.dimension_code,
  count(*)                            AS score_count,
  avg(s.score)::numeric(3,2)          AS avg_score
FROM reviews r
JOIN review_dimension_scores s ON s.review_id = r.id
WHERE r.direction = 'seeker_on_provider'
  AND NOT EXISTS (SELECT 1 FROM content_holds h WHERE h.subject_type = 'review' AND h.subject_id = r.id)
GROUP BY r.subject_id, s.dimension_code;
