-- ═══════════════════════════════════════════════════════════════════════
--  0039 — make #32's role set DATA, so 2FA can be switched off and back
--         on without a code change or a migration
--
--  CLAUDE.md #32 says 2FA is mandatory for provider and admin accounts.
--  That rule was correct but hardcoded in two places — this trigger and
--  AuthService.login — so turning it off for one role meant editing both
--  and remembering to put them back. This migration replaces the literal
--  `v_role IN ('provider','admin')` with a lookup, and nothing else.
--
--  The rule itself has NOT been softened. What changes is where the role
--  set lives. Switching a role back on is one statement:
--
--      UPDATE mfa_policy SET mandatory = true WHERE role = 'provider';
--
--  ...and it takes effect on the next login, with no deploy: the trigger
--  reads the table per INSERT and AuthService reads it per login.
--
--  Note the direction of the fallback, which follows 0027's reasoning: a
--  role with NO row falls back to the ORIGINAL hardcoded rule, not to
--  "not required". A missing row must never be the thing that silently
--  drops a second factor.
--
--  Current setting: provider is OFF, at the repo owner's explicit
--  request, so the seeded mentors can sign in during evaluation. Every
--  other part of the 2FA system is untouched and still works — enrolment
--  routes, TOTP verification, recovery codes, the enrolment-scoped
--  ticket, and the factor-removal guard. See TRACKER.md.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE mfa_policy (
  role       user_role PRIMARY KEY,
  mandatory  boolean NOT NULL,
  note       text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE mfa_policy IS
  'Which roles must satisfy a second factor to hold a full session —
   CLAUDE.md #32, as data. A role with no row here falls back to the
   original hardcoded rule (provider and admin mandatory), so a missing
   row fails toward the stricter setting.';

INSERT INTO mfa_policy (role, mandatory, note) VALUES
  ('seeker',   false, '#32 names providers and admins only; never mandatory for seekers.'),
  ('provider', false, 'TEMPORARILY OFF at the repo owner''s request. To restore #32: UPDATE mfa_policy SET mandatory = true WHERE role = ''provider'';'),
  ('admin',    true,  '#32, unchanged. Admins reach money and disputes.');

-- Re-stated in full rather than patched, for the same reason 0027 gave:
-- the rule is short enough that a reader should see all of it at once.
-- The ONLY change from 0027 is the two lines that resolve v_mfa_mandatory
-- and the IF that uses it.
CREATE OR REPLACE FUNCTION check_session_preconditions() RETURNS trigger AS $$
DECLARE
  v_role user_role;
  v_status user_status;
  v_adult_confirmed_at timestamptz;
  v_has_confirmed_factor boolean;
  v_mfa_mandatory boolean;
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
  --
  -- This stays open to provider and admin even when the policy says 2FA
  -- is not mandatory for that role: enrolment is a CAPABILITY, and taking
  -- it away would mean nobody could enrol ahead of switching the rule
  -- back on.
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

  -- CLAUDE.md #32 — the rule is unchanged; only the role set is now read
  -- rather than written here. A role absent from mfa_policy falls back to
  -- the original literal, so the stricter answer is the default.
  SELECT COALESCE(
    (SELECT mandatory FROM mfa_policy WHERE role = v_role),
    v_role IN ('provider', 'admin')
  ) INTO v_mfa_mandatory;

  IF v_mfa_mandatory THEN
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
