-- ═══════════════════════════════════════════════════════════════════════
--  0014 — the tier scale, and generic paid-work-eligibility flags
--
--  t0 (unverified, default) through t4. SPEC-PLATFORM.md itself uses this
--  scale in prose (§5: "t3 on answer_writing.gs.polity") and in the
--  example family manifest (§12: "minTierForPaidWork": "t2") — this
--  isn't an invented scale, just giving it a type.
--
--  The two new credential_types columns are how "serving officers can't
--  take paid work without departmental sanction" (§11) gets enforced
--  WITHOUT hardcoding "serving_officer" as a magic string anywhere in
--  core (CLAUDE.md: no credential types hardcoded in core). A family
--  manifest marks whichever credential type actually means that;
--  core only ever reads the two booleans.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TYPE mentor_tier AS ENUM ('t0', 't1', 't2', 't3', 't4');

ALTER TABLE credential_types ADD COLUMN requires_paid_work_sanction boolean NOT NULL DEFAULT false;
ALTER TABLE credential_types ADD COLUMN grants_paid_work_sanction   boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN credential_types.requires_paid_work_sanction IS
  'When a provider holds a VERIFIED credential of this type, paid work
   is blocked unless they also hold a verified credential with
   grants_paid_work_sanction = true. Generic on purpose — the family
   manifest decides which credential type this means (serving_officer,
   in the exam family); core never names it.';

COMMENT ON COLUMN credential_types.grants_paid_work_sanction IS
  'A verified credential of this type lifts the block from any
   requires_paid_work_sanction credential the same provider holds
   (departmental sanction, in the exam family).';
