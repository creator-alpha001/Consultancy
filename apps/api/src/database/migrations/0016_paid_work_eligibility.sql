-- ═══════════════════════════════════════════════════════════════════════
--  0016 — paid-work eligibility gate
--
--  SPEC-PLATFORM.md §11: "Conduct rules restrict serving government
--  officers from private paid work without departmental sanction.
--  Enforced by trigger: paid work auto-disables." Generic over which
--  credential type means what — core reads only the two flags from 0014.
-- ═══════════════════════════════════════════════════════════════════════

CREATE VIEW provider_paid_work_blocked AS
SELECT DISTINCT pc.provider_id
  FROM provider_credentials pc
  JOIN credential_types ct ON ct.id = pc.credential_type_id
 WHERE pc.status = 'verified'
   AND ct.requires_paid_work_sanction
   AND pc.provider_id NOT IN (
     SELECT pc2.provider_id
       FROM provider_credentials pc2
       JOIN credential_types ct2 ON ct2.id = pc2.credential_type_id
      WHERE pc2.status = 'verified' AND ct2.grants_paid_work_sanction
   );

COMMENT ON VIEW provider_paid_work_blocked IS
  'Providers holding a verified credential that requires sanction, with
   no verified credential that grants it. Not a stored/duplicated flag —
   computed live from provider_credentials so it can never drift out of
   sync with the credentials that actually justify it.';

CREATE OR REPLACE FUNCTION check_paid_work_eligibility() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'agreed' AND OLD.status = 'draft' AND NEW.amount_paise IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM provider_paid_work_blocked WHERE provider_id = NEW.provider_id) THEN
      RAISE EXCEPTION 'provider % cannot take paid work pending departmental sanction', NEW.provider_id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_engagement_paid_work_eligibility
  BEFORE UPDATE ON engagements
  FOR EACH ROW EXECUTE FUNCTION check_paid_work_eligibility();
