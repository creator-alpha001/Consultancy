-- ═══════════════════════════════════════════════════════════════════════
--  0042 — where a provider's money actually goes
--
--  `payouts` has carried `bank_account_last4` and `bank_ifsc` since the
--  first money migration, and both have always been NULL. They were
--  options on `EngagementsService.complete`, and the only caller — the
--  seeker pressing "accept and release" — has never had any reason to
--  know a provider's bank details and must never be asked for them. So
--  every payout row ever written names no destination, and
--  `transferToProvider` has been instructed to send money nowhere.
--
--  This is the table that was missing: a destination belongs to the
--  PROVIDER, set once by them, and read at release time.
--
--  ── What is deliberately NOT stored ─────────────────────────────────
--
--  The account number. CLAUDE.md #31: "Bank and card details live with
--  the payment aggregator. We store last-4 and IFSC only." The provider
--  types a full number, the server registers a beneficiary with the
--  licensed aggregator, and what lands here is the aggregator's token
--  plus the last four digits — enough for a person to recognise their own
--  account on a statement, and not enough for this database to be worth
--  stealing.
--
--  One row per provider. A second destination is a feature nobody has
--  asked for and a way to send money to the wrong place; changing it
--  replaces it, and the change is audited.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE provider_payout_details (
  provider_id        uuid PRIMARY KEY REFERENCES users(id),

  -- Shown back to the provider so they can tell which account this is.
  -- Never used to route money — the aggregator's token does that.
  account_holder_name text NOT NULL CHECK (length(trim(account_holder_name)) > 0),
  bank_account_last4  text NOT NULL CHECK (bank_account_last4 ~ '^[0-9]{4}$'),
  bank_ifsc           text NOT NULL CHECK (bank_ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),

  -- The aggregator's handle for this beneficiary. This is what a transfer
  -- is actually addressed to.
  pa_provider         text NOT NULL,
  pa_beneficiary_ref  text NOT NULL,

  -- Penny-drop: the aggregator deposits a trivial amount and confirms the
  -- account exists and the name matches. Until it does, a payout to this
  -- destination is a guess. Nullable because verification is asynchronous
  -- in reality, even where this sandbox answers immediately.
  verified_at         timestamptz,
  verification_note   text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE provider_payout_details IS
  'One payout destination per provider. Holds last-4 and IFSC only — the
   account number lives with the payment aggregator (CLAUDE.md #31).';

COMMENT ON COLUMN provider_payout_details.verified_at IS
  'When penny-drop verification succeeded. NULL means the destination is
   unproven; releasing to it is a decision, not a default.';

-- A destination is a security-relevant fact about where money goes, so
-- changing one is recorded like any other consequential decision (#14).
-- Append-only history rather than a mutable row alone: "it was changed
-- three days before the disputed payout" is a question that gets asked.
CREATE TABLE provider_payout_detail_changes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id        uuid NOT NULL REFERENCES users(id),
  bank_account_last4 text NOT NULL,
  bank_ifsc          text NOT NULL,
  changed_by         uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX provider_payout_detail_changes_idx
  ON provider_payout_detail_changes (provider_id, created_at DESC);

CREATE OR REPLACE FUNCTION record_payout_detail_change() RETURNS trigger AS $$
BEGIN
  INSERT INTO provider_payout_detail_changes
    (provider_id, bank_account_last4, bank_ifsc, changed_by)
  VALUES (NEW.provider_id, NEW.bank_account_last4, NEW.bank_ifsc, NEW.provider_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payout_detail_change
  AFTER INSERT OR UPDATE OF bank_account_last4, bank_ifsc ON provider_payout_details
  FOR EACH ROW EXECUTE FUNCTION record_payout_detail_change();

-- The history is evidence. Same rule as audit_log and the ledger (#14).
CREATE OR REPLACE FUNCTION refuse_payout_change_rewrite() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'provider_payout_detail_changes is append-only'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payout_changes_append_only
  BEFORE UPDATE OR DELETE ON provider_payout_detail_changes
  FOR EACH ROW EXECUTE FUNCTION refuse_payout_change_rewrite();
