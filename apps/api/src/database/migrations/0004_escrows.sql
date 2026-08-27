-- ═══════════════════════════════════════════════════════════════════════
--  0004 — escrows
--
--  One row per engagement's held funds. Status transitions are validated
--  by trigger against a fixed table (CLAUDE.md hard rule #13), not left
--  to the service layer to get right every time.
--
--  Escrow ledger accounts are platform-level (one per currency, not one
--  per engagement — ledger_accounts.owner_user_id only models users).
--  Which engagement a hold/release belongs to is carried by
--  ledger_transactions.reference_type = 'escrow', reference_id = escrows.id.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TYPE escrow_status AS ENUM (
  'pending',        -- created, funds not yet confirmed held
  'held',           -- funds confirmed in the escrow account
  'released',       -- paid out to the provider (minus platform fee)
  'refunded',       -- returned to the seeker
  'disputed_hold'   -- frozen pending a dispute ruling
);

CREATE TABLE escrows (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id        uuid NOT NULL REFERENCES engagements(id),
  seeker_id            uuid NOT NULL REFERENCES users(id),
  provider_id          uuid NOT NULL REFERENCES users(id),
  currency             text NOT NULL,
  amount_paise         bigint NOT NULL CHECK (amount_paise > 0),
  fee_schedule_id      uuid REFERENCES fee_schedules(id),
  -- Frozen at hold time from fee_schedule_at(currency, now()); release
  -- uses this, never a fresh lookup, so a mid-engagement rate change
  -- can't alter money already agreed and held.
  platform_fee_paise   bigint CHECK (platform_fee_paise >= 0),
  status               escrow_status NOT NULL DEFAULT 'pending',
  hold_transaction_id     uuid REFERENCES ledger_transactions(id),
  -- Set on whichever terminal transition resolves the escrow: the
  -- release transaction if released, the refund transaction if refunded.
  resolution_transaction_id uuid REFERENCES ledger_transactions(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_id)
);

CREATE TRIGGER trg_touch_escrows BEFORE UPDATE ON escrows
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE OR REPLACE FUNCTION check_escrow_transition() RETURNS trigger AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW; -- no-op update to another column is fine
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM (VALUES
      ('pending',       'held'),
      ('held',          'released'),
      ('held',          'refunded'),
      ('held',          'disputed_hold'),
      ('disputed_hold', 'released'),
      ('disputed_hold', 'refunded')
    ) AS allowed(from_status, to_status)
    WHERE allowed.from_status = OLD.status::text
      AND allowed.to_status = NEW.status::text
  ) THEN
    RAISE EXCEPTION 'invalid escrow transition % -> %', OLD.status, NEW.status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_escrow_transition
  BEFORE UPDATE ON escrows
  FOR EACH ROW EXECUTE FUNCTION check_escrow_transition();
