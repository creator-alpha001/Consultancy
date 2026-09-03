-- ═══════════════════════════════════════════════════════════════════════
--  0046 — an escrow may split without a dispute
--
--  The transition table has allowed `settled_split` only from
--  `disputed_hold`, because a split had exactly one source: an
--  adjudicator ruling that neither party was wholly right.
--
--  A provider discount (migration 0045) is a second source, and it is not
--  a dispute. The provider decides, with the work in front of them, to
--  charge less than they published; part of the escrow goes back to the
--  seeker and the rest to them, with the platform fee charged pro-rata on
--  what they actually earned. That is the same MOVEMENT as a split
--  ruling, reached from `held` because nothing was ever disputed.
--
--  Routing a discount through `disputed_hold` to satisfy the old table
--  would have been the wrong fix: it would put "disputed" on the record
--  of an engagement where nobody disagreed about anything, and that word
--  appears in evidence packets and in a provider's dispute rate.
--
--  What distinguishes the two remains `refunds.reason` — `provider_discount`
--  against the dispute's ruling code — so a discount is never read as a
--  finding against anyone.
-- ═══════════════════════════════════════════════════════════════════════

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
      -- New: a provider charging less than they published.
      ('held',          'settled_split'),
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
