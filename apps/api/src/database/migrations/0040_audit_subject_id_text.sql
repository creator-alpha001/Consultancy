-- ═══════════════════════════════════════════════════════════════════════
--  0040 — the audit log can finally name a domain
--
--  `audit_log.subject_id` was declared `uuid`. Most subjects in this
--  system are uuid-keyed — an escrow, a dispute, a user — so that held
--  right up until something recorded a decision about a DOMAIN, which is
--  keyed by code ('upsc_cse', 'india_gst') because a pack is authored by
--  hand and its code is the thing a person writes.
--
--  The result was silent and total: `AuditService.record` swallows its
--  own failure by design, so every domain and family decision was logged
--  as an error line and dropped. At the time of this migration all 30
--  such rows that DID land carry a null subject_id, which is the same
--  loss wearing a nicer face — the log knows a domain was published and
--  cannot say which.
--
--  That is not an edge case. family -> domain -> category is the
--  architecture (SPEC-PLATFORM.md §3), so an audit log that can only name
--  uuid-keyed subjects cannot record decisions about the platform's own
--  central abstraction. #14 says every consequential decision is
--  auditable; opening a domain to the public is one.
--
--  Widening to `text` rather than adding a second column: two nullable
--  columns for "which thing" would mean every reader has to remember to
--  check both, and the one that forgets reports a gap that is not there.
--  A uuid casts to text losslessly and compares identically, so existing
--  rows and every query over them are unaffected — `subject_id = $1` with
--  a uuid string still matches exactly the rows it matched before.
--
--  The append-only trigger from 0033 guards UPDATE and DELETE on rows. It
--  does not block this ALTER, and must not be dropped to run it: the
--  history stays as immutable after this migration as before.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE audit_log
  ALTER COLUMN subject_id TYPE text USING subject_id::text;

COMMENT ON COLUMN audit_log.subject_id IS
  'Identifier of the thing acted on, as text. A uuid for most subjects; a
   pack code for a domain or family, which are keyed by code rather than
   by uuid. Text so that both fit in one column — see migration 0040.';

-- Rebuilt implicitly by the type change, but stated so the intent is
-- visible: lookups are still "everything that happened to this subject".
REINDEX INDEX audit_log_subject_idx;
