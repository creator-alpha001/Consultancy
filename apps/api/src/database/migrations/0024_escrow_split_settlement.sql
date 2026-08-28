-- ═══════════════════════════════════════════════════════════════════════
--  0024 — split settlement of a disputed escrow
--
--  Most real disputes do not end with one side taking everything. Until
--  now `escrows` could only be released in full or refunded in full, so
--  a partial ruling had no honest way to be recorded — and the dishonest
--  ways (a full refund plus an off-ledger goodwill payment, or rounding
--  a split to whichever side was closer) are exactly what a double-entry
--  ledger exists to prevent.
--
--  A split is reachable ONLY from 'disputed_hold'. Partially settling an
--  engagement nobody disputed is not a thing that should be possible.
--
--  NOTE: the new enum value is only ever compared as text inside the
--  transition function below, never written as an enum literal, so this
--  migration is safe to run inside its transaction.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TYPE escrow_status ADD VALUE 'settled_split';

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
      ('disputed_hold', 'refunded'),
      ('disputed_hold', 'settled_split')
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
