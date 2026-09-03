-- ═══════════════════════════════════════════════════════════════════════
--  0045 — a provider may charge less, once the work has started
--
--  Price on this platform is not negotiable. A provider publishes a
--  service at a price for a stated length of work and a seeker buys it;
--  what the two of them negotiate is the AGENDA — the goals, what is out
--  of scope. That is the whole point of the agenda system, and a price
--  that could be haggled over before booking would turn every engagement
--  into the auction §5.3 keeps deliberately on the board instead.
--
--  But a provider must be able to charge less. "This took twenty minutes,
--  not sixty." "I could not help you as much as I hoped." Refusing that
--  would make the fixed price a trap for the honest.
--
--  ── Why "once the work has started" is the rule ─────────────────────
--
--  A discount available BEFORE work begins is just price negotiation
--  wearing a different name: a seeker would ask for one, and providers
--  who refuse would lose bookings to providers who do not. Available only
--  after the work is under way, it is a judgement made with knowledge of
--  the work, which nobody can shop around for.
--
--  Enforced here rather than by hiding a button, because the rule is
--  about when money may move, and a UI check is one API call away from
--  not holding.
--
--  ── What "started" means ────────────────────────────────────────────
--
--  For live work: a session exists and has actually begun. For
--  asynchronous work there is no call to start, so the equivalent is the
--  engagement being in a working state — the escrow is held, the agenda
--  is locked, and the provider has the work in front of them.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE engagement_discounts (
  -- One per engagement. A second discount is a changed mind, and it
  -- replaces the first rather than stacking — see the service.
  engagement_id  uuid PRIMARY KEY REFERENCES engagements(id) ON DELETE CASCADE,

  -- Always the provider. Enforced below, because a seeker granting
  -- themselves a discount is not a discount.
  granted_by     uuid NOT NULL REFERENCES users(id),

  -- How much comes off, in paise. Strictly less than the engagement's
  -- amount: a full waiver is a refund and must be recorded as one, so
  -- that "was this paid for?" has one answer.
  discount_paise bigint NOT NULL CHECK (discount_paise > 0),

  -- Shown to the seeker. A reduction with no reason reads as an error.
  reason         text,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE engagement_discounts IS
  'A voluntary reduction by the provider, allowed only once the work has
   started. Settled as a split at release: the seeker is refunded the
   discount and the platform fee is charged pro-rata on what the provider
   actually earned.';

CREATE OR REPLACE FUNCTION check_discount_allowed() RETURNS trigger AS $$
DECLARE
  v_provider_id uuid;
  v_amount_paise bigint;
  v_status engagement_status;
  v_has_started_session boolean;
BEGIN
  SELECT provider_id, amount_paise, status
    INTO v_provider_id, v_amount_paise, v_status
    FROM engagements WHERE id = NEW.engagement_id;

  -- Only the provider gives up their own money.
  IF NEW.granted_by <> v_provider_id THEN
    RAISE EXCEPTION
      'only the provider on engagement % may discount it', NEW.engagement_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF v_amount_paise IS NULL THEN
    RAISE EXCEPTION 'engagement % has no price to discount', NEW.engagement_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- A discount equal to the price is a refund. Recording it as a discount
  -- would leave a completed engagement that was never paid for.
  IF NEW.discount_paise >= v_amount_paise THEN
    RAISE EXCEPTION
      'a discount of % is not less than the price of % — a full waiver is a refund',
      NEW.discount_paise, v_amount_paise
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM sessions
     WHERE engagement_id = NEW.engagement_id AND started_at IS NOT NULL
  ) INTO v_has_started_session;

  -- Live work: the call has to have begun. Async work: the engagement has
  -- to be under way. Before either, this would be price negotiation.
  IF NOT v_has_started_session AND v_status NOT IN ('working', 'delivered', 'assessed') THEN
    RAISE EXCEPTION
      'engagement % is %; a discount may only be given once the work has started',
      NEW.engagement_id, v_status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- After the money has moved there is nothing left to discount.
  IF v_status IN ('completed', 'refunded', 'cancelled') THEN
    RAISE EXCEPTION
      'engagement % is already %; the money has moved', NEW.engagement_id, v_status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_discount_allowed
  BEFORE INSERT OR UPDATE ON engagement_discounts
  FOR EACH ROW EXECUTE FUNCTION check_discount_allowed();
