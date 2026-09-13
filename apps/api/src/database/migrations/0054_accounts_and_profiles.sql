-- ═══════════════════════════════════════════════════════════════════════
--  0054 — completing accounts: names, profiles, reset, verification,
--         sessions that expire when idle
--
--  TRACKER D20 listed what identity/ still lacked: nothing set
--  `email_verified_at`, there was no way back into an account whose
--  password was forgotten, and sessions lived exactly 12 hours whether
--  used every minute or abandoned on a shared computer. And everyone was
--  named after their email address ("A. Sharma" from a.sharma@…), because
--  there was nowhere to keep a name.
--
--  ── account_tokens ─────────────────────────────────────────────────
--
--  One table for every single-use emailed token. Only a SHA-256 of the
--  token is stored. The token itself is DERIVED when the email is sent —
--  HMAC(server secret, purpose:id) — so it never sits in `outbox.payload`
--  or anywhere else in the database. A database dump alone cannot reset
--  anyone's password.
--
--  A token is spent exactly once: `used_at` moves from NULL to a time and
--  never again (trigger). Expiry is a column, checked on use.
--
--  ── Sessions ───────────────────────────────────────────────────────
--
--  `expires_at` stays the ABSOLUTE limit. `last_seen_at` adds the idle
--  limit, applied in SessionService by role (an admin console left open
--  is a different risk from a phone in someone's pocket).
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE users
  ADD COLUMN display_name text
    CHECK (display_name IS NULL OR (length(btrim(display_name)) BETWEEN 1 AND 80)),
  ADD COLUMN preferred_lang text NOT NULL DEFAULT 'en'
    CHECK (preferred_lang ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  -- The family whose pages someone registered through. Not a membership:
  -- a seeker has many domains (#6) and a provider's come from verified
  -- skills (#5). It answers one question only — which family's training
  -- and wording to show someone who has not yet done anything else.
  ADD COLUMN signup_family_code text;

COMMENT ON COLUMN users.display_name IS
  'What other people see. Chosen by the person. Never an email address.';

CREATE TABLE provider_profiles (
  provider_id uuid PRIMARY KEY REFERENCES users(id),
  headline    text CHECK (headline IS NULL OR length(headline) <= 120),
  bio         text CHECK (bio IS NULL OR length(bio) <= 2000),
  -- The bio is kept in the language it was written in (#20's principle,
  -- applied to the profile): a translation may be shown, the original is
  -- what the person said.
  bio_lang    text CHECK (bio_lang IS NULL OR bio_lang ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE account_token_purpose AS ENUM ('password_reset', 'email_verification');

CREATE TABLE account_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id),
  purpose     account_token_purpose NOT NULL,
  token_hash  text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  CHECK (expires_at > created_at)
);

CREATE INDEX account_tokens_recent ON account_tokens (user_id, purpose, created_at);

CREATE OR REPLACE FUNCTION check_account_token_update() RETURNS trigger AS $$
BEGIN
  IF NEW.user_id <> OLD.user_id OR NEW.purpose <> OLD.purpose
     OR NEW.token_hash <> OLD.token_hash OR NEW.created_at <> OLD.created_at
     OR NEW.expires_at <> OLD.expires_at THEN
    RAISE EXCEPTION 'an account token is immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'account token % was already used', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_account_token_update
  BEFORE UPDATE ON account_tokens
  FOR EACH ROW EXECUTE FUNCTION check_account_token_update();

ALTER TABLE user_sessions ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();
