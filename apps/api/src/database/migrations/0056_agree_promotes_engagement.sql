-- ═══════════════════════════════════════════════════════════════════════
--  0056 — agreeing terms is the third event that can complete #12
--
--  `try_promote_engagement_to_working` (0010) moves an `agreed` engagement
--  to `working` once its agenda is locked and its escrow is held. It was
--  called from two places: the escrow reaching `held` (0010) and the
--  agenda being locked (0011). Both assumed the engagement was already
--  `agreed` when the second of them happened.
--
--  A package draw breaks that assumption. It holds the escrow while the
--  engagement is still a `draft` (the money is already the seeker's, in
--  their wallet), and the agenda can be locked before terms are agreed.
--  Then `agree` moves draft → agreed with both preconditions already met,
--  nothing re-checks them, and the engagement sits in `agreed` for ever:
--  paid, locked, and refusing the seeker's work.
--
--  So agreeing is now a promotion event too. The rule itself is unchanged
--  and still decided in one function; this only adds the missing caller,
--  and repairs any engagement already stranded that way.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION on_engagement_agreed_promote() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'agreed' AND OLD.status IS DISTINCT FROM 'agreed' THEN
    PERFORM try_promote_engagement_to_working(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_engagement_agreed_promotes
  AFTER UPDATE OF status ON engagements
  FOR EACH ROW EXECUTE FUNCTION on_engagement_agreed_promote();

-- Already stranded: agreed, agenda locked, escrow held.
SELECT try_promote_engagement_to_working(e.id)
  FROM engagements e
 WHERE e.status = 'agreed';
