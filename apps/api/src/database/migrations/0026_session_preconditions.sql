-- ═══════════════════════════════════════════════════════════════════════
--  0026 — a session may not exist unless it was earned
--
--  CLAUDE.md #32 says "2FA mandatory for provider and admin accounts."
--  A service-layer check would satisfy that sentence right up until the
--  day someone adds a second login path — an SSO callback, an impersonation
--  tool, a migration script — and forgets. So it is enforced here, on the
--  row itself, where every path has to go through it.
--
--  Same for #27 (18+): no session for a user who has not attested.
--
--  Note what is NOT enforced here: that seekers use 2FA. The rule names
--  providers and admins, and quietly extending a security requirement to
--  a population the spec didn't name would be inventing policy. Seekers
--  MAY enrol; providers and admins MUST.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION check_session_preconditions() RETURNS trigger AS $$
DECLARE
  v_role user_role;
  v_status user_status;
  v_adult_confirmed_at timestamptz;
  v_has_confirmed_factor boolean;
BEGIN
  -- A revoked session is being closed, not established; let it through so
  -- revocation can never be blocked by a rule about creating sessions.
  IF TG_OP = 'UPDATE' AND NEW.revoked_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT role, status, adult_confirmed_at
    INTO v_role, v_status, v_adult_confirmed_at
    FROM users WHERE id = NEW.user_id;

  -- CLAUDE.md #27 — the platform is 18+.
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

  -- CLAUDE.md #32 — 2FA is mandatory for providers and admins.
  IF v_role IN ('provider', 'admin') THEN
    IF NOT NEW.mfa_satisfied THEN
      RAISE EXCEPTION
        'user % is a % — a second factor is mandatory and was not satisfied for this session',
        NEW.user_id, v_role
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    -- ...and "satisfied" must mean a factor that actually exists and was
    -- confirmed. Otherwise a caller could simply pass mfa_satisfied=true.
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

CREATE TRIGGER trg_session_preconditions
  BEFORE INSERT OR UPDATE ON user_sessions
  FOR EACH ROW EXECUTE FUNCTION check_session_preconditions();

-- A confirmed factor cannot be un-confirmed or deleted out from under a
-- live session: that would leave a provider holding an authenticated
-- session the #32 rule would now refuse to issue.
CREATE OR REPLACE FUNCTION check_factor_removal_safe() RETURNS trigger AS $$
DECLARE
  v_role user_role;
  v_live_sessions integer;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.confirmed_at IS NOT NULL THEN
    RETURN NEW; -- still confirmed, nothing to guard
  END IF;

  SELECT role INTO v_role FROM users WHERE id = OLD.user_id;
  IF v_role NOT IN ('provider', 'admin') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT count(*) INTO v_live_sessions
    FROM user_sessions
   WHERE user_id = OLD.user_id AND revoked_at IS NULL AND expires_at > now();

  IF v_live_sessions > 0 THEN
    RAISE EXCEPTION
      'user % has % live session(s); revoke them before removing their second factor',
      OLD.user_id, v_live_sessions
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_factor_removal_safe
  BEFORE UPDATE OR DELETE ON auth_factors
  FOR EACH ROW EXECUTE FUNCTION check_factor_removal_safe();
