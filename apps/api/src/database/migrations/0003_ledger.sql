-- ═══════════════════════════════════════════════════════════════════════
--  0003 — the ledger
--
--  Double-entry. Every ledger_entries row belongs to a ledger_transactions
--  row; the entries for one transaction must sum to zero per currency —
--  enforced by a deferred constraint trigger, not trusted to application
--  code. Both tables are append-only: UPDATE and DELETE raise. There is
--  no `balance` column anywhere — ledger_account_balances derives it.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TYPE ledger_account_type AS ENUM (
  'seeker_wallet',        -- funds a seeker has paid in, pre-escrow (rare in M1; PA usually books straight to escrow)
  'provider_wallet',      -- funds earned, pending payout
  'escrow',               -- held per-engagement; see escrows table
  'platform_fee_revenue',
  'payment_aggregator',   -- mirrors funds sitting with the PA (Razorpay/Cashfree) before/after settlement
  'payout_clearing',      -- funds in flight to a provider's bank account
  'reserve',              -- CLAUDE.md #23: pays a provider when a platform-side failure means the seeker is refunded
  'tax_payable'
);

CREATE TABLE ledger_accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type           ledger_account_type NOT NULL,
  owner_user_id  uuid REFERENCES users(id), -- NULL for platform-level accounts (fee revenue, PA mirror, reserve, tax)
  currency       text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- One account per (type, owner, currency) for owner-scoped accounts...
CREATE UNIQUE INDEX ux_ledger_accounts_owned
  ON ledger_accounts (type, owner_user_id, currency)
  WHERE owner_user_id IS NOT NULL;

-- ...and one per (type, currency) for platform-level accounts, since
-- owner_user_id IS NULL would otherwise defeat a plain UNIQUE constraint.
CREATE UNIQUE INDEX ux_ledger_accounts_platform
  ON ledger_accounts (type, currency)
  WHERE owner_user_id IS NULL;

CREATE TABLE ledger_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key  text NOT NULL UNIQUE,
  reason           text NOT NULL,      -- 'escrow_hold' | 'escrow_release' | 'escrow_refund' | 'payout' | 'reversal' | ...
  reference_type   text,               -- 'engagement' | 'escrow' | 'payout' | 'refund'
  reference_id     uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON ledger_transactions (reference_type, reference_id);

CREATE TABLE ledger_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  uuid NOT NULL REFERENCES ledger_transactions(id),
  account_id      uuid NOT NULL REFERENCES ledger_accounts(id),
  currency        text NOT NULL,
  -- Signed: positive increases the account, negative decreases it.
  -- Always paise (CLAUDE.md hard rule: bigint paise, never float/rupees).
  amount_paise    bigint NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (amount_paise <> 0)
);
CREATE INDEX ON ledger_entries (account_id);
CREATE INDEX ON ledger_entries (transaction_id);

COMMENT ON TABLE ledger_entries IS
  'Append-only. A row is never updated or deleted — see
   trg_ledger_entries_append_only. Corrections are reversing entries in a
   new ledger_transactions row.';

-- ─── Invariant: a transaction''s entries sum to zero, per currency ───
-- Deferred so a transaction can INSERT its ledger_transactions row and
-- then its >=2 ledger_entries rows, all in one DB transaction, without
-- the check firing after the first entry.

CREATE OR REPLACE FUNCTION check_ledger_transaction_balances() RETURNS trigger AS $$
DECLARE
  v_transaction_id uuid;
  v_unbalanced record;
BEGIN
  v_transaction_id := COALESCE(NEW.transaction_id, OLD.transaction_id);

  SELECT currency, sum(amount_paise) AS total
    INTO v_unbalanced
    FROM ledger_entries
   WHERE transaction_id = v_transaction_id
   GROUP BY currency
  HAVING sum(amount_paise) <> 0
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'ledger_transactions % does not balance: % % outstanding',
      v_transaction_id, v_unbalanced.total, v_unbalanced.currency
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NULL; -- AFTER trigger, return value ignored
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_ledger_balances
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_ledger_transaction_balances();

-- No separate "at least two entries" check: ledger_entries.amount_paise
-- has CHECK (amount_paise <> 0), so a single entry can never sum to zero
-- on its own — the balance trigger above already rejects it. A second,
-- separate trigger for the same case would just be dead weight.

-- ─── Invariant: append-only ───

CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE TRIGGER trg_ledger_transactions_append_only
  BEFORE UPDATE OR DELETE ON ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- ─── Derived balances. There is no `balance` column anywhere. ───

-- sum(bigint) is NUMERIC in Postgres, not bigint — cast back so clients
-- get int8 on the wire (and so a bigint-aware pg type parser, which
-- money/ requires everywhere paise are handled, applies here too).
CREATE VIEW ledger_account_balances AS
SELECT account_id, currency, sum(amount_paise)::bigint AS balance_paise
  FROM ledger_entries
 GROUP BY account_id, currency;
