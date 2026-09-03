-- ═══════════════════════════════════════════════════════════════════════
--  0047 — tell a provider the real reason a discount was refused
--
--  0045's trigger checked "has the work started?" before "has the money
--  already moved?". Both refuse a discount on a completed engagement, so
--  the rule held — but the message a provider got was "a discount may
--  only be given once the work has started" for an engagement that had
--  been finished and paid out. That is not merely unhelpful, it is wrong:
--  the work started, ran, and ended.
--
--  A refusal that misdescribes its own reason sends someone looking for
--  the wrong problem. Same checks, ordered so the first one that matches
--  is the one that is actually true.
-- ═══════════════════════════════════════════════════════════════════════

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

  -- FIRST: is there anything left to discount? A settled engagement is
  -- past every other question.
  IF v_status IN ('completed', 'refunded', 'cancelled') THEN
    RAISE EXCEPTION
      'engagement % is already %; the money has moved', NEW.engagement_id, v_status
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

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
