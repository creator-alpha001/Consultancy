-- ═══════════════════════════════════════════════════════════════════════
--  0027 — scoped sessions, so a new provider can actually enrol 2FA
--
--  0026 refuses a session to a provider or admin without a confirmed
--  second factor (CLAUDE.md #32). Correct — but it left a genuine
--  chicken-and-egg: enrolling a factor requires an authenticated call,
--  and a brand-new provider cannot authenticate. That was TRACKER.md's
--  D19, and it blocked real provider onboarding.
--
--  The fix is a SCOPE on the session rather than a second token
--  mechanism: one table, one lifecycle, one revocation path. An
--  'mfa_enrolment' session is issued only after a correct password, is
--  short-lived, and the guard accepts it on the enrolment routes and
--  NOWHERE else. A 'full' session still requires everything #32 demands.
--
--  Note the direction of the default: existing rows and any future
--  INSERT that forgets to say become 'full', which is the STRICTER
--  setting. A default that silently downgraded a session's requirements
--  would be the wrong way for this to fail.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TYPE session_scope AS ENUM (
  'full',           -- an ordinary authenticated session
  'mfa_enrolment'   -- password proven; may ONLY enrol a second factor
);

ALTER TABLE user_sessions ADD COLUMN scope session_scope NOT NULL DEFAULT 'full';

COMMENT ON COLUMN user_sessions.scope IS
  'full = ordinary session. mfa_enrolment = issued after a correct
   password to a provider/admin who has no confirmed factor yet; the
   AuthGuard accepts it on the enrolment routes only. Defaults to the
   stricter value on purpose.';

-- Re-stated in full rather than patched: the #32 exemption is narrow and
-- belongs where a reader can see the whole rule at once.
CREATE OR REPLACE FUNCTION check_session_preconditions() RETURNS trigger AS $$
DECLARE
  v_role user_role;
  v_status user_status;
  v_adult_confirmed_at timestamptz;
  v_has_confirmed_factor boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.revoked_at IS NOT NULL THEN
    RETURN NEW; -- revocation is never blocked by rules about creation
  END IF;

  SELECT role, status, adult_confirmed_at
    INTO v_role, v_status, v_adult_confirmed_at
    FROM users WHERE id = NEW.user_id;

  -- CLAUDE.md #27 — 18+. Applies to EVERY scope: an enrolment session is
  -- still a session, and a minor must not hold one.
  IF v_adult_confirmed_at IS NULL THEN
    RAISE EXCEPTION
      'user % has not confirmed they are 18+; no session may be created',
      NEW.user_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'user % is %; no session may be created', NEW.user_id, v_status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- An enrolment-scoped session exists precisely BECAUSE the user has no
  -- factor yet, so #32 cannot apply to it. It is safe only because its
  -- scope is enforced at the guard and its lifetime is minutes: it can
  -- enrol a factor and do nothing else.
  IF NEW.scope = 'mfa_enrolment' THEN
    IF v_role NOT IN ('provider', 'admin') THEN
      RAISE EXCEPTION
        'enrolment-scoped sessions exist for provider/admin 2FA bootstrap; user % is a %',
        NEW.user_id, v_role
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    -- ...and it must never claim to have satisfied a factor.
    IF NEW.mfa_satisfied THEN
      RAISE EXCEPTION 'an enrolment-scoped session cannot claim mfa_satisfied'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- CLAUDE.md #32 — unchanged for every full session.
  IF v_role IN ('provider', 'admin') THEN
    IF NOT NEW.mfa_satisfied THEN
      RAISE EXCEPTION
        'user % is a % — a second factor is mandatory and was not satisfied for this session',
        NEW.user_id, v_role
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM auth_factors
       WHERE user_id = NEW.user_id AND confirmed_at IS NOT NULL
    ) INTO v_has_confirmed_factor;

    IF NOT v_has_confirmed_factor THEN
      RAISE EXCEPTION
        'user % is a % with no confirmed second factor enrolled',
        NEW.user_id, v_role
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The factor-removal guard counted enrolment sessions as "live sessions"
-- blocking removal. They are not: an enrolment session has no factor to
-- lose, and counting it would make re-enrolment impossible.
CREATE OR REPLACE FUNCTION check_factor_removal_safe() RETURNS trigger AS $$
DECLARE
  v_role user_role;
  v_live_sessions integer;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.confirmed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT role INTO v_role FROM users WHERE id = OLD.user_id;
  IF v_role NOT IN ('provider', 'admin') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT count(*) INTO v_live_sessions
    FROM user_sessions
   WHERE user_id = OLD.user_id
     AND revoked_at IS NULL
     AND expires_at > now()
     AND scope = 'full';

  IF v_live_sessions > 0 THEN
    RAISE EXCEPTION
      'user % has % live session(s); revoke them before removing their second factor',
      OLD.user_id, v_live_sessions
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
