-- ═══════════════════════════════════════════════════════════════════════
--  0020 — board posts and proposals
--
--  SPEC-PLATFORM.md §18 M6: "A seeker finds a provider they never met
--  and completes an engagement." A board_post is an open request with
--  no provider chosen yet; a proposal is a specific provider's bid.
--  Accepting one creates a real `engagements` row (M3) and is the only
--  place a stranger becomes an assigned provider.
--
--  The trigger below is CLAUDE.md hard rule #5 made real: "A provider
--  may only propose if they hold every required skill at t2+ in a
--  language the engagement uses." Until now (M6), nothing enforced
--  this — TRACKER.md's D8 is closed by this migration, not by app code.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TYPE board_post_status AS ENUM ('open', 'awarded', 'cancelled', 'expired');

CREATE TABLE board_posts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seeker_id           uuid NOT NULL REFERENCES users(id),
  domain_code         text NOT NULL REFERENCES domains(code),
  category_id         uuid NOT NULL REFERENCES categories(id),
  engagement_type     text NOT NULL,
  language            text NOT NULL,
  currency            text NOT NULL DEFAULT 'INR',
  budget_min_paise    bigint NOT NULL CHECK (budget_min_paise > 0),
  budget_max_paise    bigint NOT NULL CHECK (budget_max_paise >= budget_min_paise),
  description         text NOT NULL DEFAULT '',
  status              board_post_status NOT NULL DEFAULT 'open',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON board_posts (domain_code, status);
CREATE INDEX ON board_posts (seeker_id);

CREATE TRIGGER trg_touch_board_posts BEFORE UPDATE ON board_posts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE OR REPLACE FUNCTION check_board_post_transition() RETURNS trigger AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM (VALUES ('open','awarded'), ('open','cancelled'), ('open','expired')) AS allowed(f, t)
    WHERE allowed.f = OLD.status::text AND allowed.t = NEW.status::text
  ) THEN
    RAISE EXCEPTION 'invalid board post transition % -> %', OLD.status, NEW.status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_board_post_transition
  BEFORE UPDATE ON board_posts
  FOR EACH ROW EXECUTE FUNCTION check_board_post_transition();

CREATE TYPE proposal_status AS ENUM ('submitted', 'withdrawn', 'accepted', 'rejected');

CREATE TABLE proposals (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_post_id           uuid NOT NULL REFERENCES board_posts(id),
  provider_id             uuid NOT NULL REFERENCES users(id),
  message                 text NOT NULL DEFAULT '',
  proposed_amount_paise   bigint NOT NULL CHECK (proposed_amount_paise > 0),
  status                  proposal_status NOT NULL DEFAULT 'submitted',
  resulting_engagement_id uuid REFERENCES engagements(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (board_post_id, provider_id)
);
CREATE INDEX ON proposals (board_post_id, status);

COMMENT ON TABLE proposals IS
  'No sort=price anywhere this table is queried, at any layer (CLAUDE.md
   hard rule #15) — proposals are listed by recency or left unsorted,
   never by proposed_amount_paise. This is a product decision, not an
   oversight: ranking by price is what a marketplace optimising for
   quality over a race to the bottom must not do.';

CREATE TRIGGER trg_touch_proposals BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE OR REPLACE FUNCTION check_proposal_transition() RETURNS trigger AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM (VALUES ('submitted','withdrawn'), ('submitted','accepted'), ('submitted','rejected'))
      AS allowed(f, t)
    WHERE allowed.f = OLD.status::text AND allowed.t = NEW.status::text
  ) THEN
    RAISE EXCEPTION 'invalid proposal transition % -> %', OLD.status, NEW.status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_proposal_transition
  BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION check_proposal_transition();

-- ─── Hard rule #5, enforced at the one point a stranger becomes an
-- assigned provider ───

CREATE OR REPLACE FUNCTION check_proposal_requires_skills_and_tier() RETURNS trigger AS $$
DECLARE
  v_domain_code   text;
  v_category_id   uuid;
  v_language      text;
  v_post_status   board_post_status;
  v_family_code   text;
  v_min_tier      text;
  v_missing_skills integer;
BEGIN
  SELECT domain_code, category_id, language, status
    INTO v_domain_code, v_category_id, v_language, v_post_status
    FROM board_posts WHERE id = NEW.board_post_id;

  IF v_post_status IS NULL THEN
    RAISE EXCEPTION 'board post % does not exist', NEW.board_post_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF v_post_status <> 'open' THEN
    RAISE EXCEPTION 'board post % is % — not open for proposals', NEW.board_post_id, v_post_status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  SELECT family_code INTO v_family_code FROM domains WHERE code = v_domain_code;
  SELECT manifest->'policy'->>'minTierForPaidWork' INTO v_min_tier
    FROM domain_families WHERE code = v_family_code;
  IF v_min_tier IS NULL THEN
    v_min_tier := 't2'; -- a family manifest omitting this is a config bug, not licence to skip the gate
  END IF;

  SELECT count(*) INTO v_missing_skills
    FROM category_skills cs
   WHERE cs.category_id = v_category_id
     AND NOT EXISTS (
       SELECT 1 FROM provider_skills ps
        WHERE ps.provider_id = NEW.provider_id
          AND ps.skill_id = cs.skill_id
          AND ps.active
          AND ps.tier >= v_min_tier::mentor_tier
     );

  IF v_missing_skills > 0 THEN
    RAISE EXCEPTION
      'provider % lacks % required verified skill(s) at % or above for board post %',
      NEW.provider_id, v_missing_skills, v_min_tier, NEW.board_post_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM provider_languages pl
     WHERE pl.provider_id = NEW.provider_id AND pl.lang_code = v_language AND pl.can_evaluate
  ) THEN
    RAISE EXCEPTION 'provider % does not work in language % required by board post %',
      NEW.provider_id, v_language, NEW.board_post_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_proposal_requires_skills_and_tier
  BEFORE INSERT ON proposals
  FOR EACH ROW EXECUTE FUNCTION check_proposal_requires_skills_and_tier();
