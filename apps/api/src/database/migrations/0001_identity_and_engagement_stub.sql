-- ═══════════════════════════════════════════════════════════════════════
--  0001 — minimal identity + engagement stub
--
--  M1 builds the money spine only. `users` and `engagements` here are
--  deliberately minimal — just enough surface for the ledger/escrow
--  tables to have something real to reference via foreign key.
--
--  The real identity module (auth, roles, sessions) is a later
--  milestone and will extend `users` with new migrations, never edit
--  this one. The real `engagements` table — full lifecycle, transition
--  table, agenda-lock + escrow-hold precondition (CLAUDE.md hard rule
--  #12) — is M3. Nothing here should be read as the final shape of
--  either table.
-- ═══════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TYPE user_role AS ENUM ('seeker', 'provider', 'admin');

CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text UNIQUE NOT NULL,
  role        user_role NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_touch_users BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Stub only — see header. Status is free text here on purpose; the real
-- transition table arrives with the full state machine in M3.
CREATE TABLE engagements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seeker_id   uuid NOT NULL REFERENCES users(id),
  provider_id uuid NOT NULL REFERENCES users(id),
  currency    text NOT NULL DEFAULT 'INR',
  status      text NOT NULL DEFAULT 'draft',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (seeker_id <> provider_id)
);

CREATE TRIGGER trg_touch_engagements BEFORE UPDATE ON engagements
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
