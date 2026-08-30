-- ═══════════════════════════════════════════════════════════════════════
--  0029 — idempotency keys get an explicit state (closes TRACKER.md D5)
--
--  The bug: on handler failure, IdempotencyService DELETED its own key.
--  That was done so a transient failure would not poison the key forever
--  (every later retry bouncing off the "already in flight" 409), but it
--  opened a window that is worse than the problem it solved:
--
--    A: INSERT key                     -- claims it
--    B: INSERT .. ON CONFLICT DO NOTHING  -- 0 rows, key is taken
--    A: handler throws -> DELETE key
--    B: SELECT the key                 -- 0 ROWS. The row is gone.
--
--  B then either crashed on the missing row (a 500 on a money endpoint)
--  or, had it re-inserted, would have run a handler concurrently with a
--  sibling request carrying the SAME key — the exact double-execution
--  `Idempotency-Key` exists to prevent (CLAUDE.md #10).
--
--  The fix is to never remove the row. A failed attempt is recorded as
--  `failed` and may be RE-CLAIMED by a later retry through a conditional
--  UPDATE (`WHERE state = 'failed'`), which is atomic: under READ
--  COMMITTED the loser of that race re-evaluates its WHERE after the
--  winner commits, matches nothing, and is told the request is in
--  flight. There is no window in which the key does not exist.
--
--  Note the direction of the default, as in 0027: an INSERT that forgets
--  to say lands on 'in_flight', the value that REFUSES concurrent
--  execution. A default of 'failed' would let a forgotten column silently
--  hand a second caller permission to run a money handler again.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TYPE idempotency_state AS ENUM (
  'in_flight',  -- claimed by exactly one caller, handler running
  'completed',  -- handler returned; the response is stored and replayed
  'failed'      -- handler threw; no response, and a later retry may re-claim it
);

ALTER TABLE idempotency_keys
  ADD COLUMN state       idempotency_state NOT NULL DEFAULT 'in_flight',
  ADD COLUMN attempts    integer NOT NULL DEFAULT 1 CHECK (attempts > 0),
  ADD COLUMN claimed_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN failed_at   timestamptz;

-- Rows that predate this column: completed_at was the only signal.
UPDATE idempotency_keys SET state = 'completed' WHERE completed_at IS NOT NULL;

COMMENT ON COLUMN idempotency_keys.state IS
  'in_flight = one caller owns it, others get IDEMPOTENCY_REQUEST_IN_FLIGHT.
   completed = replay the stored response. failed = a retry may re-claim it
   via UPDATE .. WHERE state = ''failed''. The row is never deleted; that
   deletion was D5.';

COMMENT ON COLUMN idempotency_keys.attempts IS
  'How many times this key has been claimed. Not derivable from anything
   else (there is no attempt log), and the signal that tells ops a key is
   failing repeatedly rather than once.';

COMMENT ON COLUMN idempotency_keys.claimed_at IS
  'When the CURRENT attempt claimed the row — reset on re-claim, unlike
   created_at. How long a row has been in_flight is measured from here.';

-- ── Invariants ─────────────────────────────────────────────────────────
--  A stored response and the state that justifies it must not drift
--  apart. A row claiming 'completed' with no body would replay `null` to
--  every retry of a money request; a row still 'in_flight' holding a
--  response would mean a handler's result was recorded without the
--  attempt ever being closed out.

ALTER TABLE idempotency_keys
  ADD CONSTRAINT idempotency_response_matches_state CHECK (
    CASE state
      WHEN 'completed' THEN
        completed_at IS NOT NULL AND response_status IS NOT NULL AND response_body IS NOT NULL
      ELSE
        completed_at IS NULL AND response_status IS NULL AND response_body IS NULL
    END
  );

ALTER TABLE idempotency_keys
  ADD CONSTRAINT idempotency_failed_at_matches_state CHECK (
    (state = 'failed') = (failed_at IS NOT NULL)
  );
