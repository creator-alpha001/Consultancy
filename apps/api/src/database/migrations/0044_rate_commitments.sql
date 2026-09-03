-- ═══════════════════════════════════════════════════════════════════════
--  0044 — a price means nothing without what you get for it
--
--  0043 let a provider say "₹950 for a document review" and stopped
--  there. What a seeker was never told is how long they wait, or how long
--  the session is. For a live session the length came from the provider's
--  `slotMinutes` booking policy and was never shown before booking; for a
--  document review there was no stated turnaround at all, though
--  SPEC-PLATFORM §7.1 names a three-day SLA for one and 24/48h for async
--  written work.
--
--  So the booking screen showed an editable "Your offer" box and no
--  duration — which is a reverse-marketplace interaction (§5.3, where a
--  seeker posts a budget and providers bid) wearing a direct-booking
--  screen's clothes. Direct booking should read "this costs X and comes
--  back in Y". Negotiation belongs on the board, which already exists
--  for it.
--
--  ── Two units, because there are two different promises ─────────────
--
--  A live session's commitment is TIME WITH YOU: sixty minutes. An async
--  piece of work's commitment is TIME UNTIL YOU GET IT BACK: three days.
--  They are not the same measurement and collapsing them into one
--  "duration" column would force every reader to know which meaning
--  applies before they could render it.
--
--  Both nullable, and which one is required is decided by the engagement
--  type — family data, not something core may hardcode (#1). The check
--  below enforces only that a rate never claims both.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE provider_rates
  ADD COLUMN duration_minutes  integer CHECK (duration_minutes > 0),
  ADD COLUMN turnaround_hours  integer CHECK (turnaround_hours > 0);

-- A rate is either time spent with someone or time until it comes back.
-- Never both: a session that is "60 minutes, returned in 3 days" is two
-- different products and nobody could tell which they bought.
ALTER TABLE provider_rates
  ADD CONSTRAINT rate_commitment_single
  CHECK (NOT (duration_minutes IS NOT NULL AND turnaround_hours IS NOT NULL));

COMMENT ON COLUMN provider_rates.duration_minutes IS
  'How long the session is. For live work only — the commitment is time
   spent with the seeker.';

COMMENT ON COLUMN provider_rates.turnaround_hours IS
  'How long until the work comes back. For asynchronous work only — the
   commitment is a deadline, not an amount of contact time.';
