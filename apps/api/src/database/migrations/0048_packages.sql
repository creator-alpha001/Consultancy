-- ═══════════════════════════════════════════════════════════════════════
--  0048 — packages: several sessions bought at once
--
--  SPEC-PLATFORM §7.1 lists a multi-session package as a first-class
--  format and gives the reason: it raises lifetime value and locks in
--  retention. Nothing implemented it, so every session was sold one at a
--  time and a provider had no way to offer a course of work.
--
--  ── How the money works, and why it is not partial escrow ───────────
--
--  The obvious design is one escrow for the whole package, released a
--  fraction at a time. That needs partial release, which this platform
--  deliberately does not have: `release` is all-or-nothing and
--  `settleSplit` happens once, because an escrow that can be drained in
--  pieces is an escrow whose remaining balance has to be tracked and
--  reconciled separately from the ledger.
--
--  So a package uses the account the ledger has had since the first money
--  migration and never used: `seeker_wallet`.
--
--    Buying:      payment_aggregator -> seeker_wallet   (one capture)
--    Each session: seeker_wallet     -> escrow          (an ordinary hold)
--    Finishing:    escrow -> provider_wallet + fee      (an ordinary release)
--
--  Every session is then a NORMAL engagement with its own agenda, its own
--  escrow and its own release. Nothing about assessment, disputes or
--  payouts has to know packages exist. The unused balance is visible in
--  the ledger and refundable by the same path as anything else.
--
--  ── Why sessions are drawn down rather than created up front ────────
--
--  Creating five engagements at purchase would need five agendas written
--  before the first conversation has happened, which is the opposite of
--  what the agenda is for. A package entitles you to five; each is agreed
--  when you come to use it.
-- ═══════════════════════════════════════════════════════════════════════

-- What a provider offers.
CREATE TABLE provider_packages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     uuid NOT NULL REFERENCES users(id),

  engagement_type text NOT NULL CHECK (length(trim(engagement_type)) > 0),
  skill_id        uuid REFERENCES skills(id) ON DELETE CASCADE,

  -- What the seeker is buying, in their own words: "Five answer reviews".
  title           text NOT NULL CHECK (length(trim(title)) > 0),

  session_count   integer NOT NULL CHECK (session_count >= 2),

  -- The TOTAL for the package, not per session. Stated as one number
  -- because that is what is charged; the per-session figure is derived
  -- for display and must never be stored as a second source of truth.
  amount_paise    bigint NOT NULL CHECK (amount_paise > 0),
  currency        text NOT NULL DEFAULT 'INR',

  -- Same commitment model as a single service (0044). A package of live
  -- sessions states the length of one; a package of reviews states the
  -- turnaround of one.
  duration_minutes integer CHECK (duration_minutes > 0),
  turnaround_hours integer CHECK (turnaround_hours > 0),
  CONSTRAINT package_commitment_single
    CHECK (NOT (duration_minutes IS NOT NULL AND turnaround_hours IS NOT NULL)),

  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX provider_packages_provider_idx ON provider_packages (provider_id) WHERE active;

COMMENT ON COLUMN provider_packages.amount_paise IS
  'Total for the whole package. Per-session price is derived, never
   stored — two numbers that must agree are one number too many.';

-- A seeker bought one.
CREATE TABLE package_purchases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id      uuid NOT NULL REFERENCES provider_packages(id),
  seeker_id       uuid NOT NULL REFERENCES users(id),
  provider_id     uuid NOT NULL REFERENCES users(id),

  -- Snapshotted at purchase. A provider changing their package later must
  -- not change what someone already bought.
  sessions_total  integer NOT NULL CHECK (sessions_total >= 2),
  amount_paise    bigint NOT NULL CHECK (amount_paise > 0),
  currency        text NOT NULL,

  -- The transaction that moved money into the seeker's wallet.
  capture_transaction_id uuid REFERENCES ledger_transactions(id),

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX package_purchases_seeker_idx ON package_purchases (seeker_id, created_at DESC);

-- Which engagements were drawn against which purchase.
--
-- A separate table rather than a counter on the purchase, because
-- "sessions used" must be derivable from the engagements themselves. A
-- stored count is a second source of truth that drifts the first time an
-- engagement is cancelled (#7's reasoning, applied outside money).
CREATE TABLE package_draws (
  purchase_id   uuid NOT NULL REFERENCES package_purchases(id) ON DELETE CASCADE,
  engagement_id uuid NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (purchase_id, engagement_id)
);

CREATE INDEX package_draws_engagement_idx ON package_draws (engagement_id);

-- Never draw more sessions than were bought.
--
-- In the trigger rather than the service because it is a rule about money
-- already taken: over-drawing would create an engagement whose escrow the
-- wallet cannot fund, and the failure would surface as a confusing
-- balance error rather than "you have used all five".
CREATE OR REPLACE FUNCTION check_package_draw_available() RETURNS trigger AS $$
DECLARE
  v_total integer;
  v_used  integer;
BEGIN
  SELECT sessions_total INTO v_total FROM package_purchases WHERE id = NEW.purchase_id;

  -- Cancelled and refunded engagements give the session back: the seeker
  -- paid for five usable sessions, not five attempts.
  SELECT count(*) INTO v_used
    FROM package_draws d
    JOIN engagements e ON e.id = d.engagement_id
   WHERE d.purchase_id = NEW.purchase_id
     AND e.status NOT IN ('cancelled', 'refunded');

  IF v_used >= v_total THEN
    RAISE EXCEPTION
      'package purchase % has all % sessions used', NEW.purchase_id, v_total
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_package_draw_available
  BEFORE INSERT ON package_draws
  FOR EACH ROW EXECUTE FUNCTION check_package_draw_available();
