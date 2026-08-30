-- The outbox relay.
--
-- `outbox` has been written to correctly since M1 and read by nothing, so
-- `release()` credited a provider's wallet and no transfer was ever
-- instructed (TRACKER D28). Money was owed correctly and never sent.
--
-- What this adds is only what a relay needs to be safe when it runs more
-- than once, dies mid-flight, or runs in two processes at the same time:
-- a next-attempt clock for backoff, and an index the claim query can use.

-- When this row may next be attempted. Claiming = pushing this forward,
-- which means a relay that dies after claiming leaves the row to be
-- retried later rather than stuck: there is no separate "in flight"
-- state to get stranded in, and no lock held across a network call
-- (hard rule #9 — never call an external API inside a DB transaction).
ALTER TABLE outbox
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();

-- Set once a row has exhausted its attempts. It stays undispatched and
-- keeps showing up in reconciliation: a payout that could not be
-- instructed is not something to quietly stop trying at and forget.
ALTER TABLE outbox
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz;

CREATE INDEX IF NOT EXISTS outbox_pending_idx
  ON outbox (next_attempt_at)
  WHERE dispatched_at IS NULL AND dead_lettered_at IS NULL;

-- A dispatched row is finished: it must not also be dead-lettered, and a
-- dead-lettered one must not claim to have been delivered.
ALTER TABLE outbox
  DROP CONSTRAINT IF EXISTS outbox_terminal_state_is_exclusive;
ALTER TABLE outbox
  ADD CONSTRAINT outbox_terminal_state_is_exclusive
  CHECK (dispatched_at IS NULL OR dead_lettered_at IS NULL);
