-- ═══════════════════════════════════════════════════════════════════════
--  0049 — an escrow has to remember where its money came from
--
--  Until packages, every escrow was funded the same way: a card charge
--  through the aggregator. So `refund` could safely send money back to
--  `payment_aggregator` without asking, and did.
--
--  A session drawn from a package is funded from the seeker's own wallet
--  — the card was charged once, at purchase. Refunding that escrow to the
--  card would take money the seeker had already committed and hand it
--  back as cash, while `package_draws` gave them the session to use
--  again. They would be entitled to a session they could no longer fund,
--  and the platform would be out of pocket by exactly one session.
--
--  A refund has to reverse the movement that was actually made. So the
--  escrow records which one it was.
--
--  Existing rows default to 'payment', which is what every escrow written
--  before this migration was.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE escrows
  ADD COLUMN funded_from text NOT NULL DEFAULT 'payment'
  CHECK (funded_from IN ('payment', 'wallet'));

COMMENT ON COLUMN escrows.funded_from IS
  'How this escrow was funded: a fresh aggregator capture, or the
   seeker''s wallet balance (a package draw). A refund reverses the same
   movement — see EscrowService.refund.';
