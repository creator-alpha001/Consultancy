-- ═══════════════════════════════════════════════════════════════════════
--  0002 — fee schedules
--
--  CLAUDE.md hard rule: "Rates come from fee_schedule_at(ts). Never
--  hardcode, never ORDER BY effective_from DESC LIMIT 1 in app code."
--  The EXCLUDE constraint makes overlapping schedules impossible to
--  insert in the first place, so fee_schedule_at(ts) can never be
--  ambiguous.
-- ═══════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS btree_gist; -- for the equality term in the EXCLUDE constraint below

CREATE TABLE fee_schedules (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency           text NOT NULL,
  effective_from     timestamptz NOT NULL,
  effective_to       timestamptz,              -- NULL = open-ended
  platform_fee_bps   integer NOT NULL CHECK (platform_fee_bps BETWEEN 0 AND 10000),
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES users(id),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  EXCLUDE USING gist (
    currency WITH =,
    tstzrange(effective_from, effective_to, '[)') WITH &&
  )
);

COMMENT ON TABLE fee_schedules IS
  'Effective-dated platform fee rates, per currency. Non-overlapping by
   construction (EXCLUDE constraint) — fee_schedule_at(ts) is always
   unambiguous. Never queried with ORDER BY ... LIMIT 1 from app code.';

CREATE FUNCTION fee_schedule_at(p_currency text, p_ts timestamptz)
RETURNS fee_schedules AS $$
  SELECT *
    FROM fee_schedules
   WHERE currency = p_currency
     AND effective_from <= p_ts
     AND (effective_to IS NULL OR effective_to > p_ts)
   LIMIT 1;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION fee_schedule_at IS
  'The only sanctioned way to read a fee rate. Returns NULL row if no
   schedule covers p_ts — callers must treat that as a hard error, not
   a default rate.';
