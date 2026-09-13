-- ═══════════════════════════════════════════════════════════════════════
--  0052 — a rate may state both promises, where the work makes both
--
--  0044 added `rate_commitment_single`: a rate may name a session length
--  OR a turnaround, never both, on the reasoning that "a session that is
--  60 minutes, returned in 3 days is two different products and nobody
--  could tell which they bought."
--
--  That reasoning holds for the four types that existed then. It stops
--  holding the moment a family offers work that genuinely IS both —
--  `review_with_live`, where a document is audited and returned by a
--  deadline AND a call follows to talk it through. That is
--  one product with two promises, not two products: one agenda, one
--  escrow, one release. A seeker buying it is told both numbers, and
--  neither is ambiguous because the type says which is which.
--
--  ── Why the check goes rather than gets an exception ────────────────
--
--  The obvious patch is `CHECK (... OR engagement_type = 'review_with_live')`.
--  That writes a family's engagement type into core DDL, which is
--  exactly what hard rule #1 forbids — and it would need editing again
--  for the next family that offers a combined format. SQL here cannot
--  know which types take which commitments, because that is manifest
--  data; so the rule moves to the one place that does know it,
--  `commitmentKindsFor` in verification/rates.service.ts, which decides
--  what a submitted commitment MEANS before it is ever stored.
--
--  What SQL keeps enforcing is what SQL can actually check: a stated
--  commitment is a positive whole number (the column checks from 0044
--  are untouched). Nothing is dropped that the type system and service
--  layer do not now cover, and no existing row changes meaning — every
--  rate written under the old rule still satisfies the new one.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE provider_rates DROP CONSTRAINT rate_commitment_single;

COMMENT ON COLUMN provider_rates.duration_minutes IS
  'How long the contact time is. Set for types whose promise includes
   time spent with the seeker. May be set alongside turnaround_hours
   for a combined type — which commitments a type takes is family data,
   resolved by commitmentKindsFor(), never by this column.';

COMMENT ON COLUMN provider_rates.turnaround_hours IS
  'How long until the work comes back. Set for types whose promise
   includes a deadline. May be set alongside duration_minutes for a
   combined type.';
