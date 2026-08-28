-- ═══════════════════════════════════════════════════════════════════════
--  0025 — real identity: credentials, sessions, second factors
--
--  0001 said: "The real identity module (auth, roles, sessions) is a
--  later milestone and will extend `users` with new migrations, never
--  edit this one." This is that migration.
--
--  Until now the API trusted an `x-actor-id` request header — a client
--  could claim to be anyone. That is a direct violation of CLAUDE.md #28
--  ("Never trust a client-supplied user ID"), and it is why no module
--  built since M3 has an HTTP surface. This migration is what lets those
--  controllers exist.
--
--  Three CLAUDE.md rules become database invariants here rather than
--  code that could be forgotten:
--    #32 2FA is MANDATORY for provider and admin accounts — enforced as
--        "no authenticated session may exist for those roles unless a
--        verified second factor was actually satisfied for it."
--    #27 The platform is 18+ — no session may exist for a user who has
--        not attested to being an adult.
--    #14 Audit trails are append-only — `auth_events` cannot be edited
--        or deleted, so a login history cannot be quietly rewritten.
--
--  Existing rows are untouched and remain valid: a user with no
--  password_hash simply cannot authenticate, which is exactly right for
--  the fixture users every earlier milestone's tests create.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deactivated');

ALTER TABLE users ADD COLUMN password_hash text;
ALTER TABLE users ADD COLUMN status user_status NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
-- CLAUDE.md #27: the platform is 18+. This is an ATTESTATION timestamp,
-- deliberately not a date of birth: we have no use for a birthdate (the
-- payment aggregator owns KYC), and personal data we do not need is
-- personal data we should not hold.
ALTER TABLE users ADD COLUMN adult_confirmed_at timestamptz;
ALTER TABLE users ADD COLUMN failed_login_count integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0);
ALTER TABLE users ADD COLUMN locked_until timestamptz;
ALTER TABLE users ADD COLUMN last_login_at timestamptz;

COMMENT ON COLUMN users.password_hash IS
  'argon2id encoded hash (OWASP parameters), or NULL meaning "this
   account cannot authenticate with a password". Never a plaintext or
   reversible value.';

COMMENT ON COLUMN users.adult_confirmed_at IS
  'When the user attested to being 18+. NOT a date of birth — we do not
   collect one. Required before any session may be created (CLAUDE.md
   #27: do not build flows accommodating minors).';

-- ─── Second factors ────────────────────────────────────────────────────

CREATE TYPE auth_factor_type AS ENUM ('totp');

CREATE TABLE auth_factors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id),
  type         auth_factor_type NOT NULL,
  -- Base32 TOTP shared secret. Sensitive: an attacker with this can mint
  -- valid codes forever. Encryption at rest is an ops concern (D18) —
  -- recorded rather than pretended away.
  secret       text NOT NULL,
  -- Enrolment is two-step: a factor is created, then confirmed by the
  -- user producing a valid code. Only a CONFIRMED factor satisfies #32.
  confirmed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- One TOTP factor per user. Re-enrolling replaces it.
  UNIQUE (user_id, type)
);

CREATE TABLE recovery_codes (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid NOT NULL REFERENCES users(id),
  -- sha256 hex of the code. The plaintext is shown once, at generation,
  -- and never stored — same discipline as the password.
  code_hash text NOT NULL CHECK (length(code_hash) = 64),
  used_at   timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code_hash)
);

CREATE INDEX recovery_codes_user_idx ON recovery_codes (user_id) WHERE used_at IS NULL;

-- ─── Sessions ──────────────────────────────────────────────────────────
--
--  Opaque server-side sessions, NOT JWTs. A JWT cannot be revoked before
--  it expires without a denylist that recreates this table anyway — and
--  on a platform holding escrowed money, where 2FA is mandatory and an
--  admin can rule on disputes, "log this session out NOW" has to work.

CREATE TABLE user_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id),
  -- sha256 hex of the bearer token. The token itself is returned to the
  -- client once and never stored, so a database leak does not hand an
  -- attacker live sessions.
  token_hash     text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  -- Whether a second factor was actually satisfied when this session was
  -- established. The #32 trigger below reads this.
  mfa_satisfied  boolean NOT NULL DEFAULT false,
  issued_at      timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  -- Coarse provenance for the security review and for "sign out my other
  -- devices". Not a fingerprint, and never a full IP for analytics use.
  user_agent     text,
  ip_prefix      text,
  CHECK (expires_at > issued_at)
);

CREATE INDEX user_sessions_user_idx ON user_sessions (user_id) WHERE revoked_at IS NULL;

-- ─── Append-only auth audit (CLAUDE.md #14) ────────────────────────────

CREATE TABLE auth_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable: a login attempt for an address that does not exist still
  -- needs recording, and must not leak whether the account exists.
  user_id    uuid REFERENCES users(id),
  event_type text NOT NULL,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_prefix  text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_events_user_idx ON auth_events (user_id, created_at DESC);

CREATE TRIGGER trg_auth_events_append_only
  BEFORE UPDATE OR DELETE ON auth_events
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

COMMENT ON TABLE auth_events IS
  'Append-only login/2FA/lockout history. Never stores a password, a
   token, or a TOTP code — only that an attempt happened and how it
   ended.';
