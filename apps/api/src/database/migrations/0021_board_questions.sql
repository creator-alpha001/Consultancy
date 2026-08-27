-- ═══════════════════════════════════════════════════════════════════════
--  0021 — the free question board
--
--  CLAUDE.md: "Auto-publish content a screening classifier flagged" is
--  a thing you must not do. A flagged question goes to
--  'held_for_review', never published, and — hard rule #25 — is
--  answered with the family's real helpline numbers, never a rejection
--  notice. The screening itself lives in safety/; this table only
--  records the outcome.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TYPE question_status AS ENUM ('published', 'held_for_review', 'answered');

CREATE TABLE questions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seeker_id          uuid NOT NULL REFERENCES users(id),
  domain_code        text NOT NULL REFERENCES domains(code),
  category_id        uuid REFERENCES categories(id),
  -- Original-language text is authoritative, same as an agenda
  -- (CLAUDE.md #20) — never discarded even once translated.
  body_original      text NOT NULL,
  body_lang          text NOT NULL,
  translations       jsonb NOT NULL DEFAULT '{}'::jsonb,
  status             question_status NOT NULL DEFAULT 'published',
  distress_flagged   boolean NOT NULL DEFAULT false,
  screening_reasons  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON questions (seeker_id, created_at);
CREATE INDEX ON questions (domain_code, status);
CREATE INDEX ix_questions_held_for_review ON questions (created_at) WHERE status = 'held_for_review';

CREATE TABLE answers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  uuid NOT NULL REFERENCES questions(id),
  provider_id  uuid NOT NULL REFERENCES users(id),
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON answers (question_id);

-- A held-for-review question cannot be answered publicly until a human
-- clears it — answering is only meaningful once it is visible.
CREATE OR REPLACE FUNCTION check_answer_requires_published_question() RETURNS trigger AS $$
DECLARE
  v_status question_status;
BEGIN
  SELECT status INTO v_status FROM questions WHERE id = NEW.question_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'question % does not exist', NEW.question_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF v_status = 'held_for_review' THEN
    RAISE EXCEPTION 'question % is held for review and cannot be answered yet', NEW.question_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_answer_requires_published_question
  BEFORE INSERT ON answers
  FOR EACH ROW EXECUTE FUNCTION check_answer_requires_published_question();

CREATE OR REPLACE FUNCTION on_answer_marks_question_answered() RETURNS trigger AS $$
BEGIN
  UPDATE questions SET status = 'answered' WHERE id = NEW.question_id AND status = 'published';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_answer_marks_question_answered
  AFTER INSERT ON answers
  FOR EACH ROW EXECUTE FUNCTION on_answer_marks_question_answered();
