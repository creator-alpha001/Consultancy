#!/usr/bin/env bash
#
# M9 restore drill — SPEC-PLATFORM.md §18: "Restore verified."
#
# Backups nobody has restored are not backups. This script performs the
# whole cycle against a real database and, crucially, VERIFIES the
# restored copy rather than just checking that pg_restore exited 0:
#
#   1. dump the source database
#   2. restore it into a brand-new database
#   3. assert row counts match
#   4. assert the INVARIANTS survived — triggers, constraints and the
#      double-entry rule are re-tested on the restored copy
#
# Step 4 is the point. A restore that brings back rows but loses the
# trigger enforcing "no engagement enters a working state without escrow
# held AND agenda locked" has restored the data and lost the product.
#
# Usage:
#   ./scripts/restore-drill.sh                 # uses $DATABASE_URL
#   SOURCE_DB=sankalp_dev ./scripts/restore-drill.sh
#
set -euo pipefail

SOURCE_DB="${SOURCE_DB:-}"
PGHOST="${PGHOST:-localhost}"
PGUSER="${PGUSER:-sankalp}"
PGPASSWORD="${PGPASSWORD:-sankalp}"
export PGPASSWORD

# Derive the source database from DATABASE_URL when not given explicitly.
if [[ -z "$SOURCE_DB" ]]; then
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "error: set SOURCE_DB or DATABASE_URL" >&2
    exit 1
  fi
  SOURCE_DB="$(basename "${DATABASE_URL%%\?*}")"
fi

RESTORE_DB="${SOURCE_DB}_restore_drill"
DUMP_FILE="$(mktemp -t sankalp-drill-XXXXXX.dump)"
trap 'rm -f "$DUMP_FILE"' EXIT

psql_src() { psql -h "$PGHOST" -U "$PGUSER" -d "$SOURCE_DB" -tA -c "$1"; }
psql_dst() { psql -h "$PGHOST" -U "$PGUSER" -d "$RESTORE_DB" -tA -c "$1"; }

echo "── restore drill ─────────────────────────────────────────"
echo "source:  $SOURCE_DB"
echo "restore: $RESTORE_DB"
echo

# ── 1. Dump ───────────────────────────────────────────────────────────
echo "[1/4] dumping…"
pg_dump -h "$PGHOST" -U "$PGUSER" -d "$SOURCE_DB" -Fc -f "$DUMP_FILE"
echo "      $(du -h "$DUMP_FILE" | cut -f1) written"

# ── 2. Restore into a fresh database ──────────────────────────────────
echo "[2/4] restoring into a brand-new database…"
psql -h "$PGHOST" -U "$PGUSER" -d postgres -q -c "DROP DATABASE IF EXISTS ${RESTORE_DB};"
psql -h "$PGHOST" -U "$PGUSER" -d postgres -q -c "CREATE DATABASE ${RESTORE_DB} OWNER ${PGUSER};"
pg_restore -h "$PGHOST" -U "$PGUSER" -d "$RESTORE_DB" --no-owner --exit-on-error "$DUMP_FILE"

# ── 3. Row counts must match, table by table ──────────────────────────
echo "[3/4] comparing row counts…"
TABLES=$(psql_src "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;")
MISMATCH=0
for t in $TABLES; do
  src=$(psql_src "SELECT count(*) FROM \"$t\";")
  dst=$(psql_dst "SELECT count(*) FROM \"$t\";")
  if [[ "$src" != "$dst" ]]; then
    echo "      MISMATCH $t: source=$src restored=$dst"
    MISMATCH=1
  fi
done
if [[ "$MISMATCH" == "1" ]]; then
  echo "FAILED: row counts differ" >&2
  exit 1
fi
echo "      $(echo "$TABLES" | wc -l) tables, all counts match"

# ── 4. The invariants must have survived ──────────────────────────────
# Data without its guarantees is not a restored system.
echo "[4/4] verifying invariants on the RESTORED copy…"

check_fails() { # a statement that MUST be rejected
  local label="$1" sql="$2"
  if psql -h "$PGHOST" -U "$PGUSER" -d "$RESTORE_DB" -q -c "$sql" >/dev/null 2>&1; then
    echo "      LOST: $label was accepted on the restored copy" >&2
    return 1
  fi
  echo "      ok: $label still enforced"
}

FAILED=0

# The double-entry rule: an unbalanced transaction must still be refused.
check_fails "ledger sum-to-zero" "
  BEGIN;
  INSERT INTO ledger_accounts (type, owner_user_id, currency) VALUES ('escrow', NULL, 'XTS')
    ON CONFLICT DO NOTHING;
  WITH t AS (
    INSERT INTO ledger_transactions (reason, reference_type, reference_id, idempotency_key)
    VALUES ('drill', 'escrow', gen_random_uuid(), 'drill-' || gen_random_uuid()) RETURNING id
  )
  INSERT INTO ledger_entries (transaction_id, account_id, currency, amount_paise)
  SELECT t.id, (SELECT id FROM ledger_accounts WHERE currency='XTS' LIMIT 1), 'XTS', 1234 FROM t;
  COMMIT;" || FAILED=1

# Append-only ledger.
#
# This check must create its own row first. A bare DELETE against an
# empty table affects zero rows, so the row-level trigger never fires and
# the statement "succeeds" — which an earlier version of this drill
# reported as a lost guarantee on a perfectly good restore. The check has
# to give the trigger something to refuse.
check_fails "ledger append-only" "
  BEGIN;
  INSERT INTO ledger_accounts (type, owner_user_id, currency) VALUES ('escrow', NULL, 'XTS')
    ON CONFLICT DO NOTHING;
  INSERT INTO ledger_accounts (type, owner_user_id, currency) VALUES ('reserve', NULL, 'XTS')
    ON CONFLICT DO NOTHING;
  WITH t AS (
    INSERT INTO ledger_transactions (reason, reference_type, reference_id, idempotency_key)
    VALUES ('drill-appendonly', 'escrow', gen_random_uuid(), 'drill-ao-' || gen_random_uuid()) RETURNING id
  ), ins AS (
    INSERT INTO ledger_entries (transaction_id, account_id, currency, amount_paise)
    SELECT t.id, a.id, 'XTS', v.amt
      FROM t,
           LATERAL (VALUES (-4321::bigint, 'escrow'), (4321::bigint, 'reserve')) AS v(amt, acct),
           LATERAL (SELECT id FROM ledger_accounts WHERE currency='XTS' AND type = v.acct::ledger_account_type LIMIT 1) a
    RETURNING transaction_id
  )
  SELECT 1 FROM ins LIMIT 1;
  -- Now the table has rows this transaction can try to remove.
  DELETE FROM ledger_entries WHERE currency = 'XTS';
  COMMIT;" || FAILED=1

# CLAUDE.md #32 — 2FA mandatory for providers/admins.
#
# Creates its own provider rather than selecting an existing one: an
# INSERT..SELECT that matches no rows succeeds vacuously, which an
# earlier version of this drill mis-reported as a lost guarantee. Every
# check here must give the trigger something real to refuse.
check_fails "mandatory 2FA on sessions" "
  BEGIN;
  WITH u AS (
    INSERT INTO users (email, role, adult_confirmed_at)
    VALUES ('drill-' || gen_random_uuid() || '@drill.local', 'provider', now())
    RETURNING id
  )
  INSERT INTO user_sessions (user_id, token_hash, mfa_satisfied, expires_at)
  SELECT u.id, repeat('0', 64), false, now() + interval '1 hour' FROM u;
  COMMIT;" || FAILED=1

# CLAUDE.md #27 — 18+, on the same principle.
check_fails "18+ attestation on sessions" "
  BEGIN;
  WITH u AS (
    INSERT INTO users (email, role) -- no adult_confirmed_at
    VALUES ('drill-' || gen_random_uuid() || '@drill.local', 'seeker')
    RETURNING id
  )
  INSERT INTO user_sessions (user_id, token_hash, mfa_satisfied, expires_at)
  SELECT u.id, repeat('1', 64), false, now() + interval '1 hour' FROM u;
  COMMIT;" || FAILED=1

# Verify the triggers themselves are physically present.
TRIGGER_COUNT=$(psql_dst "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal;")
SRC_TRIGGER_COUNT=$(psql_src "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal;")
if [[ "$TRIGGER_COUNT" != "$SRC_TRIGGER_COUNT" ]]; then
  echo "      LOST: trigger count differs (source=$SRC_TRIGGER_COUNT restored=$TRIGGER_COUNT)" >&2
  FAILED=1
else
  echo "      ok: all $TRIGGER_COUNT triggers present"
fi

# And the migration ledger, so the restored copy knows what it is.
SRC_MIGRATIONS=$(psql_src "SELECT count(*) FROM schema_migrations;")
DST_MIGRATIONS=$(psql_dst "SELECT count(*) FROM schema_migrations;")
if [[ "$SRC_MIGRATIONS" != "$DST_MIGRATIONS" ]]; then
  echo "      LOST: schema_migrations differs" >&2
  FAILED=1
else
  echo "      ok: $DST_MIGRATIONS migrations recorded"
fi

echo
if [[ "$FAILED" == "1" ]]; then
  echo "RESTORE DRILL FAILED — the data came back but its guarantees did not." >&2
  exit 1
fi

echo "RESTORE DRILL PASSED"
echo "  restored copy left in place as '${RESTORE_DB}' for inspection."
echo "  drop it with: dropdb ${RESTORE_DB}"
